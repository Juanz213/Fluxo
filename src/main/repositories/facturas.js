'use strict';

const db = require('../db/database');
const config = require('./config');
const cotizaciones = require('./cotizaciones');
const productos = require('./productos');
const { calcular, addDays } = require('../lib/documento');
const { like, pad, round, decimals } = require('../lib/money');

const ESTADOS = ['Emitida', 'Parcial', 'Pagada', 'Vencida', 'Anulada'];

const PAGADO_SQL = `(SELECT COALESCE(SUM(p.monto), 0) FROM pagos p WHERE p.factura_id = f.id)`;

const SELECT_BASE = `
  SELECT f.*, c.nombre AS cliente_nombre, c.nit AS cliente_nit, c.codigo AS cliente_codigo,
         a.nombre AS asesor_nombre,
         q.numero AS cotizacion_numero,
         ${PAGADO_SQL} AS pagado,
         f.total - ${PAGADO_SQL} AS saldo,
         CASE WHEN f.estado NOT IN ('Anulada','Pagada') AND f.fecha_vencimiento <> ''
                   AND f.fecha_vencimiento < ?
              THEN CAST(julianday(?) - julianday(f.fecha_vencimiento) AS INTEGER)
              ELSE 0 END AS dias_vencida
    FROM facturas f
    JOIN clientes c ON c.id = f.cliente_id
    LEFT JOIN asesores a ON a.id = f.asesor_id
    LEFT JOIN cotizaciones q ON q.id = f.cotizacion_id
`;

/** Construye el WHERE y sus parametros (sin los ? de las subconsultas del SELECT). */
function filtros({
  q = '',
  estado = '',
  estadoGrupo = '',
  asesor_id = '',
  cliente_id = '',
  desde = '',
  hasta = '',
  conSaldo = false,
  vencidas = false,
} = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('(f.numero LIKE ? OR c.busqueda LIKE ?)');
    params.push(like(q), like(q));
  }
  if (estado) {
    where.push('f.estado = ?');
    params.push(estado);
  }
  if (estadoGrupo === 'cartera') where.push(`f.estado NOT IN ('Anulada','Pagada')`);
  if (estadoGrupo === 'cobradas') where.push(`f.estado = 'Pagada'`);
  if (asesor_id) {
    where.push('f.asesor_id = ?');
    params.push(asesor_id);
  }
  if (cliente_id) {
    where.push('f.cliente_id = ?');
    params.push(cliente_id);
  }
  if (desde) {
    where.push('f.fecha >= ?');
    params.push(desde);
  }
  if (hasta) {
    where.push('f.fecha <= ?');
    params.push(hasta);
  }
  if (conSaldo) where.push(`f.estado NOT IN ('Anulada','Pagada') AND f.total - ${PAGADO_SQL} > 0`);
  if (vencidas) {
    where.push(`f.estado NOT IN ('Anulada','Pagada') AND f.fecha_vencimiento <> '' AND f.fecha_vencimiento < ?`);
    params.push(db.today());
  }

  return { where, params };
}

/** Clauses FROM comunes a la bandeja y a los resumenes. */
const JOIN_BASE = `
  FROM facturas f
  JOIN clientes c ON c.id = f.cliente_id
  LEFT JOIN asesores a ON a.id = f.asesor_id
`;

