'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { enteroALetras, montoALetras } = require('../src/main/lib/letras');

test('enteroALetras convierte enteros a letras', () => {
  assert.equal(enteroALetras(0), 'CERO');
  assert.equal(enteroALetras(1), 'UN');
  assert.equal(enteroALetras(500), 'QUINIENTOS');
  assert.equal(enteroALetras(1500), 'MIL QUINIENTOS');
  assert.equal(enteroALetras(1000000), 'UN MILLON');
  assert.equal(enteroALetras(2500000), 'DOS MILLONES QUINIENTOS MIL');
});

test('montoALetras agrega el sufijo de moneda', () => {
  assert.equal(montoALetras(1500, 'PESOS', 0), 'SON: MIL QUINIENTOS PESOS M/CTE');
  assert.equal(montoALetras(0, 'PESOS', 0), 'SON: CERO PESOS M/CTE');
});
