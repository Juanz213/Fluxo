'use strict';

/**
 * Esquema de base de datos (SQLite via sql.js).
 * Cada sentencia es idempotente para permitir migraciones incrementales.
 */

const SCHEMA_VERSION = 2;

/**
 * Migraciones incrementales, indexadas por la version de DESTINO.
 *
 * COMO ANADIR UNA MIGRACION:
 *   1. Sube SCHEMA_VERSION (por ejemplo a 3).
 *   2. Ajusta TABLES para que las bases NUEVAS ya nazcan con el cambio.
 *   3. Registra aqui MIGRACIONES[3] con las sentencias (ALTER TABLE ...) que
 *      llevan una base EXISTENTE de la version anterior a la 3. Usa una lista
 *      vacia ([]) si el cambio no toca columnas fisicas.
 *
 * El motor (src/main/db/database.js) lee PRAGMA user_version, aplica en orden
 * las migraciones pendientes y al terminar sella la version actual.
 */
const MIGRACIONES = {
  // v2 anadio las tablas de proveedores y gastos. Se crean con TABLES
  // (CREATE TABLE IF NOT EXISTS), por lo que no hace falta ALTER aqui.
  2: [],
};

const TABLES = [
  /* ------------------------------------------------------------------ */
  /* Configuracion clave/valor                                          */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS config (
      clave      TEXT PRIMARY KEY,
      valor      TEXT,
      updated_at TEXT
   )`,

  /* ------------------------------------------------------------------ */
  /* Asesores comerciales                                               */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS asesores (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo        TEXT    NOT NULL UNIQUE,
      nombre        TEXT    NOT NULL,
      documento     TEXT,
      email         TEXT,
      telefono      TEXT,
      zona          TEXT,
      comision_pct  REAL    NOT NULL DEFAULT 0,
      meta_mensual  REAL    NOT NULL DEFAULT 0,
      fecha_ingreso TEXT,
      activo        INTEGER NOT NULL DEFAULT 1,
      notas         TEXT,
      busqueda      TEXT,
      created_at    TEXT,
      updated_at    TEXT
   )`,

  /* ------------------------------------------------------------------ */
  /* Clientes                                                           */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS clientes (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo           TEXT    NOT NULL UNIQUE,
      tipo_persona     TEXT    NOT NULL DEFAULT 'Juridica',
      tipo_documento   TEXT    NOT NULL DEFAULT 'NIT',
      nit              TEXT,
      dv               TEXT,
      nombre           TEXT    NOT NULL,
      nombre_comercial TEXT,
      contacto         TEXT,
      email            TEXT,
      telefono         TEXT,
      direccion        TEXT,
      ciudad           TEXT,
      departamento     TEXT,
      regimen          TEXT    DEFAULT 'Responsable de IVA',
      asesor_id        INTEGER REFERENCES asesores(id) ON DELETE SET NULL,
      cupo_credito     REAL    NOT NULL DEFAULT 0,
      dias_credito     INTEGER NOT NULL DEFAULT 0,
      activo           INTEGER NOT NULL DEFAULT 1,
      notas            TEXT,
      busqueda         TEXT,
      created_at       TEXT,
      updated_at       TEXT
   )`,

  /* ------------------------------------------------------------------ */
  /* Catalogo                                                           */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS categorias (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre      TEXT    NOT NULL UNIQUE,
      descripcion TEXT,
      activo      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT,
      updated_at  TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS productos (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo        TEXT    NOT NULL UNIQUE,
      nombre        TEXT    NOT NULL,
      descripcion   TEXT,
      categoria_id  INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
      tipo          TEXT    NOT NULL DEFAULT 'Producto',
      unidad        TEXT    NOT NULL DEFAULT 'UND',
      precio        REAL    NOT NULL DEFAULT 0,
      iva_pct       REAL    NOT NULL DEFAULT 19,
      costo         REAL    NOT NULL DEFAULT 0,
      stock         REAL    NOT NULL DEFAULT 0,
      stock_minimo  REAL    NOT NULL DEFAULT 0,
      activo        INTEGER NOT NULL DEFAULT 1,
      busqueda      TEXT,
      created_at    TEXT,
      updated_at    TEXT
   )`,

  /* ------------------------------------------------------------------ */
  /* Cotizaciones                                                       */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS cotizaciones (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      prefijo           TEXT    NOT NULL,
      anio              INTEGER NOT NULL,
      consecutivo       INTEGER NOT NULL,
      numero            TEXT    NOT NULL UNIQUE,
      cliente_id        INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
      asesor_id         INTEGER REFERENCES asesores(id) ON DELETE SET NULL,
      fecha             TEXT    NOT NULL,
      validez_dias      INTEGER NOT NULL DEFAULT 30,
      fecha_vencimiento TEXT,
      estado            TEXT    NOT NULL DEFAULT 'Borrador',
      subtotal          REAL    NOT NULL DEFAULT 0,
      descuento_pct     REAL    NOT NULL DEFAULT 0,
      descuento_valor   REAL    NOT NULL DEFAULT 0,
      iva_valor         REAL    NOT NULL DEFAULT 0,
      total             REAL    NOT NULL DEFAULT 0,
      condicion_pago    TEXT,
      observaciones     TEXT,
      motivo_perdida    TEXT,
      factura_id        INTEGER,
      created_at        TEXT,
      updated_at        TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS cotizacion_items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      cotizacion_id    INTEGER NOT NULL REFERENCES cotizaciones(id) ON DELETE CASCADE,
      producto_id      INTEGER REFERENCES productos(id) ON DELETE SET NULL,
      codigo           TEXT,
      descripcion      TEXT    NOT NULL,
      unidad           TEXT    DEFAULT 'UND',
      cantidad         REAL    NOT NULL DEFAULT 1,
      precio_unitario  REAL    NOT NULL DEFAULT 0,
      descuento_pct    REAL    NOT NULL DEFAULT 0,
      iva_pct          REAL    NOT NULL DEFAULT 19,
      subtotal         REAL    NOT NULL DEFAULT 0,
      iva_valor        REAL    NOT NULL DEFAULT 0,
      total            REAL    NOT NULL DEFAULT 0,
      orden            INTEGER NOT NULL DEFAULT 0
   )`,

  /* ------------------------------------------------------------------ */
  /* Facturas                                                           */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS facturas (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      prefijo           TEXT    NOT NULL,
      anio              INTEGER NOT NULL,
      consecutivo       INTEGER NOT NULL,
      numero            TEXT    NOT NULL UNIQUE,
      cotizacion_id     INTEGER REFERENCES cotizaciones(id) ON DELETE SET NULL,
      cliente_id        INTEGER NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
      asesor_id         INTEGER REFERENCES asesores(id) ON DELETE SET NULL,
      fecha             TEXT    NOT NULL,
      fecha_vencimiento TEXT,
      estado            TEXT    NOT NULL DEFAULT 'Emitida',
      subtotal          REAL    NOT NULL DEFAULT 0,
      descuento_pct     REAL    NOT NULL DEFAULT 0,
      descuento_valor   REAL    NOT NULL DEFAULT 0,
      iva_valor         REAL    NOT NULL DEFAULT 0,
      retencion_pct     REAL    NOT NULL DEFAULT 0,
      retencion_valor   REAL    NOT NULL DEFAULT 0,
      total             REAL    NOT NULL DEFAULT 0,
      forma_pago        TEXT    DEFAULT 'Transferencia',
      observaciones     TEXT,
      anulada_motivo    TEXT,
      created_at        TEXT,
      updated_at        TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS factura_items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id       INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
      producto_id      INTEGER REFERENCES productos(id) ON DELETE SET NULL,
      codigo           TEXT,
      descripcion      TEXT    NOT NULL,
      unidad           TEXT    DEFAULT 'UND',
      cantidad         REAL    NOT NULL DEFAULT 1,
      precio_unitario  REAL    NOT NULL DEFAULT 0,
      descuento_pct    REAL    NOT NULL DEFAULT 0,
      iva_pct          REAL    NOT NULL DEFAULT 19,
      subtotal         REAL    NOT NULL DEFAULT 0,
      iva_valor        REAL    NOT NULL DEFAULT 0,
      total            REAL    NOT NULL DEFAULT 0,
      orden            INTEGER NOT NULL DEFAULT 0
   )`,

  /* ------------------------------------------------------------------ */
  /* Pagos / recaudo                                                    */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS pagos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id  INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
      fecha       TEXT    NOT NULL,
      monto       REAL    NOT NULL DEFAULT 0,
      metodo      TEXT    DEFAULT 'Transferencia',
      referencia  TEXT,
      notas       TEXT,
      created_at  TEXT
   )`,

  /* ------------------------------------------------------------------ */
  /* Proveedores                                                        */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS proveedores (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo        TEXT    NOT NULL UNIQUE,
      nombre        TEXT    NOT NULL,
      nit           TEXT,
      dv            TEXT,
      contacto      TEXT,
      email         TEXT,
      telefono      TEXT,
      direccion     TEXT,
      ciudad        TEXT,
      departamento  TEXT,
      notas         TEXT,
      activo        INTEGER NOT NULL DEFAULT 1,
      busqueda      TEXT,
      created_at    TEXT,
      updated_at    TEXT
   )`,

  /* ------------------------------------------------------------------ */
  /* Gastos / compras a proveedores                                     */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS gastos (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      prefijo           TEXT    NOT NULL,
      anio              INTEGER NOT NULL,
      consecutivo       INTEGER NOT NULL,
      numero            TEXT    NOT NULL UNIQUE,
      proveedor_id      INTEGER NOT NULL REFERENCES proveedores(id) ON DELETE RESTRICT,
      fecha             TEXT    NOT NULL,
      fecha_vencimiento TEXT,
      estado            TEXT    NOT NULL DEFAULT 'Pendiente',
      categoria         TEXT,
      subtotal          REAL    NOT NULL DEFAULT 0,
      descuento_pct     REAL    NOT NULL DEFAULT 0,
      descuento_valor   REAL    NOT NULL DEFAULT 0,
      iva_valor         REAL    NOT NULL DEFAULT 0,
      retencion_pct     REAL    NOT NULL DEFAULT 0,
      retencion_valor   REAL    NOT NULL DEFAULT 0,
      total             REAL    NOT NULL DEFAULT 0,
      forma_pago        TEXT    DEFAULT 'Transferencia',
      observaciones     TEXT,
      anulada_motivo    TEXT,
      created_at        TEXT,
      updated_at        TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS gasto_items (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      gasto_id         INTEGER NOT NULL REFERENCES gastos(id) ON DELETE CASCADE,
      producto_id      INTEGER REFERENCES productos(id) ON DELETE SET NULL,
      codigo           TEXT,
      descripcion      TEXT    NOT NULL,
      unidad           TEXT    DEFAULT 'UND',
      cantidad         REAL    NOT NULL DEFAULT 1,
      precio_unitario  REAL    NOT NULL DEFAULT 0,
      descuento_pct    REAL    NOT NULL DEFAULT 0,
      iva_pct          REAL    NOT NULL DEFAULT 19,
      subtotal         REAL    NOT NULL DEFAULT 0,
      iva_valor        REAL    NOT NULL DEFAULT 0,
      total            REAL    NOT NULL DEFAULT 0,
      orden            INTEGER NOT NULL DEFAULT 0
   )`,

  `CREATE TABLE IF NOT EXISTS pagos_gasto (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      gasto_id    INTEGER NOT NULL REFERENCES gastos(id) ON DELETE CASCADE,
      fecha       TEXT    NOT NULL,
      monto       REAL    NOT NULL DEFAULT 0,
      metodo      TEXT    DEFAULT 'Transferencia',
      referencia  TEXT,
      notas       TEXT,
      created_at  TEXT
   )`,

  /* ------------------------------------------------------------------ */
  /* Inventario                                                         */
  /* ------------------------------------------------------------------ */
  `CREATE TABLE IF NOT EXISTS movimientos_inventario (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      producto_id  INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      tipo         TEXT    NOT NULL,
      cantidad     REAL    NOT NULL DEFAULT 0,
      saldo        REAL    NOT NULL DEFAULT 0,
      motivo       TEXT,
      referencia   TEXT,
      fecha        TEXT,
      created_at   TEXT
   )`,

  /* ------------------------------------------------------------------ */
  /* Indices                                                            */
  /* ------------------------------------------------------------------ */
  `CREATE INDEX IF NOT EXISTS idx_clientes_nombre    ON clientes(nombre)`,
  `CREATE INDEX IF NOT EXISTS idx_clientes_busqueda  ON clientes(busqueda)`,
  `CREATE INDEX IF NOT EXISTS idx_clientes_asesor    ON clientes(asesor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_asesores_busqueda  ON asesores(busqueda)`,
  `CREATE INDEX IF NOT EXISTS idx_productos_codigo   ON productos(codigo)`,
  `CREATE INDEX IF NOT EXISTS idx_productos_busqueda ON productos(busqueda)`,
  `CREATE INDEX IF NOT EXISTS idx_cot_cliente        ON cotizaciones(cliente_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cot_asesor         ON cotizaciones(asesor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_cot_fecha          ON cotizaciones(fecha)`,
  `CREATE INDEX IF NOT EXISTS idx_cot_estado         ON cotizaciones(estado)`,
  `CREATE INDEX IF NOT EXISTS idx_cotitems_cot       ON cotizacion_items(cotizacion_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fac_cliente        ON facturas(cliente_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fac_asesor         ON facturas(asesor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fac_fecha          ON facturas(fecha)`,
  `CREATE INDEX IF NOT EXISTS idx_fac_estado         ON facturas(estado)`,
  `CREATE INDEX IF NOT EXISTS idx_facitems_fac       ON factura_items(factura_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pagos_factura      ON pagos(factura_id)`,
  `CREATE INDEX IF NOT EXISTS idx_movinv_producto    ON movimientos_inventario(producto_id)`,
  `CREATE INDEX IF NOT EXISTS idx_prov_busqueda      ON proveedores(busqueda)`,
  `CREATE INDEX IF NOT EXISTS idx_gastos_proveedor   ON gastos(proveedor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gastos_fecha       ON gastos(fecha)`,
  `CREATE INDEX IF NOT EXISTS idx_gastos_estado      ON gastos(estado)`,
  `CREATE INDEX IF NOT EXISTS idx_gastoitems_gasto   ON gasto_items(gasto_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pagosgasto_gasto   ON pagos_gasto(gasto_id)`,
];

module.exports = { TABLES, SCHEMA_VERSION, MIGRACIONES };
