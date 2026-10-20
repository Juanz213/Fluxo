'use strict';

const db = require('../db/database');
const { normalize, like } = require('../lib/money');

/* -------------------------------------------------------------------- */
/* Categorias                                                            */
/* -------------------------------------------------------------------- */

const categorias = {
  list({ soloActivas = false } = {}) {
    const where = soloActivas ? 'WHERE activo = 1' : '';
    return db
      .all(
        `SELECT c.*, (SELECT COUNT(*) FROM productos p WHERE p.categoria_id = c.id) AS productos
           FROM categorias c ${where}
          ORDER BY c.nombre`,
      )
      .map((r) => ({ ...r, activo: Number(r.activo) === 1 }));
  },

  save(payload) {
    const nombre = String(payload.nombre || '').trim();
    if (!nombre) throw new Error('El nombre de la categoria es obligatorio.');
    const ts = db.now();
    const dup = db.get('SELECT id FROM categorias WHERE nombre = ? AND id <> ?', [nombre, payload.id || 0]);
    if (dup) throw new Error('Ya existe una categoria con ese nombre.');

    if (payload.id) {
      db.run('UPDATE categorias SET nombre=?, descripcion=?, activo=?, updated_at=? WHERE id=?', [
        nombre,
        payload.descripcion || '',
        payload.activo === false ? 0 : 1,
        ts,
        payload.id,
      ]);
      return db.get('SELECT * FROM categorias WHERE id = ?', [payload.id]);
    }
    const { id } = db.run(
      'INSERT INTO categorias (nombre, descripcion, activo, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [nombre, payload.descripcion || '', payload.activo === false ? 0 : 1, ts, ts],
    );
    return db.get('SELECT * FROM categorias WHERE id = ?', [id]);
  },

  remove(id) {
    const enUso = db.get('SELECT COUNT(*) AS n FROM productos WHERE categoria_id = ?', [id]);
    if (enUso && Number(enUso.n) > 0) {
      throw new Error('La categoria tiene productos asociados. Reasignalos antes de eliminarla.');
    }
    db.run('DELETE FROM categorias WHERE id = ?', [id]);
    return true;
  },
};

/* -------------------------------------------------------------------- */
/* Productos y servicios                                                 */
/* -------------------------------------------------------------------- */

const SELECT_BASE = `
  SELECT p.*, c.nombre AS categoria_nombre,
         CASE WHEN p.tipo = 'Producto' THEN 1 ELSE 0 END AS controla_stock,
         (p.precio - p.costo) AS margen_unitario,
         CASE WHEN p.precio > 0 THEN ((p.precio - p.costo) / p.precio) * 100 ELSE 0 END AS margen_pct,
         (SELECT COALESCE(SUM(i.cantidad), 0) FROM factura_items i
            JOIN facturas f ON f.id = i.factura_id
           WHERE i.producto_id = p.id AND f.estado <> 'Anulada') AS vendidos
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
`;

function decorate(row) {
  if (!row) return row;
  return { ...row, activo: Number(row.activo) === 1 };
}

