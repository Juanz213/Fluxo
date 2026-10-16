/* ==========================================================================
   Fluxo · Editor de documentos (cotizaciones y facturas)
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, hoyISO, sumarDias, decimales } = VP.utils;
  const { $, $$, el } = VP.dom;
  const ui = VP.ui;

  /* ------------------------------------------------------------------ */
  /* Calculo en el cliente (espejo del motor del proceso principal)      */
  /* ------------------------------------------------------------------ */

  function redondear(valor) {
    const factor = 10 ** decimales();
    const n = Number(valor) || 0;
    return Math.round((n + Number.EPSILON) * factor) / factor;
  }

  function calcular(items, descuentoPct, retencionPct) {
    const lineas = items.map((item) => {
      const cantidad = Number(item.cantidad) || 0;
      const precio = Number(item.precio_unitario) || 0;
      const desc = Math.min(100, Math.max(0, Number(item.descuento_pct) || 0));
      const ivaPct = Math.min(100, Math.max(0, Number(item.iva_pct) || 0));
      const bruto = cantidad * precio;
      const subtotal = redondear(bruto - bruto * (desc / 100));
      const iva = redondear(subtotal * (ivaPct / 100));
      return { ...item, subtotal, iva_valor: iva, total: redondear(subtotal + iva) };
    });

    const subtotal = redondear(lineas.reduce((acc, l) => acc + l.subtotal, 0));
    const ivaBruto = redondear(lineas.reduce((acc, l) => acc + l.iva_valor, 0));
    const dPct = Math.min(100, Math.max(0, Number(descuentoPct) || 0));
    const rPct = Math.min(100, Math.max(0, Number(retencionPct) || 0));

    const descuentoValor = redondear(subtotal * (dPct / 100));
    const base = redondear(subtotal - descuentoValor);
    const ivaValor = redondear(ivaBruto * (1 - dPct / 100));
    const brutoTotal = redondear(base + ivaValor);
    const retencionValor = redondear(brutoTotal * (rPct / 100));
    const total = redondear(brutoTotal - retencionValor);

    return { lineas, subtotal, descuento_pct: dPct, descuento_valor: descuentoValor, base, iva_valor: ivaValor, retencion_pct: rPct, retencion_valor: retencionValor, total };
  }

  const UNIDADES = ['UND', 'LIC', 'SRV', 'HRS', 'MES', 'PTO', 'KG', 'MTS', 'CAJA', 'PAQ'];
  const IVAS = [19, 5, 0];

  /* ------------------------------------------------------------------ */
  /* Catalogos auxiliares                                                */
  /* ------------------------------------------------------------------ */

  const cache = { clientes: null, asesores: null, productos: null, categorias: null };

  async function cargarCatalogos() {
    const [clientes, asesores, productos, categorias] = await Promise.all([
      cache.clientes ? Promise.resolve(cache.clientes) : VP.api.clientes({ activo: true }),
      cache.asesores ? Promise.resolve(cache.asesores) : VP.api.asesores({ activo: true }),
      cache.productos ? Promise.resolve(cache.productos) : VP.api.productos({ activo: true }),
      cache.categorias ? Promise.resolve(cache.categorias) : VP.api.categorias({ soloActivas: true }),
    ]);
    cache.clientes = clientes;
    cache.asesores = asesores;
    cache.productos = productos;
    cache.categorias = categorias;
    return cache;
  }

  VP.documentoCache = { limpiar: () => Object.keys(cache).forEach((k) => { cache[k] = null; }) };

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * Abre el editor de cotizacion o factura.
   * @param {object} opciones { tipo, id, cotizacionId, alGuardar }
   */
  async function abrir(opciones = {}) {
    const tipo = opciones.tipo === 'factura' ? 'factura' : 'cotizacion';
    const esFactura = tipo === 'factura';

    let documento = null;
    let cotizacionOrigen = null;

    if (opciones.id) {
      documento = esFactura ? await VP.api.factura(opciones.id) : await VP.api.cotizacion(opciones.id);
    } else if (esFactura && opciones.cotizacionId) {
      cotizacionOrigen = await VP.api.cotizacion(opciones.cotizacionId);
    }

    const catalogo = await cargarCatalogos();
    const cfg = VP.state.config;

    /* ---------------- Estado del formulario ---------------- */

    const estado = {
      tipo,
      id: documento ? documento.id : null,
      items: documento
        ? documento.items.map((i) => ({
            producto_id: i.producto_id,
            codigo: i.codigo,
            descripcion: i.descripcion,
            unidad: i.unidad,
            cantidad: Number(i.cantidad),
            precio_unitario: Number(i.precio_unitario),
            descuento_pct: Number(i.descuento_pct),
            iva_pct: Number(i.iva_pct),
          }))
        : cotizacionOrigen
          ? cotizacionOrigen.items.map((i) => ({
              producto_id: i.producto_id,
              codigo: i.codigo,
              descripcion: i.descripcion,
              unidad: i.unidad,
              cantidad: Number(i.cantidad),
              precio_unitario: Number(i.precio_unitario),
              descuento_pct: Number(i.descuento_pct),
              iva_pct: Number(i.iva_pct),
            }))
          : [],
    };

    if (!estado.items.length) {
      estado.items = [];
    }

    const base = documento || cotizacionOrigen || {};

    const valores = {
      cliente_id: base.cliente_id || (opciones.clienteInicial ? Number(opciones.clienteInicial) : '') || '',
      asesor_id: base.asesor_id || '',
      fecha: base.fecha || hoyISO(),
      validez_dias: base.validez_dias !== undefined ? base.validez_dias : Number(cfg.cot_validez_dias || 30),
      dias_credito: Number(cfg.fac_dias_credito || 30),
      fecha_vencimiento: base.fecha_vencimiento || '',
      estado: base.estado || 'Borrador',
      descuento_pct: Number(base.descuento_pct) || 0,
      retencion_pct: Number(base.retencion_pct) || 0,
      condicion_pago: base.condicion_pago || 'Credito 30 dias',
      forma_pago: base.forma_pago || 'Transferencia',
      observaciones: base.observaciones || '',
    };

    const numeroActual = documento ? documento.numero : null;

    /* ---------------- Plantilla ---------------- */

    const opcionesClientes = catalogo.clientes
      .map((c) => `<option value="${c.id}">${escapeHtml(c.codigo)} · ${escapeHtml(c.nombre)}${c.ciudad ? ` — ${escapeHtml(c.ciudad)}` : ''}</option>`)
      .join('');

    const opcionesAsesores = catalogo.asesores
      .map((a) => `<option value="${a.id}">${escapeHtml(a.nombre)}${a.zona ? ` — ${escapeHtml(a.zona)}` : ''}</option>`)
      .join('');

    const opcionesEstados = (esFactura ? ['Emitida'] : ['Borrador', 'Enviada', 'Aprobada', 'Rechazada'])
      .map((e) => `<option value="${e}" ${e === valores.estado ? 'selected' : ''}>${e}</option>`)
      .join('');

    const contenido = `
      <div class="doc-editor">
        <div class="row row--wrap" style="gap:12px;align-items:flex-end">
          ${ui.pista(
            esFactura
              ? 'La numeracion de facturas es consecutiva y no se puede editar. Al guardar se descuenta el inventario de los productos.'
              : 'Cotiza rapido: agrega lineas desde el catalogo o escribelas libremente. Los totales los valida el sistema al guardar.',
            esFactura ? 'factura' : 'cotizacion',
          )}
        </div>

        <div class="section-title">Datos generales</div>
        <div class="doc-head">
          <div class="field" style="grid-column:span 2">
            <label>Cliente <span class="req">*</span></label>
            <div class="row" style="gap:8px">
              <input class="input" type="text" placeholder="Filtrar clientes..." data-filtro="cliente" style="max-width:150px" />
              <select class="select" name="cliente_id" style="flex:1">
                <option value="">Selecciona un cliente...</option>
                ${opcionesClientes}
              </select>
            </div>
          </div>

          <div class="field">
            <label>Asesor comercial</label>
            <select class="select" name="asesor_id">
              <option value="">Sin asignar</option>
              ${opcionesAsesores}
            </select>
          </div>

          <div class="field">
            <label>Fecha de emision</label>
            <input class="input" type="date" name="fecha" value="${valores.fecha}" />
          </div>

          ${esFactura
            ? `<div class="field">
                 <label>Dias de credito</label>
                 <input class="input" type="number" name="dias_credito" min="0" step="1" value="${valores.dias_credito}" />
               </div>`
            : `<div class="field">
                 <label>Validez (dias)</label>
                 <input class="input" type="number" name="validez_dias" min="0" step="1" value="${valores.validez_dias}" />
               </div>`}

          <div class="field">
            <label>Vence el</label>
            <input class="input" type="date" name="fecha_vencimiento" value="${escapeHtml(valores.fecha_vencimiento)}" />
          </div>

          ${esFactura
            ? `<div class="field">
                 <label>Forma de pago</label>
                 <select class="select" name="forma_pago">
                   ${['Transferencia', 'Contado', 'Tarjeta', 'Cheque', 'Otro'].map((f) => `<option value="${f}" ${f === valores.forma_pago ? 'selected' : ''}>${f}</option>`).join('')}
                 </select>
               </div>`
            : `<div class="field">
                 <label>Condicion de pago</label>
                 <select class="select" name="condicion_pago">
                   ${['Contado', 'Credito 15 dias', 'Credito 30 dias', 'Credito 45 dias', 'Credito 60 dias', 'Credito 90 dias'].map((f) => `<option value="${f}" ${f === valores.condicion_pago ? 'selected' : ''}>${f}</option>`).join('')}
                 </select>
               </div>
               <div class="field">
                 <label>Estado</label>
                 <select class="select" name="estado">${opcionesEstados}</select>
               </div>`}
        </div>

        <div class="section-title" style="margin-top:6px">Lineas del documento</div>
        <div class="row" style="gap:8px;align-items:flex-end">
          <div class="field" style="flex:1;max-width:420px">
            <label>Agregar desde el catalogo</label>
            <select class="select" data-selector-producto>
              <option value="">Selecciona un producto o servicio...</option>
              ${catalogo.categorias
                .map((cat) => {
                  const items = catalogo.productos.filter((p) => p.categoria_id === cat.id);
                  if (!items.length) return '';
                  return `<optgroup label="${escapeHtml(cat.nombre)}">${items
                    .map((p) => `<option value="${p.id}">${escapeHtml(p.codigo)} · ${escapeHtml(p.nombre)} — ${escapeHtml(formatMoneda(p.precio))}</option>`)
                    .join('')}</optgroup>`;
                })
                .join('')}
            </select>
          </div>
          <button class="btn" type="button" data-accion="linea-libre">${icon('mas', 16)} Linea libre</button>
        </div>

        <div class="table-wrap">
          <table class="items-table">
            <thead>
              <tr>
                <th style="width:32px"></th>
                <th>Descripcion</th>
                <th style="width:74px">Unidad</th>
                <th style="width:84px" class="num">Cantidad</th>
                <th style="width:118px" class="num">Vr. unitario</th>
                <th style="width:74px" class="num">Desc.%</th>
                <th style="width:74px" class="num">IVA %</th>
                <th style="width:118px" class="num">Total</th>
              </tr>
            </thead>
            <tbody data-items></tbody>
          </table>
        </div>

        <div class="grid grid--3" style="align-items:start">
          <div class="field" style="grid-column:span 2">
            <label>Observaciones</label>
            <textarea class="textarea" name="observaciones" rows="3" placeholder="Notas, condiciones especiales, tiempos de entrega...">${escapeHtml(valores.observaciones)}</textarea>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="field">
              <label>Descuento global (%)</label>
              <input class="input" type="number" name="descuento_pct" min="0" max="100" step="0.5" value="${valores.descuento_pct}" />
            </div>
            ${esFactura
              ? `<div class="field">
                   <label>Retencion en la fuente (%)</label>
                   <input class="input" type="number" name="retencion_pct" min="0" max="100" step="0.5" value="${valores.retencion_pct}" />
                 </div>`
              : ''}
          </div>
        </div>

        <div class="totales-panel">
          <div class="totales-box" data-totales></div>
        </div>
      </div>`;

    const controlador = ui.modal({
      titulo: documento
        ? `Editar ${esFactura ? 'factura' : 'cotizacion'} ${numeroActual}`
        : cotizacionOrigen
          ? `Facturar cotizacion ${cotizacionOrigen.numero}`
          : esFactura
            ? 'Nueva factura de venta'
            : 'Nueva cotizacion',
      subtitulo: esFactura
        ? 'Documento de control interno con descuento de inventario.'
        : 'Se genera un consecutivo nuevo al guardar.',
      tamano: 'xl',
      contenido,
      bloqueo: true,
      acciones: [
        { texto: 'Cancelar' },
        esFactura
          ? { texto: 'Guardar y ver PDF', tipo: 'primary', icono: 'factura', cerrar: false, accion: (c) => guardar(c, 'pdf') }
          : { texto: 'Guardar borrador', icono: 'documento', cerrar: false, accion: (c) => guardar(c, 'borrador') },
        esFactura ? null : { texto: 'Guardar y generar PDF', tipo: 'primary', icono: 'imprimir', cerrar: false, accion: (c) => guardar(c, 'pdf') },
      ].filter(Boolean),
      alCerrar: () => {
        if (opciones.alCerrar) opciones.alCerrar();
      },
    });

    const raiz = controlador.raiz;
    const tbody = $('[data-items]', raiz);

    /* ---------------- Render de lineas ---------------- */

    function filaHtml(item, indice) {
      return `
        <tr data-fila="${indice}">
          <td class="center">
            <button class="btn btn--ghost btn--icon" type="button" data-quitar="${indice}" title="Quitar linea">${icon('borrar', 15)}</button>
          </td>
          <td>
            <input class="input desc-input" type="text" data-campo="descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Descripcion del producto o servicio" />
            ${item.codigo ? `<span class="text-muted" style="font-size:11px">${escapeHtml(item.codigo)}</span>` : ''}
          </td>
          <td>
            <select class="select" data-campo="unidad">
              ${UNIDADES.map((u) => `<option value="${u}" ${u === item.unidad ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </td>
          <td><input class="input num" type="number" step="0.01" min="0" data-campo="cantidad" value="${item.cantidad}" style="text-align:right" /></td>
          <td><input class="input num" type="number" step="1" min="0" data-campo="precio_unitario" value="${item.precio_unitario}" style="text-align:right" /></td>
          <td><input class="input num" type="number" step="0.5" min="0" max="100" data-campo="descuento_pct" value="${item.descuento_pct}" style="text-align:right" /></td>
          <td>
            <select class="select" data-campo="iva_pct" style="text-align:right">
              ${IVAS.map((v) => `<option value="${v}" ${Number(item.iva_pct) === v ? 'selected' : ''}>${v}%</option>`).join('')}
            </select>
          </td>
          <td class="line-total num" data-total-linea="${indice}">—</td>
        </tr>`;
    }

    function pintarLineas() {
      if (!estado.items.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="center text-muted" style="padding:22px">Sin lineas. Agrega productos desde el catalogo o crea una linea libre.</td></tr>`;
      } else {
        tbody.innerHTML = estado.items.map((item, i) => filaHtml(item, i)).join('');
      }
      actualizarTotales();
    }

    /* ---------------- Totales ---------------- */

    function leerValores() {
      const form = ui.leerFormulario(raiz);
      return {
        descuento: Number(form.descuento_pct) || 0,
        retencion: Number(form.retencion_pct) || 0,
      };
    }

    function actualizarTotales() {
      const { descuento, retencion } = leerValores();
      const resultado = calcular(estado.items, descuento, retencion);

      resultado.lineas.forEach((linea, i) => {
        const celda = $(`[data-total-linea="${i}"]`, raiz);
        if (celda) celda.textContent = formatMoneda(linea.total);
      });

      const filas = [
        `<div class="fila"><span>Subtotal</span><strong>${formatMoneda(resultado.subtotal)}</strong></div>`,
      ];
      if (resultado.descuento_valor) {
        filas.push(`<div class="fila fila--desc"><span>Descuento (${formatNumero(resultado.descuento_pct)}%)</span><strong>-${formatMoneda(resultado.descuento_valor)}</strong></div>`);
      }
      filas.push(`<div class="fila"><span>IVA</span><strong>${formatMoneda(resultado.iva_valor)}</strong></div>`);
      if (resultado.retencion_valor) {
        filas.push(`<div class="fila fila--desc"><span>Retencion (${formatNumero(resultado.retencion_pct)}%)</span><strong>-${formatMoneda(resultado.retencion_valor)}</strong></div>`);
      }
      filas.push(`<div class="fila fila--total"><span>${esFactura ? 'Total a pagar' : 'Total'}</span><strong>${formatMoneda(resultado.total)}</strong></div>`);

      $('[data-totales]', raiz).innerHTML = filas.join('');
      return resultado;
    }

    function itemDesdeProducto(producto) {
      return {
        producto_id: producto.id,
        codigo: producto.codigo,
        descripcion: producto.nombre,
        unidad: producto.unidad || 'UND',
        cantidad: 1,
        precio_unitario: Number(producto.precio) || 0,
        descuento_pct: 0,
        iva_pct: Number(producto.iva_pct) ?? 19,
      };
    }

    /* ---------------- Eventos ---------------- */

    $('[data-selector-producto]', raiz).addEventListener('change', (evento) => {
      const id = Number(evento.target.value);
      if (!id) return;
      const producto = catalogo.productos.find((p) => p.id === id);
      evento.target.value = '';
      if (!producto) return;
      const existente = estado.items.find((i) => i.producto_id === id);
      if (existente) {
        existente.cantidad = Number(existente.cantidad) + 1;
      } else {
        estado.items.push(itemDesdeProducto(producto));
      }
      pintarLineas();
      const ultima = $(`[data-fila="${estado.items.length - 1}"] [data-campo="cantidad"]`, raiz);
      if (ultima) ultima.focus();
    });

    $('[data-accion="linea-libre"]', raiz).addEventListener('click', () => {
      estado.items.push({
        producto_id: null,
        codigo: '',
        descripcion: '',
        unidad: 'UND',
        cantidad: 1,
        precio_unitario: 0,
        descuento_pct: 0,
        iva_pct: 19,
      });
      pintarLineas();
      const campo = $(`[data-fila="${estado.items.length - 1}"] [data-campo="descripcion"]`, raiz);
      if (campo) campo.focus();
    });

    tbody.addEventListener('input', (evento) => {
      const campo = evento.target.closest('[data-campo]');
      if (!campo) return;
      const fila = campo.closest('[data-fila]');
      const indice = Number(fila.getAttribute('data-fila'));
      const item = estado.items[indice];
      if (!item) return;
      const clave = campo.getAttribute('data-campo');
      item[clave] = campo.type === 'number' ? Number(campo.value) || 0 : campo.value;
      actualizarTotales();
    });

    tbody.addEventListener('change', (evento) => {
      const campo = evento.target.closest('select[data-campo]');
      if (!campo) return;
      const fila = campo.closest('[data-fila]');
      const item = estado.items[Number(fila.getAttribute('data-fila'))];
      if (!item) return;
      const clave = campo.getAttribute('data-campo');
      item[clave] = clave === 'unidad' ? campo.value : Number(campo.value);
      actualizarTotales();
    });

    tbody.addEventListener('click', (evento) => {
      const boton = evento.target.closest('[data-quitar]');
      if (!boton) return;
      estado.items.splice(Number(boton.getAttribute('data-quitar')), 1);
      pintarLineas();
    });

    const actualizarVencimiento = () => {
      const fecha = $('[name="fecha"]', raiz).value || hoyISO();
      const dias = esFactura
        ? Number($('[name="dias_credito"]', raiz).value) || 0
        : Number($('[name="validez_dias"]', raiz).value) || 0;
      $('[name="fecha_vencimiento"]', raiz).value = sumarDias(fecha, dias);
    };

    ['fecha', esFactura ? 'dias_credito' : 'validez_dias'].forEach((nombre) => {
      $(`[name="${nombre}"]`, raiz).addEventListener('change', actualizarVencimiento);
    });

    ['descuento_pct', 'retencion_pct'].forEach((nombre) => {
      const campo = $(`[name="${nombre}"]`, raiz);
      if (campo) campo.addEventListener('input', actualizarTotales);
    });

    // Filtro rapido de clientes
    const filtroCliente = $('[data-filtro="cliente"]', raiz);
    const selectCliente = $('[name="cliente_id"]', raiz);
    const opcionesClienteOriginal = Array.from(selectCliente.options);
    filtroCliente.addEventListener('input', () => {
      const termino = VP.utils.normalizar(filtroCliente.value);
      const seleccionado = selectCliente.value;
      selectCliente.innerHTML = '';
      opcionesClienteOriginal
        .filter((o) => !o.value || VP.utils.normalizar(o.textContent).includes(termino))
        .forEach((o) => selectCliente.appendChild(o.cloneNode(true)));
      selectCliente.value = seleccionado;
      if (!selectCliente.value && selectCliente.options.length === 2) {
        selectCliente.selectedIndex = 1;
        sincronizarCliente();
      }
    });

    // Asignacion automatica del asesor del cliente
    function sincronizarCliente() {
      if (documento && documento.asesor_id) return;
      if (cotizacionOrigen) return;
      const cliente = catalogo.clientes.find((c) => c.id === Number(selectCliente.value));
      if (cliente && cliente.asesor_id) $('[name="asesor_id"]', raiz).value = cliente.asesor_id;
    }
    selectCliente.addEventListener('change', sincronizarCliente);

    /* ---------------- Guardar ---------------- */

    async function guardar(controladorModal, accion) {
      ui.limpiarInvalidos(raiz);

      const datos = ui.leerFormulario(raiz);

      if (!datos.cliente_id) {
        ui.marcarInvalido(raiz, 'cliente_id', 'Selecciona un cliente.');
        toastError('Selecciona el cliente del documento.');
        return;
      }

      const items = estado.items
        .filter((i) => String(i.descripcion || '').trim())
        .map((i) => ({
          producto_id: i.producto_id || null,
          codigo: i.codigo || '',
          descripcion: i.descripcion.trim(),
          unidad: i.unidad,
          cantidad: Number(i.cantidad) || 0,
          precio_unitario: Number(i.precio_unitario) || 0,
          descuento_pct: Number(i.descuento_pct) || 0,
          iva_pct: Number(i.iva_pct) || 0,
        }));

      if (!items.length) {
        toastError('Agrega al menos una linea con descripcion.');
        return;
      }

      if (items.some((i) => i.cantidad <= 0)) {
        toastError('Todas las lineas deben tener una cantidad mayor a cero.');
        return;
      }

      const payload = {
        id: estado.id || undefined,
        cotizacion_id: cotizacionOrigen ? cotizacionOrigen.id : undefined,
        cliente_id: Number(datos.cliente_id),
        asesor_id: datos.asesor_id ? Number(datos.asesor_id) : null,
        fecha: datos.fecha,
        fecha_vencimiento: datos.fecha_vencimiento,
        descuento_pct: Number(datos.descuento_pct) || 0,
        observaciones: datos.observaciones || '',
        items,
      };

      if (esFactura) {
        payload.dias_credito = Number(datos.dias_credito) || 0;
        payload.forma_pago = datos.forma_pago || 'Transferencia';
        payload.retencion_pct = Number(datos.retencion_pct) || 0;
      } else {
        payload.validez_dias = Number(datos.validez_dias) || 0;
        payload.condicion_pago = datos.condicion_pago || '';
        payload.estado = datos.estado || 'Borrador';
      }

      const botones = $$('.modal__foot .btn', raiz);
      botones.forEach((b) => { b.disabled = true; });

      try {
        const guardado = esFactura
          ? await VP.api.guardarFactura(payload)
          : await VP.api.guardarCotizacion(payload);

        ui.aviso.exito(
          `${esFactura ? 'Factura' : 'Cotizacion'} ${guardado.numero} guardada correctamente.`,
          'Documento guardado',
        );

        VP.documentoCache.limpiar();
        controladorModal.cerrar(guardado);

        if (accion === 'pdf') {
          await VP.api.documento(esFactura ? 'factura' : 'cotizacion', guardado.id, 'previsualizar');
        }
        if (opciones.alGuardar) opciones.alGuardar(guardado);
      } catch (error) {
        ui.aviso.error(error.message);
        botones.forEach((b) => { b.disabled = false; });
      }
    }

    function toastError(mensaje) {
      ui.aviso.aviso(mensaje);
    }

    pintarLineas();
    actualizarVencimiento();
    if (opciones.clienteInicial && !documento && !cotizacionOrigen) sincronizarCliente();
    return controlador;
  }

  /* ------------------------------------------------------------------ */
  /* Acciones sobre documentos existentes                                */
  /* ------------------------------------------------------------------ */

  async function verDocumento(tipo, id, accion = 'previsualizar') {
    try {
      const resultado = await VP.api.documento(tipo, id, accion);
      if (resultado && resultado.cancelado) return;
      if (resultado && resultado.ruta) {
        ui.aviso.exito('Documento guardado.', 'PDF generado');
      }
      return resultado;
    } catch (error) {
      ui.aviso.error(error.message);
      return null;
    }
  }

  /** Menu rapido de impresion / PDF para una fila. */
  function menuDocumento(tipo, id) {
    ui.modal({
      titulo: 'Documento',
      subtitulo: 'Elige que hacer con este documento.',
      tamano: 'sm',
      contenido: `
        <div class="stack" style="gap:9px">
          <button class="btn btn--block" type="button" data-doc="previsualizar">${icon('ver', 16)} Vista previa</button>
          <button class="btn btn--block" type="button" data-doc="imprimir">${icon('imprimir', 16)} Enviar a impresora</button>
          <button class="btn btn--block btn--primary" type="button" data-doc="guardar">${icon('descargar', 16)} Guardar como PDF</button>
        </div>`,
      acciones: [{ texto: 'Cerrar' }],
    }).raiz.querySelectorAll('[data-doc]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        await verDocumento(tipo, id, boton.getAttribute('data-doc'));
      });
    });
  }

  VP.documento = { abrir, verDocumento, menuDocumento, calcular, redondear };
})();
