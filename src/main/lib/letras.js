'use strict';

/**
 * Conversion de importes a letras (espanol, formato colombiano).
 * Se usa en el pie de la factura: "SON: ... PESOS M/CTE".
 */

const UNIDADES = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const DECENAS = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function centenas(n) {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';

  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];

  if (c > 0) partes.push(CENTENAS[c]);
  if (resto >= 10 && resto < 20) {
    partes.push(ESPECIALES[resto - 10]);
  } else if (resto >= 20) {
    const d = Math.floor(resto / 10);
    const u = resto % 10;
    partes.push(u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`);
  } else if (resto > 0) {
    partes.push(UNIDADES[resto]);
  }
  return partes.join(' ');
}

function seccion(n, singular, plural) {
  if (n === 0) return '';
  if (n === 1) return singular;
  return `${centenas(n)} ${plural}`;
}

/** Convierte un entero positivo a letras. */
function enteroALetras(valor) {
  const n = Math.floor(Math.abs(Number(valor) || 0));
  if (n === 0) return 'CERO';

  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;

  const partes = [];
  if (millones > 0) partes.push(seccion(millones, 'UN MILLON', 'MILLONES'));
  if (miles > 0) partes.push(seccion(miles, 'MIL', 'MIL'));
  if (resto > 0) partes.push(centenas(resto));

  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {number} monto
 * @param {string} moneda  'PESOS' por defecto
 * @param {number} decimales
 */
function montoALetras(monto, moneda = 'PESOS', decimales = 0) {
  const value = Number(monto) || 0;
  const entero = Math.floor(value);
  const centavos = Math.round((value - entero) * 100);

  let texto = `${enteroALetras(entero)} ${moneda}`;
  if (decimales > 0 && centavos > 0) texto += ` CON ${String(centavos).padStart(2, '0')}/100`;
  return `SON: ${texto} M/CTE`.replace(/\s+/g, ' ');
}

module.exports = { enteroALetras, montoALetras };
