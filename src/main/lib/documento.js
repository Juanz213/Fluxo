'use strict';

const { round, sum } = require('./money');

/**
 * Motor de calculo de documentos (cotizaciones y facturas).
 *
 * Todo el calculo vive en el proceso principal: el renderer nunca envia
 * totales, solo lineas. Asi el PDF, la base de datos y la pantalla siempre
 * muestran exactamente el mismo numero.
 */

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {Array} items  Lineas del documento.
 * @param {object} opts  { descuentoPct, retencionPct }
 * @returns {object}     Lineas normalizadas y totales del encabezado.
 */
function calcular(items, opts = {}) {
  const descuentoPct = clamp(num(opts.descuentoPct), 0, 100);
  const retencionPct = clamp(num(opts.retencionPct), 0, 100);

  const lineas = (items || []).map((item, index) => {
    const cantidad = num(item.cantidad);
    const precio = num(item.precio_unitario);
    const descLinea = clamp(num(item.descuento_pct), 0, 100);
    const ivaPct = clamp(num(item.iva_pct), 0, 100);

    const bruto = cantidad * precio;
    const subtotal = round(bruto - bruto * (descLinea / 100));
    const ivaValor = round(subtotal * (ivaPct / 100));

    return {
      producto_id: item.producto_id ? Number(item.producto_id) : null,
      codigo: String(item.codigo || ''),
      descripcion: String(item.descripcion || '').trim(),
      unidad: item.unidad || 'UND',
      cantidad,
      precio_unitario: precio,
      descuento_pct: descLinea,
      iva_pct: ivaPct,
      subtotal,
      iva_valor: ivaValor,
      total: round(subtotal + ivaValor),
      orden: index,
    };
  });

  const subtotal = sum(lineas.map((l) => l.subtotal));
  const ivaBruto = sum(lineas.map((l) => l.iva_valor));

  const descuentoValor = round(subtotal * (descuentoPct / 100));
  const factorGlobal = 1 - descuentoPct / 100;

  const base = round(subtotal - descuentoValor);
  const ivaValor = round(ivaBruto * factorGlobal);
  const brutoTotal = round(base + ivaValor);
  const retencionValor = round(brutoTotal * (retencionPct / 100));
  const total = round(brutoTotal - retencionValor);

  return {
    lineas,
    subtotal,
    descuento_pct: descuentoPct,
    descuento_valor: descuentoValor,
    iva_valor: ivaValor,
    retencion_pct: retencionPct,
    retencion_valor: retencionValor,
    base_gravable: base,
    total,
  };
}

/** Suma dias a una fecha 'YYYY-MM-DD'. */
function addDays(fechaISO, dias) {
  const [y, m, d] = String(fechaISO || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + (Number(dias) || 0));
  return date.toISOString().slice(0, 10);
}

module.exports = { calcular, addDays };
