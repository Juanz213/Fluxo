'use strict';

/**
 * Utilidades de dinero y texto compartidas por la capa de datos.
 *
 * Los importes se redondean con el numero de decimales configurado para la
 * empresa (COP trabaja con 0 decimales), de modo que el total que se muestra
 * siempre coincide exactamente con la suma de las lineas.
 */

let DECIMALS = 0;

function setDecimals(n) {
  const value = Number(n);
  DECIMALS = Number.isFinite(value) && value >= 0 && value <= 4 ? Math.trunc(value) : 0;
}

function decimals() {
  return DECIMALS;
}

function round(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** DECIMALS;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Suma un arreglo de numeros redondeando el resultado final. */
function sum(values) {
  return round(values.reduce((acc, v) => acc + (Number(v) || 0), 0));
}

/** Normaliza texto para busquedas: minusculas y sin acentos. */
function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Construye el patron LIKE de una busqueda. */
function like(term) {
  return `%${normalize(term)}%`;
}

/** Genera un codigo secuencial con padding, ej. CLI-0007. */
function pad(n, width = 4) {
  return String(n).padStart(width, '0');
}

/** Formatea un importe con separadores de miles, ej. 1.234.567. */
function format(n) {
  const value = round(n);
  const [ent, dec] = Math.abs(value).toFixed(DECIMALS).split('.');
  const grupos = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const signo = value < 0 ? '-' : '';
  return DECIMALS ? `${signo}${grupos},${dec}` : `${signo}${grupos}`;
}

module.exports = { setDecimals, decimals, round, sum, format, normalize, like, pad };
