'use strict';

const db = require('../db/database');
const facturas = require('./facturas');
const { like, format, decimals } = require('../lib/money');

const SELECT_BASE = `
  SELECT p.*, f.numero AS factura_numero, f.total AS factura_total, c.nombre AS cliente_nombre,
         c.codigo AS cliente_codigo
    FROM pagos p
    JOIN facturas f ON f.id = p.factura_id
    JOIN clientes c ON c.id = f.cliente_id
`;

function list({ factura_id = '', cliente_id = '', q = '', desde = '', hasta = '', metodo = '', sort = 'fecha', dir = 'desc' } = {}) {
  const where = [];
  const params = [];

  if (factura_id) {
    where.push('p.factura_id = ?');
    params.push(factura_id);
  }
  if (cliente_id) {
    where.push('f.cliente_id = ?');
    params.push(cliente_id);
  }
  if (q) {
    where.push('(f.numero LIKE ? OR c.busqueda LIKE ? OR p.referencia LIKE ?)');
    params.push(like(q), like(q), like(q));
  }
  if (desde) {
    where.push('p.fecha >= ?');
    params.push(desde);
  }
  if (hasta) {
    where.push('p.fecha <= ?');
    params.push(hasta);
  }
  if (metodo) {
    where.push('p.metodo = ?');
    params.push(metodo);
  }

  const columnas = { fecha: 'p.fecha', monto: 'p.monto', cliente: 'c.nombre', numero: 'f.numero' };
  const orderBy = columnas[sort] || columnas.fecha;
  const direction = String(dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  return db.all(
    `${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${orderBy} ${direction}, p.id DESC`,
    params,
  );
}

function total(filtros = {}) {
  const rows = list(filtros);
  return rows.reduce((acc, r) => acc + Number(r.monto || 0), 0);
}

function save(payload) {
  const facturaId = Number(payload.factura_id);
  const monto = Number(payload.monto);
  if (!facturaId) throw new Error('Debes indicar la factura.');
  if (!Number.isFinite(monto) || monto <= 0) throw new Error('El monto del pago debe ser mayor a cero.');

  const factura = db.get('SELECT id, estado, total FROM facturas WHERE id = ?', [facturaId]);
  if (!factura) throw new Error('La factura no existe.');
  if (factura.estado === 'Anulada') throw new Error('No se pueden registrar pagos de una factura anulada.');

  // El monto no puede superar el saldo pendiente (al editar, el propio pago no
  // cuenta como abono previo). Asi el saldo nunca queda en negativo.
  const pagadoOtros = Number(
    db.get('SELECT COALESCE(SUM(monto), 0) AS t FROM pagos WHERE factura_id = ? AND id <> ?', [
      facturaId,
      payload.id || 0,
    ])?.t || 0,
  );
  const saldoPendiente = Number(factura.total) - pagadoOtros;
  // Tolerancia segun los decimales configurados (0.5 con COP, 0 decimales).
  if (monto > saldoPendiente + 10 ** -decimals() / 2) {
    throw new Error(
      `El monto (${format(monto)}) supera el saldo pendiente de la factura (${format(saldoPendiente)}).`,
    );
  }

  return db.transaction(() => {
    if (payload.id) {
      db.run('UPDATE pagos SET fecha=?, monto=?, metodo=?, referencia=?, notas=? WHERE id=?', [
        payload.fecha || db.today(),
        monto,
        payload.metodo || 'Transferencia',
        payload.referencia || '',
        payload.notas || '',
        payload.id,
      ]);
    } else {
      db.run(
        'INSERT INTO pagos (factura_id, fecha, monto, metodo, referencia, notas, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          facturaId,
          payload.fecha || db.today(),
          monto,
          payload.metodo || 'Transferencia',
          payload.referencia || '',
          payload.notas || '',
          db.now(),
        ],
      );
    }
    facturas.recalcularEstado(facturaId);
    return facturas.get(facturaId);
  });
}

function remove(id) {
  const pago = db.get('SELECT factura_id FROM pagos WHERE id = ?', [id]);
  if (!pago) throw new Error('El pago no existe.');
  return db.transaction(() => {
    db.run('DELETE FROM pagos WHERE id = ?', [id]);
    facturas.recalcularEstado(pago.factura_id);
    return facturas.get(pago.factura_id);
  });
}

module.exports = { list, save, remove, total };
