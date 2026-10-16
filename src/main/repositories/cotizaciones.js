'use strict';

const db = require('../db/database');
const config = require('./config');
const { calcular, addDays } = require('../lib/documento');
const { like, pad, round } = require('../lib/money');

const ESTADOS = ['Borrador', 'Enviada', 'Aprobada', 'Rechazada', 'Vencida', 'Convertida'];
const ESTADOS_ABIERTOS = ['Borrador', 'Enviada', 'Aprobada', 'Vencida'];

const SELECT_BASE = `
  SELECT q.*, c.nombre AS cliente_nombre, c.nit AS cliente_nit, c.codigo AS cliente_codigo,
         a.nombre AS asesor_nombre,
         (SELECT COUNT(*) FROM cotizacion_items i WHERE i.cotizacion_id = q.id) AS items_count
    FROM cotizaciones q
    JOIN clientes c ON c.id = q.cliente_id
    LEFT JOIN asesores a ON a.id = q.asesor_id
`;

/** Marca como vencidas las cotizaciones abiertas cuya vigencia expiro. */
function marcarVencidas() {
  const hoy = db.today();
  const { changes } = db.run(
    `UPDATE cotizaciones SET estado = 'Vencida', updated_at = ?
      WHERE estado IN ('Enviada','Aprobada') AND fecha_vencimiento <> '' AND fecha_vencimiento < ?`,
    [db.now(), hoy],
  );
  return changes;
}

function list({
  q = '',
  estado = '',
  estadoGrupo = '',
  asesor_id = '',
  cliente_id = '',
  desde = '',
  hasta = '',
  estancadasDias = 0,
  sort = 'fecha',
  dir = 'desc',
} = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(q.numero LIKE ? OR c.busqueda LIKE ?)');
    params.push(like(q), like(q));
  }
  if (estado) {
    where.push('q.estado = ?');
    params.push(estado);
  }
  if (estadoGrupo === 'abiertas') where.push(`q.estado IN ('Borrador','Enviada','Aprobada')`);
  if (estadoGrupo === 'ganadas') where.push(`q.estado IN ('Aprobada','Convertida')`);
  if (estadoGrupo === 'perdidas') where.push(`q.estado IN ('Rechazada','Vencida')`);
  if (asesor_id) {
    where.push('q.asesor_id = ?');
    params.push(asesor_id);
  }
  if (cliente_id) {
    where.push('q.cliente_id = ?');
    params.push(cliente_id);
  }
  if (desde) {
    where.push('q.fecha >= ?');
    params.push(desde);
  }
  if (hasta) {
    where.push('q.fecha <= ?');
    params.push(hasta);
  }
  if (estancadasDias > 0) {
    where.push(`q.estado IN ('Borrador','Enviada') AND julianday('now') - julianday(q.fecha) >= ?`);
    params.push(Number(estancadasDias));
  }

  const columnas = {
    fecha: 'q.fecha',
    numero: 'q.numero',
    total: 'q.total',
    cliente: 'c.nombre',
    asesor: 'a.nombre',
    estado: 'q.estado',
    vencimiento: 'q.fecha_vencimiento',
  };
  const orderBy = columnas[sort] || columnas.fecha;
  const direction = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return db.all(
    `${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy} ${direction}, q.id DESC`,
    params,
  );
}

/** Totales agrupados por estado, para los indicadores de la bandeja. */
function resumenEstados(filtros = {}) {
  const rows = list(filtros);
  const base = {
    total: 0,
    cantidad: rows.length,
    Borrador: 0,
    Enviada: 0,
    Aprobada: 0,
    Rechazada: 0,
    Vencida: 0,
    Convertida: 0,
    valor_abiertas: 0,
    valor_ganadas: 0,
    valor_perdidas: 0,
  };
  for (const row of rows) {
    base.total = round(base.total + Number(row.total));
    base[row.estado] = round((base[row.estado] || 0) + Number(row.total));
    if (ESTADOS_ABIERTOS.includes(row.estado)) base.valor_abiertas = round(base.valor_abiertas + Number(row.total));
    if (['Aprobada', 'Convertida'].includes(row.estado)) base.valor_ganadas = round(base.valor_ganadas + Number(row.total));
    if (['Rechazada', 'Vencida'].includes(row.estado)) base.valor_perdidas = round(base.valor_perdidas + Number(row.total));
  }
  const ganadas = rows.filter((r) => ['Aprobada', 'Convertida'].includes(r.estado)).length;
  base.ganadas_count = ganadas;
  base.tasa_conversion = rows.length ? round((ganadas / rows.length) * 100) : 0;
  return base;
}

