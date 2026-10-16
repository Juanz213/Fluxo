'use strict';

const db = require('../db/database');
const config = require('./config');
const { round } = require('../lib/money');

/*
 * Panel de crecimiento.
 *
 * Toda la agregacion se hace en SQL y se devuelve ya lista para pintar:
 * el renderer no recalcula nada.
 */

const PAGADO = '(SELECT COALESCE(SUM(p.monto), 0) FROM pagos p WHERE p.factura_id = f.id)';

function mesAnterior(ym, delta = 1) {
  const [y, m] = String(ym).split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function rangoMeses(ymFinal, cantidad) {
  const meses = [];
  for (let i = cantidad - 1; i >= 0; i -= 1) meses.push(mesAnterior(ymFinal, i));
  return meses;
}

function etiquetaMes(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  const nombres = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${nombres[m - 1]} ${String(y).slice(2)}`;
}

function pct(actual, anterior) {
  const a = Number(actual) || 0;
  const b = Number(anterior) || 0;
  if (b === 0) return a > 0 ? 100 : 0;
  return round(((a - b) / b) * 100);
}

/** Totales de un mes concreto. */
function totalesMes(ym) {
  const facturado = db.get(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
       FROM facturas f
      WHERE f.estado <> 'Anulada' AND substr(f.fecha, 1, 7) = ?`,
    [ym],
  );
  const cotizado = db.get(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
       FROM cotizaciones WHERE substr(fecha, 1, 7) = ?`,
    [ym],
  );
  const cobrado = db.get(
    "SELECT COALESCE(SUM(monto), 0) AS total FROM pagos WHERE substr(fecha, 1, 7) = ?",
    [ym],
  );
  const facturadoTotal = Number(facturado?.total || 0);
  const cantidad = Number(facturado?.cantidad || 0);
  return {
    mes: ym,
    facturado: round(facturadoTotal),
    facturas: cantidad,
    cotizado: round(Number(cotizado?.total || 0)),
    cotizaciones: Number(cotizado?.cantidad || 0),
    cobrado: round(Number(cobrado?.total || 0)),
    ticket_promedio: cantidad ? round(facturadoTotal / cantidad) : 0,
  };
}

/** Serie mensual de los ultimos N meses. */
function serieMensual(meses) {
  const ultimo = db.today().slice(0, 7);
  const lista = rangoMeses(ultimo, meses);

  const facturas = toMap(
    db.all(
      `SELECT substr(fecha, 1, 7) AS mes, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
         FROM facturas f
        WHERE f.estado <> 'Anulada' AND substr(fecha, 1, 7) >= ?
        GROUP BY mes`,
      [lista[0]],
    ),
  );
  const cotizaciones = toMap(
    db.all(
      `SELECT substr(fecha, 1, 7) AS mes, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
         FROM cotizaciones
        WHERE substr(fecha, 1, 7) >= ?
        GROUP BY mes`,
      [lista[0]],
    ),
  );
  const pagos = toMap(
    db.all(
      `SELECT substr(fecha, 1, 7) AS mes, COALESCE(SUM(monto), 0) AS total
         FROM pagos WHERE substr(fecha, 1, 7) >= ? GROUP BY mes`,
      [lista[0]],
    ),
  );

  return lista.map((ym) => {
    const f = facturas[ym] || {};
    const c = cotizaciones[ym] || {};
    const p = pagos[ym] || {};
    return {
      mes: ym,
      etiqueta: etiquetaMes(ym),
      facturado: round(Number(f.total || 0)),
      facturas: Number(f.cantidad || 0),
      cotizado: round(Number(c.total || 0)),
      cotizaciones: Number(c.cantidad || 0),
      cobrado: round(Number(p.total || 0)),
    };
  });
}

function toMap(rows) {
  const out = {};
  for (const row of rows) out[row.mes] = row;
  return out;
}

/** Antiguedad de la cartera por cobrar. */
function cartera() {
  const hoy = db.today();
  const facturas = db.all(
    `SELECT f.id, f.numero, f.fecha, f.fecha_vencimiento, f.total, ${PAGADO} AS pagado,
            f.total - ${PAGADO} AS saldo, c.nombre AS cliente_nombre, c.id AS cliente_id,
            a.nombre AS asesor_nombre
       FROM facturas f
       JOIN clientes c ON c.id = f.cliente_id
       LEFT JOIN asesores a ON a.id = f.asesor_id
      WHERE f.estado NOT IN ('Anulada', 'Pagada') AND f.total - ${PAGADO} > 0
      ORDER BY f.fecha_vencimiento ASC`,
  );

  const buckets = [
    { clave: 'corriente', etiqueta: 'Por vencer', monto: 0, cantidad: 0 },
    { clave: 'b1', etiqueta: '1 a 30 dias', monto: 0, cantidad: 0 },
    { clave: 'b2', etiqueta: '31 a 60 dias', monto: 0, cantidad: 0 },
    { clave: 'b3', etiqueta: '61 a 90 dias', monto: 0, cantidad: 0 },
    { clave: 'b4', etiqueta: 'Mas de 90 dias', monto: 0, cantidad: 0 },
  ];

  let total = 0;
  let vencido = 0;
  const porCliente = {};

  for (const f of facturas) {
    const saldo = round(Number(f.saldo) || 0);
    if (saldo <= 0) continue;
    total = round(total + saldo);

    const dias = f.fecha_vencimiento && f.fecha_vencimiento < hoy
      ? Math.floor((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${f.fecha_vencimiento}T00:00:00Z`)) / 86400000)
      : 0;

    let bucket;
    if (dias <= 0) bucket = buckets[0];
    else if (dias <= 30) bucket = buckets[1];
    else if (dias <= 60) bucket = buckets[2];
    else if (dias <= 90) bucket = buckets[3];
    else bucket = buckets[4];

    bucket.monto = round(bucket.monto + saldo);
    bucket.cantidad += 1;
    if (dias > 0) vencido = round(vencido + saldo);

    const key = f.cliente_id;
    if (!porCliente[key]) {
      porCliente[key] = {
        cliente_id: f.cliente_id,
        cliente_nombre: f.cliente_nombre,
        saldo: 0,
        facturas: 0,
        dias_max: 0,
      };
    }
    porCliente[key].saldo = round(porCliente[key].saldo + saldo);
    porCliente[key].facturas += 1;
    porCliente[key].dias_max = Math.max(porCliente[key].dias_max, dias);
  }

  const listaFacturas = facturas
    .map((f) => ({
      ...f,
      saldo: round(Number(f.saldo) || 0),
      pagado: round(Number(f.pagado) || 0),
      dias_vencida:
        f.fecha_vencimiento && f.fecha_vencimiento < hoy
          ? Math.floor((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${f.fecha_vencimiento}T00:00:00Z`)) / 86400000)
          : 0,
    }))
    .filter((f) => f.saldo > 0);

  return {
    total,
    vencido,
    corriente: round(total - vencido),
    buckets,
    facturas: listaFacturas,
    porCliente: Object.values(porCliente).sort((a, b) => b.saldo - a.saldo).slice(0, 10),
  };
}

/** Ranking de asesores para un periodo. */
function rankingAsesores(desde, hasta) {
  return db
    .all(
      `SELECT a.id, a.nombre, a.codigo, a.zona, a.meta_mensual,
              (SELECT COALESCE(SUM(f.total), 0) FROM facturas f
                WHERE f.asesor_id = a.id AND f.estado <> 'Anulada'
                  AND f.fecha BETWEEN ? AND ?) AS facturado,
              (SELECT COUNT(*) FROM facturas f
                WHERE f.asesor_id = a.id AND f.estado <> 'Anulada'
                  AND f.fecha BETWEEN ? AND ?) AS facturas,
              (SELECT COUNT(*) FROM cotizaciones q
                WHERE q.asesor_id = a.id AND q.fecha BETWEEN ? AND ?) AS cotizaciones,
              (SELECT COUNT(*) FROM cotizaciones q
                WHERE q.asesor_id = a.id AND q.estado IN ('Aprobada','Convertida')
                  AND q.fecha BETWEEN ? AND ?) AS ganadas,
              (SELECT COALESCE(SUM(f.total - (SELECT COALESCE(SUM(p.monto),0) FROM pagos p WHERE p.factura_id = f.id)), 0)
                 FROM facturas f
                WHERE f.asesor_id = a.id AND f.estado NOT IN ('Anulada','Pagada')) AS cartera
         FROM asesores a
        WHERE a.activo = 1
        ORDER BY facturado DESC`,
      [desde, hasta, desde, hasta, desde, hasta, desde, hasta],
    )
    .map((r) => ({
      ...r,
      facturado: round(Number(r.facturado) || 0),
      cartera: round(Number(r.cartera) || 0),
      tasa_cierre: Number(r.cotizaciones) ? round((Number(r.ganadas) / Number(r.cotizaciones)) * 100) : 0,
      ticket_promedio: Number(r.facturas) ? round(Number(r.facturado) / Number(r.facturas)) : 0,
    }));
}

function topClientes(desde, hasta, limite = 8) {
  return db
    .all(
      `SELECT c.id, c.nombre, c.ciudad,
              COALESCE(SUM(f.total), 0) AS facturado, COUNT(f.id) AS facturas
         FROM facturas f
         JOIN clientes c ON c.id = f.cliente_id
        WHERE f.estado <> 'Anulada' AND f.fecha BETWEEN ? AND ?
        GROUP BY c.id
        ORDER BY facturado DESC
        LIMIT ?`,
      [desde, hasta, limite],
    )
    .map((r) => ({ ...r, facturado: round(Number(r.facturado) || 0) }));
}

function topProductos(desde, hasta, limite = 8) {
  return db
    .all(
      `SELECT i.descripcion, COALESCE(SUM(i.cantidad), 0) AS cantidad,
              COALESCE(SUM(i.total), 0) AS importe, COUNT(DISTINCT i.factura_id) AS documentos
         FROM factura_items i
         JOIN facturas f ON f.id = i.factura_id
        WHERE f.estado <> 'Anulada' AND f.fecha BETWEEN ? AND ?
        GROUP BY i.descripcion
        ORDER BY importe DESC
        LIMIT ?`,
      [desde, hasta, limite],
    )
    .map((r) => ({ ...r, importe: round(Number(r.importe) || 0) }));
}

function embudo(desde, hasta) {
  const estados = db.all(
    `SELECT estado, COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
       FROM cotizaciones WHERE fecha BETWEEN ? AND ? GROUP BY estado`,
    [desde, hasta],
  );
  const out = { Borrador: { cantidad: 0, total: 0 }, Enviada: { cantidad: 0, total: 0 }, Aprobada: { cantidad: 0, total: 0 }, Rechazada: { cantidad: 0, total: 0 }, Vencida: { cantidad: 0, total: 0 }, Convertida: { cantidad: 0, total: 0 } };
  for (const row of estados) {
    if (out[row.estado]) out[row.estado] = { cantidad: Number(row.cantidad), total: round(Number(row.total)) };
  }
  const totalCot = Object.values(out).reduce((acc, v) => acc + v.cantidad, 0);
  const ganadas = out.Aprobada.cantidad + out.Convertida.cantidad;
  const perdidas = out.Rechazada.cantidad + out.Vencida.cantidad;
  return {
    ...out,
    total_cotizaciones: totalCot,
    ganadas,
    perdidas,
    abiertas: out.Borrador.cantidad + out.Enviada.cantidad,
    tasa_conversion: totalCot ? round((ganadas / totalCot) * 100) : 0,
  };
}

/**
 * Resumen completo del panel.
 * @param {object} opciones { anio, meses }
 */
function resumen({ anio, meses = 12 } = {}) {
  const hoy = db.today();
  const anioActual = Number(anio) || Number(hoy.slice(0, 4));
  const mesActual = hoy.slice(0, 7);
  const mesPrevio = mesAnterior(mesActual, 1);

  const actual = totalesMes(mesActual);
  const anterior = totalesMes(mesPrevio);

  const desdeAnio = `${anioActual}-01-01`;
  const hastaAnio = `${anioActual}-12-31`;
  const desdeAnioPrev = `${anioActual - 1}-01-01`;
  const mesLimite = mesActual.startsWith(String(anioActual)) ? mesActual : `${anioActual}-12`;
  const hastaYTD = `${mesLimite}-31`;
  const mismoCortePrev = `${anioActual - 1}-${mesLimite.slice(5)}-31`;

  const anioActualTotales = db.get(
    `SELECT COUNT(*) AS facturas, COALESCE(SUM(total), 0) AS facturado
       FROM facturas f WHERE f.estado <> 'Anulada' AND f.fecha BETWEEN ? AND ?`,
    [desdeAnio, hastaYTD],
  );
  const anioPrevioTotales = db.get(
    `SELECT COUNT(*) AS facturas, COALESCE(SUM(total), 0) AS facturado
       FROM facturas f WHERE f.estado <> 'Anulada' AND f.fecha BETWEEN ? AND ?`,
    [desdeAnioPrev, mismoCortePrev],
  );
  const cotizadoAnio = db.get(
    `SELECT COUNT(*) AS cotizaciones, COALESCE(SUM(total), 0) AS total
       FROM cotizaciones WHERE fecha BETWEEN ? AND ?`,
    [desdeAnio, hastaYTD],
  );

  const carteraActual = cartera();

  const abiertas = db.get(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total
       FROM cotizaciones WHERE estado IN ('Borrador','Enviada','Aprobada')`,
  );

  const clientesActivos = db.get('SELECT COUNT(*) AS n FROM clientes WHERE activo = 1');
  const clientesNuevos = db.get(
    'SELECT COUNT(*) AS n FROM clientes WHERE substr(created_at, 1, 7) = ?',
    [mesActual],
  );
  const asesoresActivos = db.get('SELECT COUNT(*) AS n FROM asesores WHERE activo = 1');

  const diasAlerta = config.num('cot_alerta_dias', 15);
  const estancadas = db.get(
    `SELECT COUNT(*) AS cantidad, COALESCE(SUM(total), 0) AS total FROM cotizaciones
      WHERE estado IN ('Borrador','Enviada')
        AND julianday('now') - julianday(fecha) >= ?`,
    [diasAlerta],
  );

  const stockBajo = db.get(
    "SELECT COUNT(*) AS n FROM productos WHERE activo = 1 AND tipo = 'Producto' AND stock <= stock_minimo",
  );

  const metaAnual = config.num('meta_anual', 0);
  const metaMes = db.get(
    'SELECT COALESCE(SUM(meta_mensual), 0) AS total FROM asesores WHERE activo = 1',
  );

  const facturadoAnio = round(Number(anioActualTotales?.facturado || 0));
  const facturadoAnioPrev = round(Number(anioPrevioTotales?.facturado || 0));
  const metaMesTotal = round(Number(metaMes?.total || 0));

  return {
    generado: db.now(),
    anio: anioActual,
    kpis: {
      ventas_mes: actual.facturado,
      ventas_mes_anterior: anterior.facturado,
      crecimiento_mes: pct(actual.facturado, anterior.facturado),
      ventas_anio: facturadoAnio,
      ventas_anio_anterior: facturadoAnioPrev,
      crecimiento_anio: pct(facturadoAnio, facturadoAnioPrev),
      facturas_mes: actual.facturas,
      facturas_anio: Number(anioActualTotales?.facturas || 0),
      ticket_promedio: actual.ticket_promedio,
      cotizado_mes: actual.cotizado,
      cotizado_anio: round(Number(cotizadoAnio?.total || 0)),
      cotizaciones_mes: actual.cotizaciones,
      cobrado_mes: actual.cobrado,
      cartera_total: carteraActual.total,
      cartera_vencida: carteraActual.vencido,
      cartera_corriente: carteraActual.corriente,
      cotizaciones_abiertas: Number(abiertas?.cantidad || 0),
      cotizaciones_abiertas_valor: round(Number(abiertas?.total || 0)),
      clientes_activos: Number(clientesActivos?.n || 0),
      clientes_nuevos_mes: Number(clientesNuevos?.n || 0),
      asesores_activos: Number(asesoresActivos?.n || 0),
      estancadas: Number(estancadas?.cantidad || 0),
      estancadas_valor: round(Number(estancadas?.total || 0)),
      stock_bajo: Number(stockBajo?.n || 0),
      meta_anual: metaAnual,
      avance_meta_anual: metaAnual ? round((facturadoAnio / metaAnual) * 100) : 0,
      meta_mes: metaMesTotal,
      avance_meta_mes: metaMesTotal ? round((actual.facturado / metaMesTotal) * 100) : 0,
    },
    serie: serieMensual(meses),
    cartera: carteraActual,
    ranking: rankingAsesores(desdeAnio, hastaYTD),
    ranking_mes: rankingAsesores(`${mesActual}-01`, `${mesActual}-31`),
    top_clientes: topClientes(desdeAnio, hastaYTD),
    top_productos: topProductos(desdeAnio, hastaYTD),
    embudo: embudo(desdeAnio, hastaYTD),
    alertas: {
      stock: db.all(
        `SELECT id, codigo, nombre, stock, stock_minimo, unidad FROM productos
          WHERE activo = 1 AND tipo = 'Producto' AND stock <= stock_minimo
          ORDER BY (stock - stock_minimo) ASC LIMIT 6`,
      ),
      cotizaciones_estancadas: db.all(
        `SELECT q.id, q.numero, q.fecha, q.total, c.nombre AS cliente_nombre
           FROM cotizaciones q JOIN clientes c ON c.id = q.cliente_id
          WHERE q.estado IN ('Borrador','Enviada')
            AND julianday('now') - julianday(q.fecha) >= ?
          ORDER BY q.fecha ASC LIMIT 6`,
        [diasAlerta],
      ),
      facturas_vencidas: carteraActual.facturas.filter((f) => f.dias_vencida > 0).slice(0, 6),
    },
    desempenadas: {
      desde: desdeAnio,
      hasta: hastaYTD,
      anios: db
        .all('SELECT DISTINCT substr(fecha, 1, 4) AS anio FROM facturas ORDER BY anio DESC')
        .map((r) => Number(r.anio)),
    },
  };
}

module.exports = { resumen, serieMensual, cartera, rankingAsesores, embudo };
