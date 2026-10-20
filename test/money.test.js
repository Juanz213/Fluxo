'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { setDecimals, decimals, round, sum, format, normalize, like, pad } = require('../src/main/lib/money');

test('decimales y redondeo respetan la configuracion', () => {
  setDecimals(0);
  assert.equal(decimals(), 0);
  assert.equal(round(1234.5), 1235);
  assert.equal(round(1234.4), 1234);

  setDecimals(2);
  assert.equal(round(1.005), 1.01);
  assert.equal(round(10.555), 10.56);
  setDecimals(0);
});

test('sum redondea el resultado final', () => {
  setDecimals(0);
  assert.equal(sum([1.4, 1.4, 1.4]), 4);
  setDecimals(2);
  assert.equal(sum([0.1, 0.2]), 0.3);
  setDecimals(0);
});

test('format usa separadores de miles en espanol', () => {
  setDecimals(0);
  assert.equal(format(1234567), '1.234.567');
  assert.equal(format(-1500), '-1.500');
  setDecimals(2);
  assert.equal(format(1234.5), '1.234,50');
  setDecimals(0);
});

test('normalize y like quitan acentos y normalizan espacios', () => {
  assert.equal(normalize('  Jose  Ángel  '), 'jose angel');
  assert.equal(like('Núñez'), '%nunez%');
});

test('pad genera consecutivos con ceros a la izquierda', () => {
  assert.equal(pad(7), '0007');
  assert.equal(pad(12345), '12345');
  assert.equal(pad(7, 6), '000007');
});
