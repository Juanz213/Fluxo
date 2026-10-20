'use strict';

const db = require('../db/database');
const config = require('./config');
const { calcular, addDays } = require('../lib/documento');
const { like, pad, round, decimals } = require('../lib/money');

/**
 * Facturas de gasto (compras a proveedores).
 *
 * Controlan los egresos de la empresa: subtotal, IVA, retencion, total y el
 * saldo por pagar al proveedor. No afectan el inventario; su proposito es el
 * control de gastos y cuentas por pagar.
 */

const ESTADOS = ['Pendiente', 'Parcial', 'Pagada', 'Vencida', 'Anulada'];

const PAGADO_SQL = `(SELECT COALESCE(SUM(pg.monto), 0) FROM pagos_gasto pg WHERE pg.gasto_id = g.id)`;

const SELECT_BASE = `
  SELECT g.*, p.nombre AS proveedor_nombre, p.nit AS proveedor_nit, p.codigo AS proveedor_codigo,
         ${PAGADO_SQL} AS pagado,
         g.total - ${PAGADO_SQL} AS saldo,
         CASE WHEN g.estado NOT IN ('Anulada','Pagada') AND g.fecha_vencimiento <> ''
                   AND g.fecha_vencimiento < ?
              THEN CAST(julianday(?) - julianday(g.fecha_vencimiento) AS INTEGER)
              ELSE 0 END AS dias_vencida
    FROM gastos g
    JOIN proveedores p ON p.id = g.proveedor_id
`;

/** Construye el WHERE y sus parametros (sin los ? de las subconsultas del SELECT). */
function filtros({
  q = '',
  estado = '',
  estadoGrupo = '',
  proveedor_id = '',
  categoria = '',
  desde = '',
  hasta = '',
  conSaldo = false,
  vencidas = false,
} = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(g.numero LIKE ? OR p.busqueda LIKE ?)');
    params.push(like(q), like(q));
  }
  if (estado) {
    where.push('g.estado = ?');
    params.push(estado);
  }
  if (estadoGrupo === 'cartera') where.push(`g.estado NOT IN ('Anulada','Pagada')`);
  if (estadoGrupo === 'pagadas') where.push(`g.estado = 'Pagada'`);
  if (proveedor_id) {
    where.push('g.proveedor_id = ?');
    params.push(proveedor_id);
  }
  if (categoria) {
    where.push('g.categoria = ?');
    params.push(categoria);
  }
  if (desde) {
    where.push('g.fecha >= ?');
    params.push(desde);
  }
  if (hasta) {
    where.push('g.fecha <= ?');
    params.push(hasta);
  }
  if (conSaldo) where.push(`g.estado NOT IN ('Anulada','Pagada') AND g.total - ${PAGADO_SQL} > 0`);
  if (vencidas) {
    where.push(`g.estado NOT IN ('Anulada','Pagada') AND g.fecha_vencimiento <> '' AND g.fecha_vencimiento < ?`);
    params.push(db.today());
  }

  return { where, params };
}

/** Clauses FROM comunes a la bandeja y a los resumenes. */
const JOIN_BASE = `
  FROM gastos g
  JOIN proveedores p ON p.id = g.proveedor_id
`;