function get(id) {
  const cotizacion = db.get(`${SELECT_BASE} WHERE q.id = ?`, [id]);
  if (!cotizacion) return null;
  cotizacion.items = db.all(
    'SELECT * FROM cotizacion_items WHERE cotizacion_id = ? ORDER BY orden, id',
    [id],
  );
  cotizacion.cliente = db.get('SELECT * FROM clientes WHERE id = ?', [cotizacion.cliente_id]);
  cotizacion.asesor = cotizacion.asesor_id
    ? db.get('SELECT * FROM asesores WHERE id = ?', [cotizacion.asesor_id])
    : null;
  cotizacion.factura = cotizacion.factura_id
    ? db.get('SELECT id, numero, estado, total FROM facturas WHERE id = ?', [cotizacion.factura_id])
    : null;
  return cotizacion;
}

function nextNumero(fecha) {
  const prefijo = config.get('cot_prefijo', 'COT');
  const anio = Number(String(fecha || db.today()).slice(0, 4));
  const row = db.get(
    'SELECT COALESCE(MAX(consecutivo), 0) AS n FROM cotizaciones WHERE prefijo = ? AND anio = ?',
    [prefijo, anio],
  );
  const consecutivo = Number(row?.n || 0) + 1;
  return { prefijo, anio, consecutivo, numero: `${prefijo}-${anio}-${pad(consecutivo)}` };
}

function save(payload) {
  if (!payload.cliente_id) throw new Error('Debes seleccionar un cliente.');
  const items = Array.isArray(payload.items) ? payload.items.filter((i) => String(i.descripcion || '').trim()) : [];
  if (!items.length) throw new Error('La cotizacion debe tener al menos una linea.');

  const cliente = db.get('SELECT id, nombre FROM clientes WHERE id = ?', [payload.cliente_id]);
  if (!cliente) throw new Error('El cliente seleccionado no existe.');

  const fecha = payload.fecha || db.today();
  const validez = Number(payload.validez_dias) >= 0 ? Number(payload.validez_dias) : config.num('cot_validez_dias', 30);

  const totales = calcular(items, { descuentoPct: payload.descuento_pct });
  const ts = db.now();

  return db.transaction(() => {
    let id = payload.id;
    let numero;

    if (id) {
      const actual = db.get('SELECT numero, prefijo, anio, consecutivo FROM cotizaciones WHERE id = ?', [id]);
      if (!actual) throw new Error('La cotizacion ya no existe.');
      numero = actual.numero;
      db.run(
        `UPDATE cotizaciones SET cliente_id=?, asesor_id=?, fecha=?, validez_dias=?, fecha_vencimiento=?,
                estado=?, subtotal=?, descuento_pct=?, descuento_valor=?, iva_valor=?, total=?,
                condicion_pago=?, observaciones=?, updated_at=?
          WHERE id = ?`,
        [
          Number(payload.cliente_id),
          payload.asesor_id ? Number(payload.asesor_id) : null,
          fecha,
          validez,
          addDays(fecha, validez),
          payload.estado || 'Borrador',
          totales.subtotal,
          totales.descuento_pct,
          totales.descuento_valor,
          totales.iva_valor,
          totales.total,
          payload.condicion_pago || '',
          payload.observaciones || '',
          ts,
          id,
        ],
      );
      db.run('DELETE FROM cotizacion_items WHERE cotizacion_id = ?', [id]);
    } else {
      const consecutivo = nextNumero(fecha);
      numero = consecutivo.numero;
      const inserted = db.run(
        `INSERT INTO cotizaciones (prefijo, anio, consecutivo, numero, cliente_id, asesor_id, fecha,
                validez_dias, fecha_vencimiento, estado, subtotal, descuento_pct, descuento_valor,
                iva_valor, total, condicion_pago, observaciones, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          consecutivo.prefijo,
          consecutivo.anio,
          consecutivo.consecutivo,
          numero,
          Number(payload.cliente_id),
          payload.asesor_id ? Number(payload.asesor_id) : null,
          fecha,
          validez,
          addDays(fecha, validez),
          payload.estado || 'Borrador',
          totales.subtotal,
          totales.descuento_pct,
          totales.descuento_valor,
          totales.iva_valor,
          totales.total,
          payload.condicion_pago || '',
          payload.observaciones || '',
          ts,
          ts,
        ],
      );
      id = inserted.id;
    }

    for (const linea of totales.lineas) {
      db.run(
        `INSERT INTO cotizacion_items (cotizacion_id, producto_id, codigo, descripcion, unidad, cantidad,
                precio_unitario, descuento_pct, iva_pct, subtotal, iva_valor, total, orden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          linea.producto_id,
          linea.codigo,
          linea.descripcion,
          linea.unidad,
          linea.cantidad,
          linea.precio_unitario,
          linea.descuento_pct,
          linea.iva_pct,
          linea.subtotal,
          linea.iva_valor,
          linea.total,
          linea.orden,
        ],
      );
    }

    return get(id);
  });
}

