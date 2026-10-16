'use strict';

const db = require('../db/database');
const { normalize, like, round } = require('../lib/money');

const SELECT_BASE = `
  SELECT a.*,
         (SELECT COUNT(*) FROM clientes c
           WHERE c.asesor_id = a.id AND c.activo = 1)                       AS clientes_activos,
         (SELECT COUNT(*) FROM cotizaciones q
           WHERE q.asesor_id = a.id)                                        AS cotizaciones_total,
         (SELECT COUNT(*) FROM cotizaciones q
           WHERE q.asesor_id = a.id AND q.estado IN ('Aprobada','Convertida')) AS cotizaciones_ganadas,
         (SELECT COALESCE(SUM(f.total), 0) FROM facturas f
           WHERE f.asesor_id = a.id AND f.estado <> 'Anulada')              AS facturado_total,
         (SELECT COALESCE(SUM(f.total), 0) FROM facturas f
           WHERE f.asesor_id = a.id AND f.estado <> 'Anulada'
             AND substr(f.fecha, 1, 7) = ?)                                 AS facturado_mes,
         (SELECT COALESCE(SUM(f.total - (SELECT COALESCE(SUM(p.monto), 0)
                                           FROM pagos p WHERE p.factura_id = f.id)), 0)
            FROM facturas f
           WHERE f.asesor_id = a.id AND f.estado NOT IN ('Anulada','Pagada')) AS cartera
    FROM asesores a
`;

function decorate(row) {
  if (!row) return row;
  const ganadas = Number(row.cotizaciones_ganadas) || 0;
  const total = Number(row.cotizaciones_total) || 0;
  const meta = Number(row.meta_mensual) || 0;
  const facturadoMes = Number(row.facturado_mes) || 0;
  return {
    ...row,
    activo: Number(row.activo) === 1,
    tasa_cierre: total ? round((ganadas / total) * 100) : 0,
    avance_meta: meta ? round((facturadoMes / meta) * 100) : 0,
    comision_estimada: round((facturadoMes * (Number(row.comision_pct) || 0)) / 100),
  };
}

function list({ q = '', activo = null, zona = '', sort = 'nombre', dir = 'asc' } = {}) {
  const mesActual = db.today().slice(0, 7);
  const where = [];
  const params = [mesActual];

  if (q) {
    where.push('a.busqueda LIKE ?');
    params.push(like(q));
  }
  if (activo === true || activo === 'true') where.push('a.activo = 1');
  if (activo === false || activo === 'false') where.push('a.activo = 0');
  if (zona) {
    where.push('a.zona = ?');
    params.push(zona);
  }

  const columnas = {
    nombre: 'a.nombre',
    codigo: 'a.codigo',
    facturado_total: 'facturado_total',
    facturado_mes: 'facturado_mes',
    cartera: 'cartera',
    meta_mensual: 'a.meta_mensual',
  };
  const orderBy = columnas[sort] || columnas.nombre;
  const direction = String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const sql = `${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
               ORDER BY ${orderBy} ${direction}`;

  return db.all(sql, params).map(decorate);
}

function get(id) {
  return decorate(db.get(`${SELECT_BASE} WHERE a.id = ?`, [db.today().slice(0, 7), id]));
}

function zonas() {
  return db
    .all("SELECT DISTINCT zona FROM asesores WHERE zona IS NOT NULL AND zona <> '' ORDER BY zona")
    .map((r) => r.zona);
}

function nextCodigo() {
  const row = db.get(
    "SELECT codigo FROM asesores WHERE codigo LIKE 'ASE-%' ORDER BY codigo DESC LIMIT 1",
  );
  let n = 1;
  if (row) {
    const m = /(\d+)\s*$/.exec(row.codigo);
    if (m) n = Number(m[1]) + 1;
  }
  return `ASE-${String(n).padStart(3, '0')}`;
}

function save(payload) {
  const nombre = String(payload.nombre || '').trim();
  if (!nombre) throw new Error('El nombre del asesor es obligatorio.');

  const busqueda = normalize(
    [payload.codigo, nombre, payload.documento, payload.email, payload.telefono, payload.zona].join(' '),
  );
  const ts = db.now();

  const data = [
    String(payload.codigo || '').trim() || nextCodigo(),
    nombre,
    payload.documento || '',
    payload.email || '',
    payload.telefono || '',
    payload.zona || '',
    Number(payload.comision_pct) || 0,
    Number(payload.meta_mensual) || 0,
    payload.fecha_ingreso || '',
    payload.activo === false || payload.activo === 0 ? 0 : 1,
    payload.notas || '',
    busqueda,
    ts,
  ];

  if (payload.id) {
    db.run(
      `UPDATE asesores SET codigo=?, nombre=?, documento=?, email=?, telefono=?, zona=?,
              comision_pct=?, meta_mensual=?, fecha_ingreso=?, activo=?, notas=?,
              busqueda=?, updated_at=?
        WHERE id = ?`,
      [...data, payload.id],
    );
    return get(payload.id);
  }

  const { id } = db.run(
    `INSERT INTO asesores (codigo, nombre, documento, email, telefono, zona, comision_pct,
              meta_mensual, fecha_ingreso, activo, notas, busqueda, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...data.slice(0, 12), ts, ts],
  );
  return get(id);
}

function remove(id) {
  const usado = db.get(
    `SELECT (SELECT COUNT(*) FROM cotizaciones WHERE asesor_id = ?)
          + (SELECT COUNT(*) FROM facturas WHERE asesor_id = ?)
          + (SELECT COUNT(*) FROM clientes WHERE asesor_id = ?) AS total`,
    [id, id, id],
  );
  if (usado && Number(usado.total) > 0) {
    throw new Error(
      'El asesor tiene clientes, cotizaciones o facturas asociadas. Desactivalo en lugar de eliminarlo.',
    );
  }
  db.run('DELETE FROM asesores WHERE id = ?', [id]);
  return true;
}

module.exports = { list, get, save, remove, zonas, nextCodigo };