function list(options = {}) {
  const hoy = db.today();
  const { where, params } = filtros(options);

  const columnas = {
    fecha: 'g.fecha',
    numero: 'g.numero',
    total: 'g.total',
    saldo: 'saldo',
    proveedor: 'p.nombre',
    categoria: 'g.categoria',
    estado: 'g.estado',
    vencimiento: 'g.fecha_vencimiento',
  };
  const orderBy = columnas[options.sort] || columnas.fecha;
  const direction = String(options.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return db.all(
    `${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy} ${direction}, g.id DESC`,
    [hoy, hoy, ...params],
  );
}

/** Recuenta el estado de un gasto a partir de sus pagos. */
function recalcularEstado(id) {
  const gasto = db.get('SELECT * FROM gastos WHERE id = ?', [id]);
  if (!gasto || gasto.estado === 'Anulada') return gasto ? gasto.estado : null;

  const pagado = Number(db.get(`SELECT ${PAGADO_SQL} AS t FROM gastos g WHERE g.id = ?`, [id])?.t || 0);
  const total = Number(gasto.total) || 0;

  let estado;
  if (total > 0 && pagado >= total - 0.001) estado = 'Pagada';
  else if (pagado > 0) estado = 'Parcial';
  else if (gasto.fecha_vencimiento && gasto.fecha_vencimiento < db.today()) estado = 'Vencida';
  else estado = 'Pendiente';

  db.run('UPDATE gastos SET estado = ?, updated_at = ? WHERE id = ?', [estado, db.now(), id]);
  return estado;
}

function refrescarEstados() {
  const ids = db.all("SELECT id FROM gastos WHERE estado <> 'Anulada'").map((r) => r.id);
  let cambios = 0;
  for (const id of ids) {
    const antes = db.get('SELECT estado FROM gastos WHERE id = ?', [id])?.estado;
    const despues = recalcularEstado(id);
    if (antes !== despues) cambios += 1;
  }
  return cambios;
}

function get(id) {
  const gasto = db.get(`${SELECT_BASE} WHERE g.id = ?`, [db.today(), db.today(), id]);
  if (!gasto) return null;
  gasto.items = db.all('SELECT * FROM gasto_items WHERE gasto_id = ? ORDER BY orden, id', [id]);
  gasto.pagos = db.all('SELECT * FROM pagos_gasto WHERE gasto_id = ? ORDER BY fecha, id', [id]);
  gasto.proveedor = db.get('SELECT * FROM proveedores WHERE id = ?', [gasto.proveedor_id]);
  return gasto;
}

function nextNumero(fecha) {
  const prefijo = config.get('gas_prefijo', 'CMP');
  const anio = Number(String(fecha || db.today()).slice(0, 4));
  const row = db.get(
    'SELECT COALESCE(MAX(consecutivo), 0) AS n FROM gastos WHERE prefijo = ? AND anio = ?',
    [prefijo, anio],
  );
  const consecutivo = Number(row?.n || 0) + 1;
  return { prefijo, anio, consecutivo, numero: `${prefijo}-${anio}-${pad(consecutivo)}` };
}

function insertarItems(gastoId, lineas) {
  for (const linea of lineas) {
    db.run(
      `INSERT INTO gasto_items (gasto_id, producto_id, codigo, descripcion, unidad, cantidad,
              precio_unitario, descuento_pct, iva_pct, subtotal, iva_valor, total, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        gastoId,
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
}

function save(payload) {
  if (!payload.proveedor_id) throw new Error('Debes seleccionar un proveedor.');
  const items = Array.isArray(payload.items) ? payload.items.filter((i) => String(i.descripcion || '').trim()) : [];
  if (!items.length) throw new Error('El gasto debe tener al menos una linea.');

  const fecha = payload.fecha || db.today();
  const diasCredito = Number(payload.dias_credito);
  const vencimiento = payload.fecha_vencimiento
    || addDays(fecha, Number.isFinite(diasCredito) && diasCredito >= 0 ? diasCredito : config.num('gas_dias_credito', 30));

  const totales = calcular(items, {
    descuentoPct: payload.descuento_pct,
    retencionPct: payload.retencion_pct,
  });
  const ts = db.now();

  return db.transaction(() => {
    let id = payload.id;

    if (id) {
      const actual = db.get('SELECT id, estado FROM gastos WHERE id = ?', [id]);
      if (!actual) throw new Error('El gasto ya no existe.');
      if (actual.estado === 'Anulada') throw new Error('No se puede editar un gasto anulado.');
      if (actual.estado === 'Pagada') throw new Error('No se puede editar un gasto totalmente pagado.');

      const pagado = Number(db.get(`SELECT ${PAGADO_SQL} AS t FROM gastos g WHERE g.id = ?`, [id])?.t || 0);
      if (pagado > 0) {
        throw new Error('No se puede editar un gasto con pagos registrados. Anula o elimina los pagos primero.');
      }
      // Defensivo: el total nunca puede quedar por debajo de lo ya pagado.
      if (totales.total < pagado - 10 ** -decimals() / 2) {
        throw new Error('El total del gasto no puede ser menor que lo ya pagado.');
      }

      db.run('DELETE FROM gasto_items WHERE gasto_id = ?', [id]);
      db.run(
        `UPDATE gastos SET proveedor_id=?, fecha=?, fecha_vencimiento=?, categoria=?, subtotal=?,
                descuento_pct=?, descuento_valor=?, iva_valor=?, retencion_pct=?, retencion_valor=?,
                total=?, forma_pago=?, observaciones=?, updated_at=?
          WHERE id = ?`,
        [
          Number(payload.proveedor_id),
          fecha,
          vencimiento,
          payload.categoria || '',
          totales.subtotal,
          totales.descuento_pct,
          totales.descuento_valor,
          totales.iva_valor,
          totales.retencion_pct,
          totales.retencion_valor,
          totales.total,
          payload.forma_pago || 'Transferencia',
          payload.observaciones || '',
          ts,
          id,
        ],
      );
      insertarItems(id, totales.lineas);
      recalcularEstado(id);
      return get(id);
    }

    const consecutivo = nextNumero(fecha);
    const inserted = db.run(
      `INSERT INTO gastos (prefijo, anio, consecutivo, numero, proveedor_id, fecha, fecha_vencimiento,
              estado, categoria, subtotal, descuento_pct, descuento_valor, iva_valor, retencion_pct,
              retencion_valor, total, forma_pago, observaciones, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        consecutivo.prefijo,
        consecutivo.anio,
        consecutivo.consecutivo,
        consecutivo.numero,
        Number(payload.proveedor_id),
        fecha,
        vencimiento,
        'Pendiente',
        payload.categoria || '',
        totales.subtotal,
        totales.descuento_pct,
        totales.descuento_valor,
        totales.iva_valor,
        totales.retencion_pct,
        totales.retencion_valor,
        totales.total,
        payload.forma_pago || 'Transferencia',
        payload.observaciones || '',
        ts,
        ts,
      ],
    );
    id = inserted.id;
    insertarItems(id, totales.lineas);
    recalcularEstado(id);
    return get(id);
  });
}

