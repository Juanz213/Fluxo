'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { calcular, addDays } = require('../src/main/lib/documento');
const { setDecimals } = require('../src/main/lib/money');

test('calcular aplica IVA por linea y descuento global', () => {
  setDecimals(0);
  const r = calcular(
    [
      { descripcion: 'A', cantidad: 2, precio_unitario: 100000, iva_pct: 19 },
      { descripcion: 'B', cantidad: 1, precio_unitario: 50000, iva_pct: 0 },
    ],
    { descuentoPct: 10 },
  );

  // Subtotal 200000 + 50000 = 250000; descuento 10% = 25000; base 225000.
  assert.equal(r.subtotal, 250000);
  assert.equal(r.descuento_valor, 25000);
  assert.equal(r.base_gravable, 225000);
  // IVA bruto = 19% de 200000 = 38000; sobre base con descuento = 34200.
  assert.equal(r.iva_valor, 34200);
  assert.equal(r.total, 259200);
});

test('calcular retencion en la fuente sobre el total bruto', () => {
  setDecimals(0);
  const r = calcular(
    [{ descripcion: 'Servicio', cantidad: 1, precio_unitario: 1000000, iva_pct: 19 }],
    { retencionPct: 4 },
  );
  assert.equal(r.iva_valor, 190000);
  assert.equal(r.retencion_valor, 47600); // 4% de 1.190.000
  assert.equal(r.total, 1142400);
});

test('calcular con lista vacia devuelve ceros', () => {
  setDecimals(0);
  const r = calcular([], {});
  assert.equal(r.subtotal, 0);
  assert.equal(r.total, 0);
});

test('addDays suma dias respetando el calendario', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('', 5), '');
});
