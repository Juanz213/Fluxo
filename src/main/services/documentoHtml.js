'use strict';

const config = require('../repositories/config');
const { montoALetras } = require('../lib/letras');
const { decimals } = require('../lib/money');

/**
 * Plantillas HTML que alimentan el motor de impresion de Electron.
 * Se generan en el proceso principal para que el documento impreso sea
 * identico a lo que hay guardado en la base de datos.
 */

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value) {
  const d = decimals();
  const n = Number(value) || 0;
  return n.toLocaleString('es-CO', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fecha(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y}`;
}

const ESTILOS = `
  @page { size: A4; margin: 12mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 10.5px; color: #1f2a37; margin: 0; padding: 0;
  }
  .doc { width: 100%; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px;
           border-bottom: 3px solid #1d4ed8; padding-bottom: 10px; }
  .brand { display: flex; gap: 12px; align-items: flex-start; }
  .brand img { max-height: 56px; max-width: 150px; object-fit: contain; }
  .brand h1 { font-size: 16px; margin: 0 0 3px; color: #111827; letter-spacing: .2px; }
  .brand p { margin: 0; color: #4b5563; line-height: 1.45; }
  .badge {
    text-align: right; min-width: 190px;
  }
  .badge .tipo {
    display: inline-block; background: #1d4ed8; color: #fff; font-weight: 700;
    padding: 5px 12px; border-radius: 5px; font-size: 12px; letter-spacing: .6px;
  }
  .badge .numero { font-size: 15px; font-weight: 700; margin-top: 7px; color: #111827; }
  .badge .meta { margin-top: 5px; color: #4b5563; line-height: 1.5; }
  .badge .estado { margin-top: 6px; display: inline-block; font-weight: 700; font-size: 10px;
                   border: 1px solid #1d4ed8; color: #1d4ed8; border-radius: 4px; padding: 2px 8px; }
  .grid { display: flex; gap: 14px; margin-top: 14px; }
  .card { flex: 1; border: 1px solid #d7dce3; border-radius: 7px; padding: 9px 11px; }
  .card h2 { font-size: 9px; text-transform: uppercase; letter-spacing: .8px;
             color: #1d4ed8; margin: 0 0 6px; }
  .card .row { display: flex; gap: 6px; line-height: 1.6; }
  .card .row span:first-child { color: #6b7280; min-width: 74px; }
  .card strong { color: #111827; }
  table { width: 100%; border-collapse: collapse; margin-top: 14px; }
  thead th {
    background: #eef2ff; color: #1e3a8a; font-size: 9px; text-transform: uppercase;
    letter-spacing: .5px; text-align: left; padding: 7px 6px; border-bottom: 1px solid #c7d2fe;
  }
  tbody td { padding: 6px; border-bottom: 1px solid #eceff3; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #fafbfc; }
  .num { text-align: right; white-space: nowrap; }
  .center { text-align: center; }
  .desc small { display: block; color: #6b7280; }
  .totales { margin-top: 12px; display: flex; justify-content: flex-end; }
  .totales table { width: 290px; margin: 0; }
  .totales td { padding: 5px 6px; border-bottom: 1px solid #eceff3; }
  .totales tr.gran td { background: #1d4ed8; color: #fff; font-weight: 700; font-size: 12px;
                        border-bottom: none; }
  .letras { margin-top: 12px; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 7px 10px;
            font-size: 10px; color: #374151; }
  .notas { margin-top: 10px; display: flex; gap: 14px; }
  .notas .card { font-size: 9.5px; color: #4b5563; line-height: 1.55; }
  .firmas { margin-top: 26px; display: flex; justify-content: space-between; gap: 40px; }
  .firma { flex: 1; border-top: 1px solid #9ca3af; padding-top: 5px; font-size: 9px; color: #6b7280; }
  footer { margin-top: 16px; border-top: 1px solid #e5e7eb; padding-top: 7px;
           font-size: 8.5px; color: #6b7280; display: flex; justify-content: space-between; gap: 12px; }
  .aviso { color: #b45309; }
`;

function encabezadoEmpresa() {
  const cfg = config.all();
  const logo = cfg.empresa_logo
    ? `<img src="${escapeHtml(cfg.empresa_logo)}" alt="logo" />`
    : '';
  const contacto = [
    cfg.empresa_direccion,
    [cfg.empresa_ciudad, cfg.empresa_departamento].filter(Boolean).join(' - '),
  ].filter(Boolean).join('<br>');
  const contacto2 = [
    cfg.empresa_telefono ? `Tel: ${cfg.empresa_telefono}` : '',
    cfg.empresa_email,
    cfg.empresa_web,
  ].filter(Boolean).join(' &middot; ');

  return `
    <div class="brand">
      ${logo}
      <div>
        <h1>${escapeHtml(cfg.empresa_nombre)}</h1>
        <p>${contacto}${contacto2 ? `<br>${escapeHtml(contacto2)}` : ''}</p>
        ${cfg.empresa_nit ? `<p><strong>NIT:</strong> ${escapeHtml(cfg.empresa_nit)}${cfg.empresa_dv ? `-${escapeHtml(cfg.empresa_dv)}` : ''}</p>` : ''}
      </div>
    </div>`;
}

function filas(items) {
  return items
    .map((item, i) => `
      <tr>
        <td class="center">${i + 1}</td>
        <td class="desc">
          <strong>${escapeHtml(item.descripcion)}</strong>
          ${item.codigo ? `<small>Cod: ${escapeHtml(item.codigo)}</small>` : ''}
        </td>
        <td class="center">${escapeHtml(item.unidad || 'UND')}</td>
        <td class="num">${money(item.cantidad)}</td>
        <td class="num">${money(item.precio_unitario)}</td>
        <td class="num">${item.descuento_pct ? `${money(item.descuento_pct)}%` : '-'}</td>
        <td class="num">${item.iva_pct ? `${money(item.iva_pct)}%` : 'Excl.'}</td>
        <td class="num">${money(item.total)}</td>
      </tr>`)
    .join('');
}

function bloqueTotales(doc, conRetencion) {
  const filas = [];
  filas.push(`<tr><td>Subtotal</td><td class="num">${money(doc.subtotal)}</td></tr>`);
  if (Number(doc.descuento_valor)) {
    filas.push(`<tr><td>Descuento (${money(doc.descuento_pct)}%)</td><td class="num">-${money(doc.descuento_valor)}</td></tr>`);
  }
  filas.push(`<tr><td>IVA</td><td class="num">${money(doc.iva_valor)}</td></tr>`);
  if (conRetencion && Number(doc.retencion_valor)) {
    filas.push(`<tr><td>Retencion en la fuente (${money(doc.retencion_pct)}%)</td><td class="num">-${money(doc.retencion_valor)}</td></tr>`);
  }
  filas.push(`<tr class="gran"><td>${conRetencion ? 'TOTAL A PAGAR' : 'TOTAL'}</td><td class="num">${money(doc.total)}</td></tr>`);
  return `<div class="totales"><table>${filas.join('')}</table></div>`;
}

function bloqueCliente(cliente, titulo = 'Cliente') {
  if (!cliente) return '';
  const doc = [cliente.nit, cliente.dv ? `-${cliente.dv}` : ''].join('');
  return `
    <div class="card">
      <h2>${escapeHtml(titulo)}</h2>
      <div class="row"><span>Razon social</span><strong>${escapeHtml(cliente.nombre)}</strong></div>
      <div class="row"><span>Identificacion</span><strong>${escapeHtml(cliente.tipo_documento || '')} ${escapeHtml(doc)}</strong></div>
      ${cliente.contacto ? `<div class="row"><span>Contacto</span><strong>${escapeHtml(cliente.contacto)}</strong></div>` : ''}
      <div class="row"><span>Direccion</span><strong>${escapeHtml(cliente.direccion || '-')}</strong></div>
      <div class="row"><span>Ciudad</span><strong>${escapeHtml(cliente.ciudad || '-')}</strong></div>
      ${cliente.telefono ? `<div class="row"><span>Telefono</span><strong>${escapeHtml(cliente.telefono)}</strong></div>` : ''}
      ${cliente.email ? `<div class="row"><span>Correo</span><strong>${escapeHtml(cliente.email)}</strong></div>` : ''}
    </div>`;
}

function envolver({ titulo, contenido }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(titulo)}</title>
  <style>${ESTILOS}</style>
</head>
<body><div class="doc">
${contenido}
</div></body>
</html>`;
}

function cotizacionHtml(cot) {
  const cfg = config.all();
  const cliente = cot.cliente || {};
  return envolver({
    titulo: `Cotizacion ${cot.numero}`,
    contenido: `
      <header>
        ${encabezadoEmpresa()}
        <div class="badge">
          <div class="tipo">COTIZACION</div>
          <div class="numero">${escapeHtml(cot.numero)}</div>
          <div class="meta">
            Fecha: <strong>${fecha(cot.fecha)}</strong><br>
            Valida hasta: <strong>${fecha(cot.fecha_vencimiento)}</strong>
          </div>
          <div class="estado">${escapeHtml(String(cot.estado || '').toUpperCase())}</div>
        </div>
      </header>

      <div class="grid">
        ${bloqueCliente(cliente)}
        <div class="card">
          <h2>Condiciones</h2>
          <div class="row"><span>Asesor</span><strong>${escapeHtml(cot.asesor_nombre || cot.asesor?.nombre || '—')}</strong></div>
          <div class="row"><span>Validez</span><strong>${escapeHtml(cot.validez_dias)} dias</strong></div>
          <div class="row"><span>Pago</span><strong>${escapeHtml(cot.condicion_pago || '—')}</strong></div>
          <div class="row"><span>Moneda</span><strong>${escapeHtml(cfg.moneda)}</strong></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:26px" class="center">#</th>
            <th>Descripcion</th>
            <th style="width:44px" class="center">Und</th>
            <th style="width:56px" class="num">Cant.</th>
            <th style="width:80px" class="num">Vr. unit</th>
            <th style="width:52px" class="num">Desc.</th>
            <th style="width:48px" class="num">IVA</th>
            <th style="width:88px" class="num">Total</th>
          </tr>
        </thead>
        <tbody>${filas(cot.items || [])}</tbody>
      </table>

      ${bloqueTotales(cot, false)}

      <div class="letras">${escapeHtml(montoALetras(cot.total, cfg.moneda, 0))}</div>

      <div class="notas">
        <div class="card">
          <h2>Observaciones</h2>
          ${escapeHtml(cot.observaciones || 'Sin observaciones.')}
        </div>
        <div class="card">
          <h2>Condiciones comerciales</h2>
          Los precios cotizados estan sujetos a cambios sin previo aviso una vez vencida la vigencia.
          ${escapeHtml(cfg.leyenda_documento)}
        </div>
      </div>

      <div class="firmas">
        <div class="firma">Elaborado por<br><strong>${escapeHtml(cot.asesor_nombre || cot.asesor?.nombre || cfg.empresa_nombre)}</strong></div>
        <div class="firma">Aprobado por el cliente<br><strong>${escapeHtml(cliente.nombre || '')}</strong></div>
      </div>

      <footer>
        <span>${escapeHtml(cfg.pie_documento)}</span>
        <span class="aviso">${escapeHtml(cfg.leyenda_documento)}</span>
      </footer>`,
  });
}

function facturaHtml(fac) {
  const cfg = config.all();
  const cliente = fac.cliente || {};
  return envolver({
    titulo: `Factura ${fac.numero}`,
    contenido: `
      <header>
        ${encabezadoEmpresa()}
        <div class="badge">
          <div class="tipo">FACTURA DE VENTA</div>
          <div class="numero">${escapeHtml(fac.numero)}</div>
          <div class="meta">
            Emision: <strong>${fecha(fac.fecha)}</strong><br>
            Vence: <strong>${fecha(fac.fecha_vencimiento)}</strong>
          </div>
          <div class="estado">${escapeHtml(String(fac.estado || '').toUpperCase())}</div>
        </div>
      </header>

      <div class="grid">
        ${bloqueCliente(cliente, 'Adquiriente')}
        <div class="card">
          <h2>Detalles del documento</h2>
          <div class="row"><span>Asesor</span><strong>${escapeHtml(fac.asesor_nombre || fac.asesor?.nombre || '—')}</strong></div>
          <div class="row"><span>Forma pago</span><strong>${escapeHtml(fac.forma_pago || '—')}</strong></div>
          <div class="row"><span>Cotizacion</span><strong>${escapeHtml(fac.cotizacion_numero || '—')}</strong></div>
          <div class="row"><span>Moneda</span><strong>${escapeHtml(cfg.moneda)}</strong></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:26px" class="center">#</th>
            <th>Descripcion</th>
            <th style="width:44px" class="center">Und</th>
            <th style="width:56px" class="num">Cant.</th>
            <th style="width:80px" class="num">Vr. unit</th>
            <th style="width:52px" class="num">Desc.</th>
            <th style="width:48px" class="num">IVA</th>
            <th style="width:88px" class="num">Total</th>
          </tr>
        </thead>
        <tbody>${filas(fac.items || [])}</tbody>
      </table>

      ${bloqueTotales(fac, true)}

      <div class="letras">${escapeHtml(montoALetras(fac.total, cfg.moneda, 0))}</div>

      <div class="notas">
        <div class="card">
          <h2>Observaciones</h2>
          ${escapeHtml(fac.observaciones || 'Sin observaciones.')}
        </div>
        <div class="card">
          <h2>Cartera</h2>
          <div class="row"><span>Total</span><strong>${money(fac.total)}</strong></div>
          <div class="row"><span>Pagado</span><strong>${money(fac.pagado || 0)}</strong></div>
          <div class="row"><span>Saldo</span><strong>${money(fac.saldo != null ? fac.saldo : fac.total)}</strong></div>
        </div>
      </div>

      <div class="firmas">
        <div class="firma">Emitido por<br><strong>${escapeHtml(cfg.empresa_nombre)}</strong></div>
        <div class="firma">Recibido por<br><strong>${escapeHtml(cliente.nombre || '')}</strong></div>
      </div>

      <footer>
        <span>${escapeHtml(cfg.pie_documento)}</span>
        <span class="aviso">${escapeHtml(cfg.leyenda_documento)}</span>
      </footer>`,
  });
}

function bloqueProveedor(proveedor, titulo = 'Proveedor') {
  if (!proveedor) return '';
  const doc = [proveedor.nit, proveedor.dv ? `-${proveedor.dv}` : ''].join('');
  return `
    <div class="card">
      <h2>${escapeHtml(titulo)}</h2>
      <div class="row"><span>Razon social</span><strong>${escapeHtml(proveedor.nombre)}</strong></div>
      <div class="row"><span>Identificacion</span><strong>${escapeHtml(doc || '-')}</strong></div>
      ${proveedor.contacto ? `<div class="row"><span>Contacto</span><strong>${escapeHtml(proveedor.contacto)}</strong></div>` : ''}
      <div class="row"><span>Direccion</span><strong>${escapeHtml(proveedor.direccion || '-')}</strong></div>
      <div class="row"><span>Ciudad</span><strong>${escapeHtml(proveedor.ciudad || '-')}</strong></div>
      ${proveedor.telefono ? `<div class="row"><span>Telefono</span><strong>${escapeHtml(proveedor.telefono)}</strong></div>` : ''}
      ${proveedor.email ? `<div class="row"><span>Correo</span><strong>${escapeHtml(proveedor.email)}</strong></div>` : ''}
    </div>`;
}

function gastoHtml(gas) {
  const cfg = config.all();
  const proveedor = gas.proveedor || {};
  return envolver({
    titulo: `Gasto ${gas.numero}`,
    contenido: `
      <header>
        ${encabezadoEmpresa()}
        <div class="badge">
          <div class="tipo">FACTURA DE GASTO</div>
          <div class="numero">${escapeHtml(gas.numero)}</div>
          <div class="meta">
            Emision: <strong>${fecha(gas.fecha)}</strong><br>
            Vence: <strong>${fecha(gas.fecha_vencimiento)}</strong>
          </div>
          <div class="estado">${escapeHtml(String(gas.estado || '').toUpperCase())}</div>
        </div>
      </header>

      <div class="grid">
        ${bloqueProveedor(proveedor)}
        <div class="card">
          <h2>Detalles del gasto</h2>
          <div class="row"><span>Categoria</span><strong>${escapeHtml(gas.categoria || '—')}</strong></div>
          <div class="row"><span>Forma pago</span><strong>${escapeHtml(gas.forma_pago || '—')}</strong></div>
          <div class="row"><span>Moneda</span><strong>${escapeHtml(cfg.moneda)}</strong></div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:26px" class="center">#</th>
            <th>Descripcion</th>
            <th style="width:44px" class="center">Und</th>
            <th style="width:56px" class="num">Cant.</th>
            <th style="width:80px" class="num">Vr. unit</th>
            <th style="width:52px" class="num">Desc.</th>
            <th style="width:48px" class="num">IVA</th>
            <th style="width:88px" class="num">Total</th>
          </tr>
        </thead>
        <tbody>${filas(gas.items || [])}</tbody>
      </table>

      ${bloqueTotales(gas, true)}

      <div class="letras">${escapeHtml(montoALetras(gas.total, cfg.moneda, 0))}</div>

      <div class="notas">
        <div class="card">
          <h2>Observaciones</h2>
          ${escapeHtml(gas.observaciones || 'Sin observaciones.')}
        </div>
        <div class="card">
          <h2>Cuenta por pagar</h2>
          <div class="row"><span>Total</span><strong>${money(gas.total)}</strong></div>
          <div class="row"><span>Pagado</span><strong>${money(gas.pagado || 0)}</strong></div>
          <div class="row"><span>Saldo</span><strong>${money(gas.saldo != null ? gas.saldo : gas.total)}</strong></div>
        </div>
      </div>

      <div class="firmas">
        <div class="firma">Recibido de<br><strong>${escapeHtml(proveedor.nombre || '')}</strong></div>
        <div class="firma">Autorizado por<br><strong>${escapeHtml(cfg.empresa_nombre)}</strong></div>
      </div>

      <footer>
        <span>${escapeHtml(cfg.pie_documento)}</span>
        <span class="aviso">${escapeHtml(cfg.leyenda_documento)}</span>
      </footer>`,
  });
}

/** Listado generico imprimible (informes). */
function tablaHtml({ titulo, subtitulo, columnas, filas: rows }) {
  const th = columnas.map((c) => `<th class="${c.num ? 'num' : ''}">${escapeHtml(c.titulo)}</th>`).join('');
  const tr = rows
    .map(
      (row) =>
        `<tr>${columnas
          .map((c) => `<td class="${c.num ? 'num' : ''}">${escapeHtml(c.valor(row))}</td>`)
          .join('')}</tr>`,
    )
    .join('');

  return envolver({
    titulo,
    contenido: `
      <header>
        ${encabezadoEmpresa()}
        <div class="badge">
          <div class="tipo">INFORME</div>
          <div class="numero">${escapeHtml(titulo)}</div>
          <div class="meta">${escapeHtml(subtitulo || '')}<br>Generado: ${fecha(new Date().toISOString().slice(0, 10))}</div>
        </div>
      </header>
      <table>
        <thead><tr>${th}</tr></thead>
        <tbody>${tr}</tbody>
      </table>
      <footer><span>${escapeHtml(config.get('empresa_nombre'))}</span><span>${escapeHtml(config.get('leyenda_documento'))}</span></footer>`,
  });
}

module.exports = { cotizacionHtml, facturaHtml, gastoHtml, tablaHtml, escapeHtml, money, fecha };
