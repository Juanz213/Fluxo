'use strict';

const db = require('../db/database');
const { SCHEMA_VERSION } = require('../db/schema');
const { setDecimals } = require('../lib/money');

/**
 * Valores por defecto. Se escriben en la base la primera vez que se abre la
 * aplicacion y sirven como respaldo si una clave desaparece.
 */
const DEFAULTS = {
  schema_version: String(SCHEMA_VERSION),

  empresa_nombre: 'Mi Empresa S.A.S.',
  empresa_nit: '',
  empresa_dv: '',
  empresa_direccion: '',
  empresa_ciudad: 'Bogota D.C.',
  empresa_departamento: 'Cundinamarca',
  empresa_telefono: '',
  empresa_email: '',
  empresa_web: '',
  empresa_logo: '',

  moneda: 'COP',
  simbolo: '$',
  locale: 'es-CO',
  decimales: '0',
  iva_default: '19',

  /* Apariencia */
  tema: 'claro',
  acento: 'azul',
  sidebar_colapsado: '0',

  /* Listas configurables (JSON) */
  metodos_pago: '["Efectivo","Transferencia","Tarjeta","Cheque","Otro"]',
  condiciones_pago: '["Contado","Credito 15 dias","Credito 30 dias","Credito 45 dias","Credito 60 dias","Cuenta por cobrar"]',
  categorias_gasto: '["Arriendo","Servicios publicos","Nomina","Proveedores","Papeleria","Transporte","Otros"]',

  cot_prefijo: 'COT',
  fac_prefijo: 'FAC',
  gas_prefijo: 'CMP',
  cot_validez_dias: '30',
  cot_alerta_dias: '15',
  fac_dias_credito: '30',
  gas_dias_credito: '30',

  leyenda_documento:
    'Documento de control interno. No equivale a factura electronica de venta (DIAN).',
  pie_documento: 'Gracias por su preferencia.',

  alerta_cartera_dias: '30',
  meta_anual: '0',
  backup_automatico: '1',
  ultimo_respaldo: '',
};

function seed() {
  const ts = db.now();
  db.transaction(() => {
    for (const [clave, valor] of Object.entries(DEFAULTS)) {
      db.run(
        'INSERT OR IGNORE INTO config (clave, valor, updated_at) VALUES (?, ?, ?)',
        [clave, valor, ts],
      );
    }
  });
}

function all() {
  const rows = db.all('SELECT clave, valor FROM config');
  const out = { ...DEFAULTS };
  for (const row of rows) out[row.clave] = row.valor;
  applySideEffects(out);
  return out;
}

function get(clave, fallback) {
  const row = db.get('SELECT valor FROM config WHERE clave = ?', [clave]);
  if (row) return row.valor;
  return fallback !== undefined ? fallback : DEFAULTS[clave];
}

function num(clave, fallback = 0) {
  const value = Number(get(clave, fallback));
  return Number.isFinite(value) ? value : fallback;
}

/** Lee una lista guardada como JSON en config; devuelve un arreglo seguro. */
function lista(clave, respaldo = []) {
  try {
    const valor = JSON.parse(get(clave, ''));
    return Array.isArray(valor) ? valor.filter((v) => String(v).trim() !== '') : respaldo;
  } catch {
    return respaldo;
  }
}

function set(clave, valor) {
  db.run(
    `INSERT INTO config (clave, valor, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = excluded.updated_at`,
    [clave, valor === null || valor === undefined ? '' : String(valor), db.now()],
  );
  if (clave === 'decimales') setDecimals(Number(valor));
}

function setMany(patch) {
  db.transaction(() => {
    for (const [clave, valor] of Object.entries(patch)) set(clave, valor);
  });
  return all();
}

/** Sincroniza el numero de decimales con el redondeo global. */
function applySideEffects(values) {
  setDecimals(Number(values.decimales ?? 0));
}

/** Inicializa valores por defecto y el redondeo global. */
function bootstrap() {
  seed();
  // Mantiene config.schema_version alineada con la version real del esquema
  // (bases antiguas podian haber guardado una version anterior).
  if (get('schema_version') !== String(SCHEMA_VERSION)) set('schema_version', String(SCHEMA_VERSION));
  const values = all();
  return values;
}

module.exports = { DEFAULTS, bootstrap, all, get, num, lista, set, setMany, seed };