function list(options = {}) {
  const hoy = db.today();
  const { where, params } = filtros(options);

  const columnas = {
    fecha: 'f.fecha',
    numero: 'f.numero',
    total: 'f.total',
    saldo: 'saldo',
    cliente: 'c.nombre',
    asesor: 'a.nombre',
    estado: 'f.estado',
    vencimiento: 'f.fecha_vencimiento',
  };
  const orderBy = columnas[options.sort] || columnas.fecha;
  const direction = String(options.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return db.all(
    `${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy} ${direction}, f.id DESC`,
    [hoy, hoy, ...params],
  );
}

/** Recuenta el estado de una factura a partir de sus pagos. */
function recalcularEstado(id) {
  const factura = db.get('SELECT * FROM facturas WHERE id = ?', [id]);
  if (!factura || factura.estado === 'Anulada') return factura ? factura.estado : null;

  const pagado = Number(db.get(`SELECT ${PAGADO_SQL} AS t FROM facturas f WHERE f.id = ?`, [id])?.t || 0);
  const total = Number(factura.total) || 0;

  let estado;
  if (total > 0 && pagado >= total - 0.001) estado = 'Pagada';
  else if (pagado > 0) estado = 'Parcial';
  else if (factura.fecha_vencimiento && factura.fecha_vencimiento < db.today()) estado = 'Vencida';
  else estado = 'Emitida';

  db.run('UPDATE facturas SET estado = ?, updated_at = ? WHERE id = ?', [estado, db.now(), id]);
  return estado;
}

function refrescarEstados() {
  const ids = db.all("SELECT id FROM facturas WHERE estado <> 'Anulada'").map((r) => r.id);
  let cambios = 0;
  for (const id of ids) {
    const antes = db.get('SELECT estado FROM facturas WHERE id = ?', [id])?.estado;
    const despues = recalcularEstado(id);
    if (antes !== despues) cambios += 1;
  }
  return cambios;
}

function get(id) {
  const factura = db.get(`${SELECT_BASE} WHERE f.id = ?`, [db.today(), db.today(), id]);
  if (!factura) return null;
  factura.items = db.all('SELECT * FROM factura_items WHERE factura_id = ? ORDER BY orden, id', [id]);
  factura.pagos = db.all('SELECT * FROM pagos WHERE factura_id = ? ORDER BY fecha, id', [id]);
  factura.cliente = db.get('SELECT * FROM clientes WHERE id = ?', [factura.cliente_id]);
  factura.asesor = factura.asesor_id
    ? db.get('SELECT * FROM asesores WHERE id = ?', [factura.asesor_id])
    : null;
  return factura;
}

function nextNumero(fecha) {
  const prefijo = config.get('fac_prefijo', 'FAC');
  const anio = Number(String(fecha || db.today()).slice(0, 4));
  const row = db.get(
    'SELECT COALESCE(MAX(consecutivo), 0) AS n FROM facturas WHERE prefijo = ? AND anio = ?',
    [prefijo, anio],
  );
  const consecutivo = Number(row?.n || 0) + 1;
  return { prefijo, anio, consecutivo, numero: `${prefijo}-${anio}-${pad(consecutivo)}` };
}

/** Descuenta inventario de los items de tipo producto. */
function aplicarInventario(items, facturaId, signo) {
  for (const item of items) {
    if (!item.producto_id || item.cantidad === 0) continue;
    const producto = db.get('SELECT id, tipo, stock FROM productos WHERE id = ?', [item.producto_id]);
    if (!producto || producto.tipo !== 'Producto') continue;
    const nuevo = round(Number(producto.stock) - signo * Number(item.cantidad));
    db.run('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [nuevo, db.now(), producto.id]);
    db.run(
      `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, saldo, motivo, referencia, fecha, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        producto.id,
        signo > 0 ? 'Salida' : 'Reingreso',
        signo * Number(item.cantidad),
        nuevo,
        signo > 0 ? 'Facturacion' : 'Anulacion de factura',
        facturaId,
        db.today(),
        db.now(),
      ],
    );
  }
}

function insertarItems(facturaId, lineas) {
  for (const linea of lineas) {
    db.run(
      `INSERT INTO factura_items (factura_id, producto_id, codigo, descripcion, unidad, cantidad,
              precio_unitario, descuento_pct, iva_pct, subtotal, iva_valor, total, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        facturaId,
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
  if (!payload.cliente_id) throw new Error('Debes seleccionar un cliente.');
  const cliente = db.get('SELECT id FROM clientes WHERE id = ?', [Number(payload.cliente_id)]);
  if (!cliente) throw new Error('El cliente seleccionado no existe.');
  const items = Array.isArray(payload.items) ? payload.items.filter((i) => String(i.descripcion || '').trim()) : [];
  if (!items.length) throw new Error('La factura debe tener al menos una linea.');

  const fecha = payload.fecha || db.today();
  const diasCredito = Number(payload.dias_credito);
  const vencimiento = payload.fecha_vencimiento
    || addDays(fecha, Number.isFinite(diasCredito) && diasCredito >= 0 ? diasCredito : config.num('fac_dias_credito', 30));

  const totales = calcular(items, {
    descuentoPct: payload.descuento_pct,
    retencionPct: payload.retencion_pct,
  });
  const ts = db.now();

  return db.transaction(() => {
    let id = payload.id;

    if (id) {
      const actual = db.get('SELECT id, estado FROM facturas WHERE id = ?', [id]);
      if (!actual) throw new Error('La factura ya no existe.');
      if (actual.estado === 'Anulada') throw new Error('No se puede editar una factura anulada.');
      if (actual.estado === 'Pagada') throw new Error('No se puede editar una factura totalmente pagada.');

      const pagado = Number(db.get(`SELECT ${PAGADO_SQL} AS t FROM facturas f WHERE f.id = ?`, [id])?.t || 0);
      if (pagado > 0) {
        throw new Error('No se puede editar una factura con pagos registrados. Anula o elimina los pagos primero.');
      }
      // Defensivo: el total nunca puede quedar por debajo de lo ya pagado.
      if (totales.total < pagado - 10 ** -decimals() / 2) {
        throw new Error('El total de la factura no puede ser menor que lo ya pagado.');
      }

      const previos = db.all('SELECT * FROM factura_items WHERE factura_id = ?', [id]);
      aplicarInventario(previos, id, -1);
      db.run('DELETE FROM factura_items WHERE factura_id = ?', [id]);

      db.run(
        `UPDATE facturas SET cliente_id=?, asesor_id=?, fecha=?, fecha_vencimiento=?, subtotal=?,
                descuento_pct=?, descuento_valor=?, iva_valor=?, retencion_pct=?, retencion_valor=?,
                total=?, forma_pago=?, observaciones=?, updated_at=?
          WHERE id = ?`,
        [
          Number(payload.cliente_id),
          payload.asesor_id ? Number(payload.asesor_id) : null,
          fecha,
          vencimiento,
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
      aplicarInventario(totales.lineas, id, 1);
      recalcularEstado(id);
      return get(id);
    }

    const consecutivo = nextNumero(fecha);
    const inserted = db.run(
      `INSERT INTO facturas (prefijo, anio, consecutivo, numero, cotizacion_id, cliente_id, asesor_id,
              fecha, fecha_vencimiento, estado, subtotal, descuento_pct, descuento_valor, iva_valor,
              retencion_pct, retencion_valor, total, forma_pago, observaciones, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        consecutivo.prefijo,
        consecutivo.anio,
        consecutivo.consecutivo,
        consecutivo.numero,
        payload.cotizacion_id ? Number(payload.cotizacion_id) : null,
        Number(payload.cliente_id),
        payload.asesor_id ? Number(payload.asesor_id) : null,
        fecha,
        vencimiento,
        'Emitida',
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
    aplicarInventario(totales.lineas, id, 1);
    recalcularEstado(id);

    if (payload.cotizacion_id) cotizaciones.marcarConvertida(Number(payload.cotizacion_id), id);
    return get(id);
  });
}

/** Crea una factura a partir de una cotizacion aprobada. */
function crearDesdeCotizacion(cotizacionId, opciones = {}) {
  const cotizacion = cotizaciones.get(cotizacionId);
  if (!cotizacion) throw new Error('La cotizacion no existe.');
  if (cotizacion.factura_id) throw new Error(`Esta cotizacion ya genero la factura.`);

  const fecha = opciones.fecha || db.today();
  const dias = Number(opciones.dias_credito);
  return save({
    cotizacion_id: cotizacion.id,
    cliente_id: cotizacion.cliente_id,
    asesor_id: cotizacion.asesor_id,
    fecha,
    fecha_vencimiento: opciones.fecha_vencimiento
      || addDays(fecha, Number.isFinite(dias) && dias >= 0 ? dias : config.num('fac_dias_credito', 30)),
    descuento_pct: cotizacion.descuento_pct,
    retencion_pct: Number(opciones.retencion_pct) || 0,
    forma_pago: opciones.forma_pago || 'Transferencia',
    observaciones: opciones.observaciones || cotizacion.observaciones,
    items: cotizacion.items,
  });
}

function anular(id, motivo = '') {
  const factura = db.get('SELECT * FROM facturas WHERE id = ?', [id]);
  if (!factura) throw new Error('La factura no existe.');
  if (factura.estado === 'Anulada') throw new Error('La factura ya esta anulada.');

  const pagado = Number(db.get(`SELECT ${PAGADO_SQL} AS t FROM facturas f WHERE f.id = ?`, [id])?.t || 0);
  if (pagado > 0) throw new Error('No se puede anular una factura con pagos registrados. Elimina primero los pagos.');

  return db.transaction(() => {
    const items = db.all('SELECT * FROM factura_items WHERE factura_id = ?', [id]);
    aplicarInventario(items, id, -1);
    db.run('UPDATE facturas SET estado = ?, anulada_motivo = ?, updated_at = ? WHERE id = ?', [
      'Anulada',
      motivo,
      db.now(),
      id,
    ]);
    return get(id);
  });
}

function remove(id) {
  const pagado = Number(db.get(`SELECT ${PAGADO_SQL} AS t FROM facturas f WHERE f.id = ?`, [id])?.t || 0);
  if (pagado > 0) throw new Error('La factura tiene pagos registrados y no se puede eliminar.');

  return db.transaction(() => {
    const items = db.all('SELECT * FROM factura_items WHERE factura_id = ?', [id]);
    aplicarInventario(items, id, -1);
    db.run('DELETE FROM factura_items WHERE factura_id = ?', [id]);
    db.run('DELETE FROM facturas WHERE id = ?', [id]);
    return true;
  });
}

/** Resumen para los indicadores de la bandeja de facturas (agregacion en SQL). */
function resumen(opciones = {}) {
  const { where, params } = filtros(opciones);
  const filtroSQL = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const hoy = db.today();

  const totales = db.get(
    `SELECT
        COUNT(*) AS cantidad,
        COALESCE(SUM(CASE WHEN f.estado <> 'Anulada' THEN f.total ELSE 0 END), 0) AS total,
        COALESCE(SUM(CASE WHEN f.estado <> 'Anulada' THEN ${PAGADO_SQL} ELSE 0 END), 0) AS pagado,
        COALESCE(SUM(CASE WHEN f.estado <> 'Anulada' THEN f.total - ${PAGADO_SQL} ELSE 0 END), 0) AS saldo,
        COALESCE(SUM(CASE WHEN f.estado NOT IN ('Anulada','Pagada') AND f.fecha_vencimiento <> ''
                            AND f.fecha_vencimiento < ?
                          THEN f.total - ${PAGADO_SQL} ELSE 0 END), 0) AS vencido
      ${JOIN_BASE} ${filtroSQL}`,
    [hoy, ...params],
  );

  const porEstado = { Emitida: 0, Parcial: 0, Pagada: 0, Vencida: 0, Anulada: 0 };
  const estados = db.all(
    `SELECT f.estado AS estado, COUNT(*) AS n ${JOIN_BASE} ${filtroSQL} GROUP BY f.estado`,
    params,
  );
  for (const row of estados) porEstado[row.estado] = Number(row.n);

  return {
    cantidad: Number(totales?.cantidad || 0),
    total: round(Number(totales?.total || 0)),
    pagado: round(Number(totales?.pagado || 0)),
    saldo: round(Number(totales?.saldo || 0)),
    vencido: round(Number(totales?.vencido || 0)),
    emitidas: porEstado.Emitida,
    porEstado,
  };
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
  crearDesdeCotizacion,
  resumen,
};
