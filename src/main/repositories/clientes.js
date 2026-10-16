'use strict';

const db = require('../db/database');
const { normalize, like } = require('../lib/money');

const SALDO_EXPR = `
  (SELECT COALESCE(SUM(f.total - (SELECT COALESCE(SUM(p.monto), 0)
                                    FROM pagos p WHERE p.factura_id = f.id)), 0)
     FROM facturas f
    WHERE f.cliente_id = c.id AND f.estado NOT IN ('Anulada', 'Pagada'))`;
const SALDO_SQL = `${SALDO_EXPR} AS saldo`;
const VENCIDO_SQL = `
  (SELECT COALESCE(SUM(f.total - (SELECT COALESCE(SUM(p.monto), 0)
                                    FROM pagos p WHERE p.factura_id = f.id)), 0)
     FROM facturas f
    WHERE f.cliente_id = c.id AND f.estado NOT IN ('Anulada', 'Pagada')
      AND f.fecha_vencimiento <> '' AND f.fecha_vencimiento < ?) AS vencido`;
const FACTURADO_SQL = `
  (SELECT COALESCE(SUM(f.total), 0) FROM facturas f
    WHERE f.cliente_id = c.id AND f.estado <> 'Anulada') AS facturado_total`;

const SELECT_BASE = `
  SELECT c.*, ase.nombre AS asesor_nombre,
         ${FACTURADO_SQL},
         ${SALDO_SQL},
         ${VENCIDO_SQL}
    FROM clientes c
    LEFT JOIN asesores ase ON ase.id = c.asesor_id
`;

function decorate(row) {
  if (!row) return row;
  return { ...row, activo: Number(row.activo) === 1 };
}

function list({ q = '', asesor_id = '', activo = null, ciudad = '', conSaldo = false, sort = 'nombre', dir = 'asc' } = {}) {
  const where = [];
  const params = [db.today()];

  if (q) {
    where.push('c.busqueda LIKE ?');
    params.push(like(q));
  }
  if (asesor_id) {
    where.push('c.asesor_id = ?');
    params.push(asesor_id);
  }
  if (ciudad) {
    where.push('c.ciudad = ?');
    params.push(ciudad);
  }
  if (activo === true || activo === 'true') where.push('c.activo = 1');
  if (activo === false || activo === 'false') where.push('c.activo = 0');
  if (conSaldo) where.push(`${SALDO_EXPR} > 0`);

  const columnas = {
    nombre: 'c.nombre',
    codigo: 'c.codigo',
    ciudad: 'c.ciudad',
    saldo: 'saldo',
    facturado_total: 'facturado_total',
    created_at: 'c.created_at',
  };
  const orderBy = columnas[sort] || columnas.nombre;
  const direction = String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  return db
    .all(
      `${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY ${orderBy} ${direction}`,
      params,
    )
    .map(decorate);
}

function page(options = {}) {
  const rows = list(options);
  const pageSize = Math.max(1, Number(options.pageSize) || 25);
  const pageNum = Math.max(1, Number(options.page) || 1);
  const start = (pageNum - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    total: rows.length,
    page: pageNum,
    pageSize,
    pages: Math.max(1, Math.ceil(rows.length / pageSize)),
  };
}

function get(id) {
  return decorate(db.get(`${SELECT_BASE} WHERE c.id = ?`, [db.today(), id]));
}

function ciudades() {
  return db
    .all("SELECT DISTINCT ciudad FROM clientes WHERE ciudad IS NOT NULL AND ciudad <> '' ORDER BY ciudad")
    .map((r) => r.ciudad);
}

function nextCodigo() {
  const row = db.get(
    "SELECT codigo FROM clientes WHERE codigo LIKE 'CLI-%' ORDER BY codigo DESC LIMIT 1",
  );
  let n = 1;
  if (row) {
    const m = /(\d+)\s*$/.exec(row.codigo);
    if (m) n = Number(m[1]) + 1;
  }
  return `CLI-${String(n).padStart(4, '0')}`;
}

