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

const { TABLES, SCHEMA_VERSION } = require('./schema');

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
  const meta = get('SELECT last_insert_rowid() AS id, changes() AS changes');
  return { id: meta ? meta.id : null, changes: meta ? meta.changes : 0 };
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

function restoreFrom(sourcePath) {
  const candidate = new SQL.Database(fs.readFileSync(sourcePath));
  try {
    candidate.run('SELECT COUNT(*) FROM config;').getAsObject;
  } catch {
    candidate.close();
    throw new Error('El archivo seleccionado no es una base de datos valida de Fluxo.');
  }
  candidate.close();

  if (db) db.close();
  dirty = false;
  fs.copyFileSync(sourcePath, dbPath);
  db = new SQL.Database(fs.readFileSync(dbPath));
  db.run('PRAGMA foreign_keys = ON;');
  for (const stmt of TABLES) db.run(stmt);
  return true;
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