function list({ q = '', categoria_id = '', tipo = '', activo = true, bajoStock = false, sort = 'nombre', dir = 'asc' } = {}) {
  const where = [];
  const params = [];

  if (q) {
    where.push('p.busqueda LIKE ?');
    params.push(like(q));
  }
  if (categoria_id) {
    where.push('p.categoria_id = ?');
    params.push(categoria_id);
  }
  if (tipo) {
    where.push('p.tipo = ?');
    params.push(tipo);
  }
  if (activo === true || activo === 'true') where.push('p.activo = 1');
  if (activo === false || activo === 'false') where.push('p.activo = 0');
  if (bajoStock) where.push("p.tipo = 'Producto' AND p.stock <= p.stock_minimo");

  const columnas = {
    nombre: 'p.nombre',
    codigo: 'p.codigo',
    precio: 'p.precio',
    stock: 'p.stock',
    vendidos: 'vendidos',
    margen_pct: 'margen_pct',
  };
  const orderBy = columnas[sort] || columnas.nombre;
  const direction = String(dir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  return db
    .all(`${SELECT_BASE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY ${orderBy} ${direction}`, params)
    .map(decorate);
}

function get(id) {
  return decorate(db.get(`${SELECT_BASE} WHERE p.id = ?`, [id]));
}

function nextCodigo(tipo = 'Producto') {
  const prefix = tipo === 'Servicio' ? 'SRV' : 'PRD';
  // Orden por el consecutivo numerico del sufijo: el orden textual falla a
  // partir de 10000 (PRD-10000 iria antes de PRD-9999).
  const rows = db.all('SELECT codigo FROM productos WHERE codigo LIKE ?', [`${prefix}-%`]);
  let n = 0;
  for (const row of rows) {
    const m = /(\d+)\s*$/.exec(row.codigo);
    if (m) n = Math.max(n, Number(m[1]));
  }
  return `${prefix}-${String(n + 1).padStart(4, '0')}`;
}

function save(payload) {
  const nombre = String(payload.nombre || '').trim();
  if (!nombre) throw new Error('El nombre del producto o servicio es obligatorio.');

  const tipo = payload.tipo === 'Servicio' ? 'Servicio' : 'Producto';
  const precio = Number(payload.precio) || 0;
  if (precio < 0) throw new Error('El precio no puede ser negativo.');

  const busqueda = normalize([payload.codigo, nombre, payload.descripcion].join(' '));
  const ts = db.now();

  const campos = [
    String(payload.codigo || '').trim() || nextCodigo(tipo),
    nombre,
    payload.descripcion || '',
    payload.categoria_id ? Number(payload.categoria_id) : null,
    tipo,
    payload.unidad || 'UND',
    precio,
    Number(payload.iva_pct) || 0,
    Number(payload.costo) || 0,
    tipo === 'Servicio' ? 0 : Number(payload.stock) || 0,
    Number(payload.stock_minimo) || 0,
    payload.activo === false || payload.activo === 0 ? 0 : 1,
    busqueda,
  ];

  if (payload.id) {
    const anterior = db.get('SELECT stock FROM productos WHERE id = ?', [payload.id]);
    db.run(
      `UPDATE productos SET codigo=?, nombre=?, descripcion=?, categoria_id=?, tipo=?, unidad=?,
              precio=?, iva_pct=?, costo=?, stock=?, stock_minimo=?, activo=?, busqueda=?, updated_at=?
        WHERE id = ?`,
      [...campos, ts, payload.id],
    );
    if (anterior && Number(anterior.stock) !== campos[9]) {
      registrarMovimiento(payload.id, 'Ajuste', campos[9] - Number(anterior.stock), 'Ajuste manual');
    }
    return get(payload.id);
  }

  const { id } = db.run(
    `INSERT INTO productos (codigo, nombre, descripcion, categoria_id, tipo, unidad, precio, iva_pct,
              costo, stock, stock_minimo, activo, busqueda, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...campos, ts, ts],
  );
  if (campos[9] !== 0) registrarMovimiento(id, 'Entrada', campos[9], 'Stock inicial');
  return get(id);
}

function remove(id) {
  const usado = db.get(
    `SELECT (SELECT COUNT(*) FROM cotizacion_items WHERE producto_id = ?)
          + (SELECT COUNT(*) FROM factura_items WHERE producto_id = ?) AS total`,
    [id, id],
  );
  if (usado && Number(usado.total) > 0) {
    throw new Error('El item ya fue usado en documentos. Desactivalo en lugar de eliminarlo.');
  }
  db.run('DELETE FROM productos WHERE id = ?', [id]);
  return true;
}

/** Registra un movimiento de inventario a partir del saldo ya escrito. */
function registrarMovimiento(productoId, tipo, cantidad, motivo, referencia = '') {
  const producto = db.get('SELECT stock FROM productos WHERE id = ?', [productoId]);
  if (!producto) return null;
  // El stock ya lo escribio quien llama (save/ajuste): aqui solo se lee el
  // saldo resultante y se deja constancia del movimiento.
  const saldo = Number(producto.stock) || 0;
  db.run(
    `INSERT INTO movimientos_inventario (producto_id, tipo, cantidad, saldo, motivo, referencia, fecha, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [productoId, tipo, cantidad, saldo, motivo || '', referencia, db.today(), db.now()],
  );
  return saldo;
}

/** Movimientos de inventario de un producto. */
function movimientos(productoId) {
  return db.all(
    'SELECT * FROM movimientos_inventario WHERE producto_id = ? ORDER BY id DESC LIMIT 100',
    [productoId],
  );
}

/** Productos con existencias por debajo del minimo. */
function alertasStock() {
  return db.all(
    `SELECT id, codigo, nombre, stock, stock_minimo, unidad
       FROM productos
      WHERE activo = 1 AND tipo = 'Producto' AND stock <= stock_minimo
      ORDER BY (stock - stock_minimo) ASC LIMIT 10`,
  );
}

module.exports = {
  categorias,
  list,
  get,
  save,
  remove,
  nextCodigo,
  movimientos,
  alertasStock,
  registrarMovimiento,
};