function anular(id, motivo = '') {
  const gasto = db.get('SELECT * FROM gastos WHERE id = ?', [id]);
  if (!gasto) throw new Error('El gasto no existe.');
  if (gasto.estado === 'Anulada') throw new Error('El gasto ya esta anulado.');

  const pagado = Number(db.get(`SELECT ${PAGADO_SQL} AS t FROM gastos g WHERE g.id = ?`, [id])?.t || 0);
  if (pagado > 0) throw new Error('No se puede anular un gasto con pagos registrados. Elimina primero los pagos.');

  db.run('UPDATE gastos SET estado = ?, anulada_motivo = ?, updated_at = ? WHERE id = ?', [
    'Anulada',
    motivo,
    db.now(),
    id,
  ]);
  return get(id);
}

function remove(id) {
  const pagado = Number(db.get(`SELECT ${PAGADO_SQL} AS t FROM gastos g WHERE g.id = ?`, [id])?.t || 0);
  if (pagado > 0) throw new Error('El gasto tiene pagos registrados y no se puede eliminar.');

  return db.transaction(() => {
    db.run('DELETE FROM gasto_items WHERE gasto_id = ?', [id]);
    db.run('DELETE FROM gastos WHERE id = ?', [id]);
    return true;
  });
}

/** Resumen para los indicadores de la bandeja de gastos (agregacion en SQL). */
function resumen(opciones = {}) {
  const { where, params } = filtros(opciones);
  const filtroSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const hoy = db.today();

  const totales = db.get(
    `SELECT
        COUNT(*) AS cantidad,
        COALESCE(SUM(CASE WHEN g.estado <> 'Anulada' THEN g.total ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN g.estado <> 'Anulada' THEN ${PAGADO_SQL} ELSE 0 END), 0) AS pagado,
        COALESCE(SUM(CASE WHEN g.estado <> 'Anulada' THEN g.total - ${PAGADO_SQL} ELSE 0 END), 0) AS saldo,
        COALESCE(SUM(CASE WHEN g.estado NOT IN ('Anulada','Pagada') AND g.fecha_vencimiento <> ''
                            AND g.fecha_vencimiento < ?
                          THEN g.total - ${PAGADO_SQL} ELSE 0 END), 0) AS vencido
      ${JOIN_BASE} ${filtroSQL}`,
    [hoy, ...params],
  );

  const porEstado = { Pendiente: 0, Parcial: 0, Pagada: 0, Vencida: 0, Anulada: 0 };
  const estados = db.all(
    `SELECT g.estado AS estado, COUNT(*) AS n ${JOIN_BASE} ${filtroSQL} GROUP BY g.estado`,
    params,
  );
  for (const row of estados) porEstado[row.estado] = Number(row.n);

  return {
    cantidad: Number(totales?.cantidad || 0),
    total: round(Number(totales?.total || 0)),
    pagado: round(Number(totales?.pagado || 0)),
    saldo: round(Number(totales?.saldo || 0)),
    vencido: round(Number(totales?.vencido || 0)),
    porEstado,
  };
}

