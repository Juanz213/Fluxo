'use strict';

/**
 * Capa de acceso a datos.
 *
 * Usa SQLite real (compilado a WebAssembly con sql.js) para no depender de
 * modulos nativos: el .exe resultante es 100% portable y no necesita
 * Visual Studio Build Tools ni recompilacion contra Electron.
 *
 * El archivo .db se mantiene en memoria y se persiste a disco de forma
 * diferida (debounce) + volcado sincrono al cerrar la aplicacion.
 */

const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');

const { TABLES, SCHEMA_VERSION, MIGRACIONES } = require('./schema');

let SQL = null;
let db = null;
let dbPath = null;
let saveTimer = null;
let dirty = false;

/* -------------------------------------------------------------------- */
/* Utilidades                                                            */
/* -------------------------------------------------------------------- */

/** Marca de tiempo local en formato 'YYYY-MM-DD HH:MM:SS'. */
function now() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ` +
    `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  );
}

/** Fecha local en formato 'YYYY-MM-DD'. */
function today() {
  return now().slice(0, 10);
}

/** Version de esquema grabada en el archivo (PRAGMA user_version). */
function userVersion() {
  const res = db.exec('PRAGMA user_version;');
  return res.length && res[0].values.length ? Number(res[0].values[0][0]) || 0 : 0;
}

/**
 * Aplica las migraciones pendientes y sella la version actual.
 * El formato de MIGRACIONES esta documentado en src/main/db/schema.js.
 */
function migrar() {
  const desde = userVersion();
  if (desde >= SCHEMA_VERSION) return desde;
  for (let version = desde + 1; version <= SCHEMA_VERSION; version += 1) {
    for (const sentencia of MIGRACIONES[version] || []) db.run(sentencia);
  }
  db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return SCHEMA_VERSION;
}

function resolveWasm() {
  // require.resolve apunta a node_modules/sql.js/dist/sql-wasm.js
  return path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
}

/* -------------------------------------------------------------------- */
/* Ciclo de vida                                                         */
/* -------------------------------------------------------------------- */

async function open(userDataDir) {
  const dir = path.join(userDataDir, 'data');
  fs.mkdirSync(dir, { recursive: true });
  dbPath = path.join(dir, 'fluxo.db');

  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(resolveWasm()) });

  const isNew = !fs.existsSync(dbPath);
  db = isNew ? new SQL.Database() : new SQL.Database(fs.readFileSync(dbPath));

  db.run('PRAGMA foreign_keys = ON;');
  for (const stmt of TABLES) db.run(stmt);
  migrar();

  return { isNew, dbPath, schemaVersion: SCHEMA_VERSION };
}

function close() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  flush();
  if (db) {
    try {
      db.close();
    } catch {
      /* noop */
    }
    db = null;
  }
}

/* -------------------------------------------------------------------- */
/* Persistencia                                                          */
/* -------------------------------------------------------------------- */

function markDirty() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flush();
  }, 400);
}

/** Vuelca la base en memoria al disco de forma atomica (tmp + rename). */
function flush() {
  if (!dirty || !db || !dbPath) return;
  const data = Buffer.from(db.export());
  const tmp = `${dbPath}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, dbPath);
  dirty = false;
}

/* -------------------------------------------------------------------- */
/* Consultas                                                             */
/* -------------------------------------------------------------------- */

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params && params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows.map(normalize);
  } finally {
    stmt.free();
  }
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = []) {
  db.run(sql, params);
  markDirty();
  const changes = db.getRowsModified();
  // last_insert_rowid solo tiene sentido tras un INSERT: asi evitamos una
  // consulta extra en cada UPDATE/DELETE dentro de una transaccion.
  const id = /^\s*insert\b/i.test(sql) ? get('SELECT last_insert_rowid() AS id')?.id ?? null : null;
  return { id, changes };
}

function exec(sql) {
  db.run(sql);
  markDirty();
}

/**
 * sql.js devuelve objetos con prototipo nulo; los pasamos a objetos planos
 * para que puedan serializarse por IPC sin sorpresas.
 */
function normalize(row) {
  const out = {};
  for (const k of Object.keys(row)) out[k] = row[k];
  return out;
}

function transaction(fn) {
  db.run('BEGIN');
  try {
    const result = fn();
    db.run('COMMIT');
    markDirty();
    return result;
  } catch (err) {
    try {
      db.run('ROLLBACK');
    } catch {
      /* noop */
    }
    throw err;
  }
}

/* -------------------------------------------------------------------- */
/* Respaldo / restauracion                                               */
/* -------------------------------------------------------------------- */

function backupTo(targetPath) {
  flush();
  fs.copyFileSync(dbPath, targetPath);
  return targetPath;
}

/** Tablas minimas que debe contener un archivo para considerarlo de Fluxo. */
const TABLAS_ESPERADAS = ['config', 'clientes', 'cotizaciones', 'facturas', 'productos'];

/** Verifica integridad y forma de un archivo antes de restaurarlo. */
function validarRespaldo(sourcePath) {
  const candidato = new SQL.Database(fs.readFileSync(sourcePath));
  try {
    const check = candidato.exec('PRAGMA quick_check;');
    const estado = check.length && check[0].values.length ? String(check[0].values[0][0]).toLowerCase() : '';
    if (estado !== 'ok') {
      throw new Error('El archivo no supera la verificacion de integridad de SQLite.');
    }

    const faltantes = TABLAS_ESPERADAS.filter((tabla) => {
      const res = candidato.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${tabla}';`);
      return !(res.length && res[0].values.length);
    });
    if (faltantes.length) {
      throw new Error(
        `El archivo seleccionado no es una base de datos de Fluxo (faltan tablas: ${faltantes.join(', ')}).`,
      );
    }
  } finally {
    candidato.close();
  }
}

function restoreFrom(sourcePath) {
  // Se valida ANTES de tocar la base activa: si el archivo es invalido, la
  // aplicacion sigue funcionando sin cambios.
  validarRespaldo(sourcePath);

  const respaldoTemporal = `${dbPath}.restore`;
  try {
    // Guarda el estado actual para poder volver atras si algo falla a mitad.
    if (db) {
      flush();
      fs.copyFileSync(dbPath, respaldoTemporal);
      db.close();
      db = null;
    }

    fs.copyFileSync(sourcePath, dbPath);
    db = new SQL.Database(fs.readFileSync(dbPath));
    db.run('PRAGMA foreign_keys = ON;');
    for (const stmt of TABLES) db.run(stmt);
    migrar();
    fs.rmSync(respaldoTemporal, { force: true });
    return true;
  } catch (error) {
    // Reabre la base previa para no dejar la aplicacion sin datos.
    try {
      if (fs.existsSync(respaldoTemporal)) {
        fs.copyFileSync(respaldoTemporal, dbPath);
        fs.rmSync(respaldoTemporal, { force: true });
      }
      db = new SQL.Database(fs.readFileSync(dbPath));
      db.run('PRAGMA foreign_keys = ON;');
    } catch {
      /* si tampoco se puede reabrir, se propaga el error original */
    }
    throw new Error(`No se pudo restaurar el respaldo: ${error.message}`);
  }
}

function filePath() {
  return dbPath;
}

module.exports = {
  open,
  close,
  flush,
  all,
  get,
  run,
  exec,
  transaction,
  now,
  today,
  backupTo,
  restoreFrom,
  filePath,
};
