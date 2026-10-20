'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../src/main/db/database');
const config = require('../src/main/repositories/config');
const clientes = require('../src/main/repositories/clientes');
const productos = require('../src/main/repositories/productos');
const cotizaciones = require('../src/main/repositories/cotizaciones');
const facturas = require('../src/main/repositories/facturas');
const pagos = require('../src/main/repositories/pagos');

let dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxo-test-'));
  await db.open(dir);
  config.bootstrap();
});

after(() => {
  try {
    db.close();
  } catch {
    /* noop */
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('el esquema queda en la version actual (migraciones)', () => {
  const fila = db.get('PRAGMA user_version;');
  assert.equal(Number(fila.user_version), 2);
  assert.equal(config.get('schema_version'), '2');
});

test('flujo cotizacion -> factura -> pago parcial -> pago total', () => {
  const cliente = clientes.save({ nombre: 'Cliente Demo SAS', nit: '900123456' });
  assert.ok(cliente.id);
  assert.equal(cliente.codigo, 'CLI-0001');

  const producto = productos.save({ nombre: 'Servicio X', tipo: 'Servicio', precio: 100000, iva_pct: 19 });
  assert.equal(producto.codigo, 'SRV-0001');

  const cotizacion = cotizaciones.save({
    cliente_id: cliente.id,
    fecha: db.today(),
    validez_dias: 30,
    items: [{ producto_id: producto.id, descripcion: 'Servicio X', cantidad: 1, precio_unitario: 100000, iva_pct: 19 }],
  });
  assert.equal(cotizacion.total, 119000);

  const factura = facturas.crearDesdeCotizacion(cotizacion.id, { dias_credito: 30 });
  assert.equal(factura.total, 119000);
  assert.equal(factura.estado, 'Emitida');

  const parcial = pagos.save({ factura_id: factura.id, monto: 50000 });
  assert.equal(parcial.estado, 'Parcial');
  assert.equal(Number(parcial.saldo), 69000);

  const pagada = pagos.save({ factura_id: factura.id, monto: 69000 });
  assert.equal(pagada.estado, 'Pagada');
  assert.equal(Number(pagada.saldo), 0);

  const resumen = facturas.resumen({});
  assert.equal(resumen.cantidad, 1);
  assert.equal(resumen.total, 119000);
  assert.equal(resumen.pagado, 119000);
  assert.equal(resumen.saldo, 0);
  assert.equal(resumen.porEstado.Pagada, 1);
});

test('no se puede editar una factura con pagos registrados', () => {
  const cliente = clientes.list({})[0];
  const factura = facturas.save({
    cliente_id: cliente.id,
    fecha: db.today(),
    items: [{ descripcion: 'Item', cantidad: 1, precio_unitario: 1000, iva_pct: 0 }],
  });
  pagos.save({ factura_id: factura.id, monto: 500 });

  assert.throws(
    () =>
      facturas.save({
        id: factura.id,
        cliente_id: cliente.id,
        fecha: db.today(),
        items: [{ descripcion: 'Item', cantidad: 1, precio_unitario: 2000, iva_pct: 0 }],
      }),
    /pagos registrados/,
  );
});

test('una factura no puede referenciar un cliente inexistente', () => {
  assert.throws(
    () =>
      facturas.save({
        cliente_id: 99999,
        items: [{ descripcion: 'Item', cantidad: 1, precio_unitario: 1, iva_pct: 0 }],
      }),
    /no existe/,
  );
});

test('nextCodigo usa el consecutivo numerico, no el textual', () => {
  clientes.save({ nombre: 'Cliente 9999', nit: '900999999', codigo: 'CLI-9999' });
  clientes.save({ nombre: 'Cliente 10000', nit: '901000000', codigo: 'CLI-10000' });
  assert.equal(clientes.nextCodigo(), 'CLI-10001');
});