/* -------------------------------------------------------------------- */
/* Pagos a proveedores                                                   */
/* -------------------------------------------------------------------- */

function guardarPago(payload) {
  const gastoId = Number(payload.gasto_id);
  const monto = Number(payload.monto);
  if (!gastoId) throw new Error('Debes indicar el gasto.');
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('El monto del pago debe ser mayor a cero.');

  const gasto = db.get('SELECT id, estado, total FROM gastos WHERE id = ?', [gastoId]);
  if (!gasto) throw new Error('El gasto no existe.');
  if (gasto.estado === 'Anulada') throw new Error('No se pueden registrar pagos de un gasto anulado.');

  const pagadoOtros = Number(
    db.get('SELECT COALESCE(SUM(monto), 0) AS t FROM pagos_gasto WHERE gasto_id = ? AND id <> ?', [
      gastoId,
      payload.id || 0,
    ])?.t || 0,
  );
  const saldoPendiente = Number(gasto.total) - pagadoOtros;
  // Tolerancia segun los decimales configurados (0.5 con COP, 0 decimales).
  if (monto > saldoPendiente + 10 ** -decimals() / 2) {
    throw new Error(`El monto supera el saldo pendiente del gasto (${round(saldoPendiente)}).`);
  }

  return db.transaction(() => {
    if (payload.id) {
      db.run('UPDATE pagos_gasto SET fecha=?, monto=?, metodo=?, referencia=?, notas=? WHERE id=?', [
        payload.fecha || db.today(),
        monto,
        payload.metodo || 'Transferencia',
        payload.referencia || '',
        payload.notas || '',
        payload.id,
      ]);
    } else {
      db.run(
        'INSERT INTO pagos_gasto (gasto_id, fecha, monto, metodo, referencia, notas, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          gastoId,
          payload.fecha || db.today(),
          monto,
          payload.metodo || 'Transferencia',
          payload.referencia || '',
          payload.notas || '',
          db.now(),
        ],
      );
    }
    recalcularEstado(gastoId);
    return get(gastoId);
  });
}

function eliminarPago(id) {
  const pago = db.get('SELECT gasto_id FROM pagos_gasto WHERE id = ?', [id]);
  if (!pago) throw new Error('El pago no existe.');
  return db.transaction(() => {
    db.run('DELETE FROM pagos_gasto WHERE id = ?', [id]);
    recalcularEstado(pago.gasto_id);
    return get(pago.gasto_id);
  });
}

function listPagos(filtros = {}) {
  const where = [];
  const params = [];
  if (filtros.gasto_id) {
    where.push('pg.gasto_id = ?');
    params.push(filtros.gasto_id);
  }
  return db.all(
    `SELECT pg.*, g.numero AS gasto_numero, p.nombre AS proveedor_nombre
       FROM pagos_gasto pg
       JOIN gastos g ON g.id = pg.gasto_id
       JOIN proveedores p ON p.id = g.proveedor_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY pg.fecha DESC, pg.id DESC`,
    params,
  );
}

module.exports = {
  ESTADOS,
  list,
  get,
  save,
  remove,
  anular,
  nextNumero,
  recalcularEstado,
  refrescarEstados,
  resumen,
  guardarPago,
  eliminarPago,
  listPagos,
};
