'use strict';

const db = require('../db/database');
const { normalize, like } = require('../lib/money');

/**
 * Proveedores: contraparte de las facturas de gasto (compras).
 * Se mantiene sencillo: datos de contacto y saldos por pagar.
 */

const SALDO_EXPR = `
  (SELECT COALESCE(SUM(g.total - (SELECT COALESCE(SUM(pg.monto), 0)
                                    FROM pagos_gasto pg WHERE pg.gasto_id = g.id)), 0)
     FROM gastos g
    WHERE g.proveedor_id = p.id AND g.estado NOT IN ('Anulada', 'Pagada'))`;
const COMPRADO_SQL = `
  (SELECT COALESCE(SUM(g.total), 0) FROM gastos g
    WHERE g.proveedor_id = p.id AND g.estado <> 'Anulada') AS comprado_total`;

const SELECT_BASE = `
  SELECT p.*, ${COMPRADO_SQL}, ${SALDO_EXPR} AS saldo
    FROM proveedores p
`;

function decorate(row) {
  if (!row) return row;
  return { ...row, activo: Number(row.activo) === 1 };
}

function list({ q = '', activo = null, ciudad = '', conSaldo = false, sort = 'nombre', dir = 'asc' } = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('p.busqueda LIKE ?');
    params.push(like(q));
  }
  if (ciudad) {
    where.push('p.ciudad = ?');
    params.push(ciudad);
  }
  if (activo === true || activo === 'true') where.push('p.activo = 1');
  if (activo === false || activo === 'false') where.push('p.activo = 0');
  if (conSaldo) where.push(`${SALDO_EXPR} > 0`);

  const columnas = {
    nombre: 'p.nombre',
    codigo: 'p.codigo',
    ciudad: 'p.ciudad',
    saldo: 'saldo',
    comprado_total: 'comprado_total',
    created_at: 'p.created_at',
  };
  const orderBy = columnas[sort] || columnas.nombre;
  const direction = String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  return db
    .all(`${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${orderBy} ${direction}`, params)
    .map(decorate);
}

function get(id) {
  return decorate(db.get(`${SELECT_BASE} WHERE p.id = ?`, [id]));
}

function ciudades() {
  return db
    .all("SELECT DISTINCT ciudad FROM proveedores WHERE ciudad IS NOT NULL AND ciudad <> '' ORDER BY ciudad")
    .map((r) => r.ciudad);
}

function nextCodigo() {
  const row = db.get("SELECT codigo FROM proveedores WHERE codigo LIKE 'PRV-%' ORDER BY codigo DESC LIMIT 1");
  let n = 1;
  if (row) {
    const m = /(\d+)\s*$/.exec(row.codigo);
    if (m) n = Number(m[1]) + 1;
  }
  return `PRV-${String(n).padStart(4, '0')}`;
}

function save(payload) {
  const nombre = String(payload.nombre || '').trim();
  if (!nombre) throw new Error('La razon social o nombre del proveedor es obligatorio.');

  const nit = String(payload.nit || '').trim();
  const duplicado = nit
    ? db.get('SELECT id, nombre FROM proveedores WHERE nit = ? AND id <> ?', [nit, payload.id || 0])
    : null;
  if (duplicado) {
    throw new Error(`Ya existe un proveedor con ese documento: ${duplicado.nombre}.`);
  }

  const busqueda = normalize(
    [payload.codigo, nombre, nit, payload.contacto, payload.email, payload.ciudad].join(' '),
  );
  const ts = db.now();

  const campos = [
    String(payload.codigo || '').trim() || nextCodigo(),
    nombre,
    nit,
    payload.dv || '',
    payload.contacto || '',
    payload.email || '',
    payload.telefono || '',
    payload.direccion || '',
    payload.ciudad || '',
    payload.departamento || '',
    payload.notas || '',
    payload.activo === false || payload.activo === 0 ? 0 : 1,
    busqueda,
  ];

  if (payload.id) {
    db.run(
      `UPDATE proveedores SET codigo=?, nombre=?, nit=?, dv=?, contacto=?, email=?, telefono=?,
              direccion=?, ciudad=?, departamento=?, notas=?, activo=?, busqueda=?, updated_at=?
        WHERE id = ?`,
      [...campos, ts, payload.id],
    );
    return get(payload.id);
  }

  const { id } = db.run(
    `INSERT INTO proveedores (codigo, nombre, nit, dv, contacto, email, telefono, direccion, ciudad,
              departamento, notas, activo, busqueda, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...campos, ts, ts],
  );
  return get(id);
}

function remove(id) {
  const usado = db.get('SELECT COUNT(*) AS n FROM gastos WHERE proveedor_id = ?', [id]);
  if (usado && Number(usado.n) > 0) {
    throw new Error('El proveedor tiene facturas de gasto asociadas. Desactivalo en lugar de eliminarlo.');
  }
  db.run('DELETE FROM proveedores WHERE id = ?', [id]);
  return true;
}

/** Historial de compras del proveedor para la ficha de detalle. */
function historial(proveedorId) {
  return db.all(
    `SELECT g.id, g.numero, g.fecha, g.fecha_vencimiento, g.estado, g.total,
            (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos_gasto pg WHERE pg.gasto_id = g.id) AS pagado,
            g.total - (SELECT COALESCE(SUM(pg.monto), 0) FROM pagos_gasto pg WHERE pg.gasto_id = g.id) AS saldo
       FROM gastos g
      WHERE g.proveedor_id = ? ORDER BY g.fecha DESC, g.id DESC LIMIT 25`,
    [proveedorId],
  );
}

module.exports = { list, get, save, remove, ciudades, nextCodigo, historial };