function save(payload) {
  const nombre = String(payload.nombre || '').trim();
  if (!nombre) throw new Error('La razon social o nombre del cliente es obligatorio.');

  const nit = String(payload.nit || '').trim();
  if (!nit) throw new Error('El numero de documento (NIT/CC) es obligatorio.');

  const duplicado = db.get('SELECT id, nombre FROM clientes WHERE nit = ? AND id <> ?', [
    nit,
    payload.id || 0,
  ]);
  if (duplicado) {
    throw new Error(`Ya existe un cliente con ese documento: ${duplicado.nombre}.`);
  }

  const busqueda = normalize(
    [payload.codigo, nombre, payload.nombre_comercial, nit, payload.contacto, payload.email, payload.ciudad].join(' '),
  );
  const ts = db.now();

  const campos = [
    String(payload.codigo || '').trim() || nextCodigo(),
    payload.tipo_persona || 'Juridica',
    payload.tipo_documento || 'NIT',
    nit,
    payload.dv || '',
    nombre,
    payload.nombre_comercial || '',
    payload.contacto || '',
    payload.email || '',
    payload.telefono || '',
    payload.direccion || '',
    payload.ciudad || '',
    payload.departamento || '',
    payload.regimen || 'Responsable de IVA',
    payload.asesor_id ? Number(payload.asesor_id) : null,
    Number(payload.cupo_credito) || 0,
    Number(payload.dias_credito) || 0,
    payload.activo === false || payload.activo === 0 ? 0 : 1,
    payload.notas || '',
    busqueda,
  ];

  if (payload.id) {
    db.run(
      `UPDATE clientes SET codigo=?, tipo_persona=?, tipo_documento=?, nit=?, dv=?, nombre=?,
              nombre_comercial=?, contacto=?, email=?, telefono=?, direccion=?, ciudad=?,
              departamento=?, regimen=?, asesor_id=?, cupo_credito=?, dias_credito=?, activo=?,
              notas=?, busqueda=?, updated_at=?
        WHERE id = ?`,
      [...campos, ts, payload.id],
    );
    return get(payload.id);
  }

  const { id } = db.run(
    `INSERT INTO clientes (codigo, tipo_persona, tipo_documento, nit, dv, nombre, nombre_comercial,
              contacto, email, telefono, direccion, ciudad, departamento, regimen, asesor_id,
              cupo_credito, dias_credito, activo, notas, busqueda, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...campos, ts, ts],
  );
  return get(id);
}

function remove(id) {
  const usado = db.get(
    `SELECT (SELECT COUNT(*) FROM cotizaciones WHERE cliente_id = ?)
          + (SELECT COUNT(*) FROM facturas WHERE cliente_id = ?) AS total`,
    [id, id],
  );
  if (usado && Number(usado.total) > 0) {
    throw new Error(
      'El cliente tiene cotizaciones o facturas asociadas. Desactivalo en lugar de eliminarlo.',
    );
  }
  db.run('DELETE FROM clientes WHERE id = ?', [id]);
  return true;
}

/** Historial comercial del cliente para la ficha de detalle. */
function historial(clienteId) {
  const cotizaciones = db.all(
    `SELECT id, numero, fecha, estado, total FROM cotizaciones
      WHERE cliente_id = ? ORDER BY fecha DESC, id DESC LIMIT 25`,
    [clienteId],
  );
  const facturas = db.all(
    `SELECT f.id, f.numero, f.fecha, f.fecha_vencimiento, f.estado, f.total,
            (SELECT COALESCE(SUM(p.monto), 0) FROM pagos p WHERE p.factura_id = f.id) AS pagado,
            f.total - (SELECT COALESCE(SUM(p.monto), 0) FROM pagos p WHERE p.factura_id = f.id) AS saldo
       FROM facturas f
      WHERE f.cliente_id = ? ORDER BY f.fecha DESC, f.id DESC LIMIT 25`,
    [clienteId],
  );
  return { cotizaciones, facturas };
}

module.exports = { list, page, get, save, remove, ciudades, nextCodigo, historial };