function cambiarEstado(id, estado, motivo = '') {
  if (!ESTADOS.includes(estado)) throw new Error('Estado no valido.');
  const actual = db.get('SELECT id FROM cotizaciones WHERE id = ?', [id]);
  if (!actual) throw new Error('La cotizacion no existe.');
  db.run('UPDATE cotizaciones SET estado = ?, motivo_perdida = ?, updated_at = ? WHERE id = ?', [
    estado,
    motivo,
    db.now(),
    id,
  ]);
  return get(id);
}

function duplicar(id) {
  const original = get(id);
  if (!original) throw new Error('La cotizacion no existe.');
  return save({
    cliente_id: original.cliente_id,
    asesor_id: original.asesor_id,
    fecha: db.today(),
    validez_dias: original.validez_dias,
    estado: 'Borrador',
    condicion_pago: original.condicion_pago,
    observaciones: original.observaciones,
    descuento_pct: original.descuento_pct,
    items: original.items.map((i) => ({ ...i, id: undefined })),
  });
}

function remove(id) {
  const factura = db.get('SELECT COUNT(*) AS n FROM facturas WHERE cotizacion_id = ?', [id]);
  if (factura && Number(factura.n) > 0) {
    throw new Error('La cotizacion ya fue convertida en factura y no se puede eliminar.');
  }
  return db.transaction(() => {
    db.run('DELETE FROM cotizacion_items WHERE cotizacion_id = ?', [id]);
    db.run('DELETE FROM cotizaciones WHERE id = ?', [id]);
    return true;
  });
}

/** Cotizaciones abiertas con mas de N dias sin movimiento. */
function estancadas(dias = 15) {
  return db.all(
    `${SELECT_BASE}
      WHERE q.estado IN ('Borrador','Enviada')
        AND julianday('now') - julianday(q.fecha) >= ?
      ORDER BY q.fecha ASC`,
    [Number(dias) || 15],
  );
}

/** Vincula una cotizacion con la factura generada. */
function marcarConvertida(id, facturaId) {
  db.run(
    `UPDATE cotizaciones SET estado = 'Convertida', factura_id = ?, updated_at = ? WHERE id = ?`,
    [facturaId, db.now(), id],
  );
}

module.exports = {
  ESTADOS,
  list,
  get,
  save,
  remove,
  cambiarEstado,
  duplicar,
  nextNumero,
  estancadas,
  marcarVencidas,
  marcarConvertida,
  resumenEstados,
};
