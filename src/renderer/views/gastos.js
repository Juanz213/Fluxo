/* ==========================================================================
   Fluxo · Gastos (facturas de compra a proveedores)
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, formatFecha, recortar, hoyISO, sumarDias } = VP.utils;
  const { $, $$ } = VP.dom;
  const ui = VP.ui;

  const UNIDADES = ['UND', 'LIC', 'SRV', 'HRS', 'MES', 'PTO', 'KG', 'MTS', 'CAJA', 'PAQ'];
  const IVAS = [19, 5, 0];

  const filtros = {
    q: '',
    grupo: 'todas',
    estado: '',
    proveedor_id: '',
    categoria: '',
    desde: '',
    hasta: '',
    orden: { clave: 'fecha', dir: 'desc' },
  };

  let filas = [];
  let proveedores = [];
  let raizActual = null;

  function metodos() {
    return VP.utils.listaConfig('metodos_pago', ['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro']);
  }
  function categorias() {
    return VP.utils.listaConfig('categorias_gasto', []);
  }

  function parametros() {
    return {
      q: filtros.q,
      estado: filtros.estado,
      estadoGrupo: filtros.grupo === 'todas' ? '' : filtros.grupo,
      proveedor_id: filtros.proveedor_id,
      categoria: filtros.categoria,
      desde: filtros.desde,
      hasta: filtros.hasta,
      sort: filtros.orden.clave,
      dir: filtros.orden.dir,
    };
  }

  async function recargar(raiz) {
    raizActual = raiz;
    [filas] = await Promise.all([VP.api.gastos(parametros())]);
    pintar(raiz);
  }

  async function montar(raiz, acciones, params = {}) {
    raizActual = raiz;
    proveedores = await VP.api.proveedores({ activo: true, sort: 'nombre', dir: 'asc' });

    acciones.innerHTML = `
      <button class="btn" type="button" data-accion="exportar">${icon('descargar', 16)} Exportar</button>
      <button class="btn btn--primary" type="button" data-accion="nuevo">${icon('mas', 16)} Registrar gasto</button>`;

    raiz.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="table-toolbar">
            <div class="search">
              ${icon('buscar')}
              <label class="hidden" for="gas-buscar">Buscar</label>
              <input class="input" id="gas-buscar" type="search" placeholder="Buscar por numero o proveedor..." value="${escapeHtml(filtros.q)}" />
            </div>
            <select class="select" data-filtro="grupo" style="width:150px">
              ${[['todas', 'Todos'], ['cartera', 'Por pagar'], ['pagadas', 'Pagados']]
                .map(([v, t]) => `<option value="${v}" ${filtros.grupo === v ? 'selected' : ''}>${t}</option>`)
                .join('')}
            </select>
            <select class="select" data-filtro="proveedor_id" style="width:190px">
              <option value="">Todos los proveedores</option>
              ${proveedores.map((p) => `<option value="${p.id}" ${String(filtros.proveedor_id) === String(p.id) ? 'selected' : ''}>${escapeHtml(recortar(p.nombre, 28))}</option>`).join('')}
            </select>
            <select class="select" data-filtro="categoria" style="width:170px">
              <option value="">Todas las categorias</option>
              ${categorias().map((c) => `<option value="${escapeHtml(c)}" ${filtros.categoria === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
            <input class="input" type="date" data-filtro="desde" value="${filtros.desde}" style="width:150px" title="Desde" />
            <input class="input" type="date" data-filtro="hasta" value="${filtros.hasta}" style="width:150px" title="Hasta" />
            <button class="btn btn--ghost btn--sm" type="button" data-accion="limpiar">${icon('refrescar', 15)} Limpiar</button>
          </div>
          <div data-resumen></div>
          <div data-tabla></div>
        </div>
      </div>`;

    const buscar = $('#gas-buscar', raiz);
    buscar.addEventListener('input', VP.dom.debounce(async () => {
      filtros.q = buscar.value.trim();
      await recargar(raiz);
    }, 320));

    $$('[data-filtro]', raiz).forEach((campo) => {
      campo.addEventListener('change', async () => {
        filtros[campo.getAttribute('data-filtro')] = campo.value;
        await recargar(raiz);
      });
    });

    $('[data-accion="limpiar"]', raiz).addEventListener('click', () => {
      Object.assign(filtros, { q: '', grupo: 'todas', estado: '', proveedor_id: '', categoria: '', desde: '', hasta: '' });
      montar(raiz, acciones);
    });

    $('[data-accion="nuevo"]', acciones).addEventListener('click', () => abrirEditor({ raiz }));
    $('[data-accion="exportar"]', acciones).addEventListener('click', exportar);

    await recargar(raiz);

    if (params.abrir) await detalle(Number(params.abrir), raiz);
    else if (params.nuevo) await abrirEditor({ raiz, proveedorInicial: params.proveedor ? Number(params.proveedor) : null });
  }

  /* ------------------------------------------------------------------ */
  /* Tabla                                                               */
  /* ------------------------------------------------------------------ */

  const COLUMNAS = [
    {
      clave: 'numero',
      titulo: 'Gasto',
      ordenable: true,
      render: (g) => `<div class="strong">${escapeHtml(g.numero)}</div><span class="sub">${escapeHtml(formatFecha(g.fecha))}</span>`,
    },
    {
      clave: 'proveedor',
      titulo: 'Proveedor',
      ordenable: true,
      render: (g) => `<div>${escapeHtml(recortar(g.proveedor_nombre, 34))}</div><span class="sub">NIT ${escapeHtml(g.proveedor_nit || '—')}</span>`,
    },
    {
      clave: 'categoria',
      titulo: 'Categoria',
      ordenable: true,
      render: (g) => (g.categoria ? `<span class="chip">${escapeHtml(g.categoria)}</span>` : '<span class="text-muted">—</span>'),
    },
    {
      clave: 'vencimiento',
      titulo: 'Vencimiento',
      ordenable: true,
      render: (g) => {
        const vencida = Number(g.dias_vencida) > 0 && g.estado !== 'Pagada' && g.estado !== 'Anulada';
        return `<div class="${vencida ? 'text-danger' : ''}">${escapeHtml(formatFecha(g.fecha_vencimiento))}</div>${vencida ? `<span class="sub text-danger">${g.dias_vencida} dias</span>` : ''}`;
      },
    },
    { clave: 'estado', titulo: 'Estado', ordenable: true, render: (g) => ui.estado(g.estado) },
    { clave: 'total', titulo: 'Total', num: true, ordenable: true, render: (g) => formatMoneda(g.total) },
    {
      clave: 'saldo',
      titulo: 'Saldo',
      num: true,
      ordenable: true,
      render: (g) => (Number(g.saldo) > 0 && g.estado !== 'Anulada'
        ? `<strong class="text-danger">${formatMoneda(g.saldo)}</strong>`
        : '<span class="text-success">Pagado</span>'),
    },
    {
      clave: 'acciones',
      titulo: '',
      clase: 'num',
      render: (g) => `
        <div class="table-actions">
          <button class="btn btn--ghost btn--icon" type="button" title="Ver" data-accion-fila="ver" data-id="${g.id}">${icon('ver', 15)}</button>
          ${g.estado !== 'Anulada' && Number(g.saldo) > 0 ? `<button class="btn btn--ghost btn--icon" type="button" title="Registrar pago" data-accion-fila="pago" data-id="${g.id}">${icon('dinero', 15)}</button>` : ''}
          ${g.estado !== 'Pagada' && g.estado !== 'Anulada' ? `<button class="btn btn--ghost btn--icon" type="button" title="Editar" data-accion-fila="editar" data-id="${g.id}">${icon('editar', 15)}</button>` : ''}
          <button class="btn btn--ghost btn--icon" type="button" title="PDF" data-accion-fila="pdf" data-id="${g.id}">${icon('documento', 15)}</button>
        </div>`,
    },
  ];

  function pintar(raiz) {
    const total = filas.reduce((a, g) => a + (g.estado === 'Anulada' ? 0 : Number(g.total)), 0);
    const saldo = filas.reduce((a, g) => a + (g.estado === 'Anulada' ? 0 : Number(g.saldo)), 0);
    const vencido = filas.reduce((a, g) => a + (Number(g.dias_vencida) > 0 && g.estado !== 'Pagada' && g.estado !== 'Anulada' ? Number(g.saldo) : 0), 0);

    $('[data-resumen]', raiz).innerHTML = `
      <div class="table-toolbar" style="border-bottom:0;padding-bottom:6px">
        <span class="chip">${icon('gastos', 14)} ${formatNumero(filas.length, { decimales: 0 })} gastos</span>
        <span class="chip">${icon('dinero', 14)} Total ${formatMoneda(total)}</span>
        <span class="chip">${icon('reloj', 14)} Por pagar ${formatMoneda(saldo)}</span>
        ${vencido ? `<span class="chip" style="background:var(--danger-soft);border-color:#fecaca;color:var(--danger)">${icon('alerta', 14)} Vencido ${formatMoneda(vencido)}</span>` : ''}
      </div>`;

    $('[data-tabla]', raiz).innerHTML = ui.tabla(COLUMNAS, filas, {
      vacioIcono: 'gastos',
      vacioTitulo: filtros.q ? 'Sin resultados' : 'Aun no hay gastos registrados',
      vacioTexto: filtros.q ? 'Prueba con otro numero o proveedor.' : 'Registra las facturas de compra para controlar los egresos.',
      orden: filtros.orden,
      filaAtributos: (g) => `data-fila-id="${g.id}"`,
    });

    $$('[data-ordenar]', raiz).forEach((th) => {
      th.addEventListener('click', async () => {
        const clave = th.getAttribute('data-ordenar');
        filtros.orden = { clave, dir: filtros.orden.clave === clave && filtros.orden.dir === 'asc' ? 'desc' : 'asc' };
        await recargar(raiz);
      });
    });

    $$('[data-accion-fila]', raiz).forEach((boton) => {
      boton.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        const id = Number(boton.getAttribute('data-id'));
        const accion = boton.getAttribute('data-accion-fila');
        if (accion === 'editar') return abrirEditor({ raiz, id });
        if (accion === 'pago') return registrarPago(id, raiz);
        if (accion === 'pdf') return VP.documento.menuDocumento('gasto', id);
        return detalle(id, raiz);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Editor                                                              */
  /* ------------------------------------------------------------------ */

  async function abrirEditor({ raiz, id, proveedorInicial = null } = {}) {
    const catalogo = { productos: await VP.api.productos({ activo: true }) };
    const gasto = id ? await VP.api.gasto(id) : null;

    const borrador = {
      items: gasto
        ? gasto.items.map((i) => ({
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

    const diasDefault = Number(VP.state.config.gas_dias_credito) || 30;
    const valores = {
      proveedor_id: gasto ? gasto.proveedor_id : proveedorInicial || '',
      fecha: gasto ? gasto.fecha : hoyISO(),
      fecha_vencimiento: gasto ? gasto.fecha_vencimiento : sumarDias(hoyISO(), diasDefault),
      dias_credito: diasDefault,
      categoria: gasto ? gasto.categoria || '' : '',
      forma_pago: gasto ? gasto.forma_pago || '' : metodos()[0] || 'Transferencia',
      descuento_pct: gasto ? Number(gasto.descuento_pct) : 0,
      retencion_pct: gasto ? Number(gasto.retencion_pct) : 0,
      observaciones: gasto ? gasto.observaciones || '' : '',
    };

    const listaCategorias = categorias();
    const contenido = `
      <div class="stack" style="gap:18px">
        <div class="form-grid">
          <div class="field span-2">
            <label>Proveedor <span class="req">*</span></label>
            <select class="select" name="proveedor_id">
              <option value="">Selecciona un proveedor...</option>
              ${proveedores.map((p) => `<option value="${p.id}" ${Number(valores.proveedor_id) === p.id ? 'selected' : ''}>${escapeHtml(p.codigo)} · ${escapeHtml(p.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Categoria</label>
            <select class="select" name="categoria">
              <option value="">Sin categoria</option>
              ${listaCategorias.map((c) => `<option value="${escapeHtml(c)}" ${valores.categoria === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Forma de pago</label>
            <select class="select" name="forma_pago">
              ${metodos().map((m) => `<option value="${escapeHtml(m)}" ${valores.forma_pago === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Fecha de emision</label>
            <input class="input" type="date" name="fecha" value="${valores.fecha}" />
          </div>
          <div class="field">
            <label>Dias de credito</label>
            <input class="input" type="number" name="dias_credito" min="0" step="1" value="${valores.dias_credito}" />
          </div>
          <div class="field">
            <label>Fecha de vencimiento</label>
            <input class="input" type="date" name="fecha_vencimiento" value="${valores.fecha_vencimiento}" />
          </div>
        </div>

        <div class="section-title" style="margin-top:2px">Lineas del gasto</div>
        <div class="row" style="gap:8px;align-items:flex-end">
          <div class="field" style="flex:1;max-width:420px">
            <label>Agregar desde el catalogo</label>
            <select class="select" data-selector-producto>
              <option value="">Selecciona un producto...</option>
              ${catalogo.productos.map((p) => `<option value="${p.id}">${escapeHtml(p.codigo)} · ${escapeHtml(p.nombre)} — ${escapeHtml(formatMoneda(p.precio))}</option>`).join('')}
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
                <th style="width:74px" class="num">IVA</th>
                <th style="width:118px" class="num">Total</th>
              </tr>
            </thead>
            <tbody data-items></tbody>
          </table>
        </div>

        <div class="grid" style="grid-template-columns:1fr 300px;gap:18px;align-items:start">
          <div class="field">
            <label>Observaciones</label>
            <textarea class="textarea" name="observaciones" rows="3" placeholder="Notas o descripcion del gasto...">${escapeHtml(valores.observaciones)}</textarea>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="field">
              <label>Descuento global (%)</label>
              <input class="input" type="number" name="descuento_pct" min="0" max="100" step="0.5" value="${valores.descuento_pct}" />
            </div>
            <div class="field">
              <label>Retencion en la fuente (%)</label>
              <input class="input" type="number" name="retencion_pct" min="0" max="100" step="0.5" value="${valores.retencion_pct}" />
            </div>
          </div>
        </div>

        <div class="totales-panel">
          <div class="totales-box" data-totales></div>
        </div>
      </div>`;

    const controlador = ui.modal({
      titulo: gasto ? `Editar gasto ${gasto.numero}` : 'Registrar factura de gasto',
      subtitulo: gasto ? 'Los cambios se reflejan en el control de egresos.' : 'Se genera un consecutivo nuevo al guardar.',
      tamano: 'xl',
      bloqueo: true,
      contenido,
      acciones: [
        { texto: 'Cancelar' },
        { texto: 'Guardar', tipo: 'primary', icono: 'ok', cerrar: false, accion: (c) => guardar(c, false) },
        { texto: 'Guardar y ver', icono: 'imprimir', cerrar: false, accion: (c) => guardar(c, true) },
      ],
    });

    const raizModal = controlador.raiz;
    const tbody = $('[data-items]', raizModal);

    function filaHtml(item, indice) {
      return `
        <tr data-fila="${indice}">
          <td class="center">
            <button class="btn btn--ghost btn--icon" type="button" data-quitar="${indice}" title="Quitar linea">${icon('borrar', 15)}</button>
          </td>
          <td>
            <input class="input desc-input" type="text" data-campo="descripcion" value="${escapeHtml(item.descripcion)}" placeholder="Descripcion del bien o servicio" />
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
      if (!borrador.items.length) {
        tbody.innerHTML = '<tr><td colspan="8" class="center text-muted" style="padding:22px">Sin lineas. Agrega productos del catalogo o crea una linea libre.</td></tr>';
      } else {
        tbody.innerHTML = borrador.items.map((item, i) => filaHtml(item, i)).join('');
      }
      actualizarTotales();
    }

    function actualizarTotales() {
      const form = ui.leerFormulario(raizModal);
      const resultado = VP.documento.calcular(borrador.items, Number(form.descuento_pct) || 0, Number(form.retencion_pct) || 0);

      resultado.lineas.forEach((linea, i) => {
        const celda = $(`[data-total-linea="${i}"]`, raizModal);
        if (celda) celda.textContent = formatMoneda(linea.total);
      });

      const filas = [`<div class="fila"><span>Subtotal</span><strong>${formatMoneda(resultado.subtotal)}</strong></div>`];
      if (resultado.descuento_valor) {
        filas.push(`<div class="fila fila--desc"><span>Descuento (${formatNumero(resultado.descuento_pct)}%)</span><strong>-${formatMoneda(resultado.descuento_valor)}</strong></div>`);
      }
      filas.push(`<div class="fila"><span>IVA</span><strong>${formatMoneda(resultado.iva_valor)}</strong></div>`);
      if (resultado.retencion_valor) {
        filas.push(`<div class="fila fila--desc"><span>Retencion (${formatNumero(resultado.retencion_pct)}%)</span><strong>-${formatMoneda(resultado.retencion_valor)}</strong></div>`);
      }
      filas.push(`<div class="fila fila--total"><span>Total del gasto</span><strong>${formatMoneda(resultado.total)}</strong></div>`);
      $('[data-totales]', raizModal).innerHTML = filas.join('');
    }

    function actualizarVencimiento() {
      const fecha = $('[name="fecha"]', raizModal).value;
      const dias = Number($('[name="dias_credito"]', raizModal).value) || 0;
      if (fecha) $('[name="fecha_vencimiento"]', raizModal).value = sumarDias(fecha, dias);
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
        iva_pct: Number(producto.iva_pct) || 19,
      };
    }

    $('[data-selector-producto]', raizModal).addEventListener('change', (evento) => {
      const pid = Number(evento.target.value);
      if (!pid) return;
      const producto = catalogo.productos.find((p) => p.id === pid);
      evento.target.value = '';
      if (!producto) return;
      const existente = borrador.items.find((i) => i.producto_id === pid);
      if (existente) existente.cantidad = Number(existente.cantidad) + 1;
      else borrador.items.push(itemDesdeProducto(producto));
      pintarLineas();
    });

    $('[data-accion="linea-libre"]', raizModal).addEventListener('click', () => {
      borrador.items.push({ producto_id: null, codigo: '', descripcion: '', unidad: 'UND', cantidad: 1, precio_unitario: 0, descuento_pct: 0, iva_pct: 19 });
      pintarLineas();
      const campo = $(`[data-fila="${borrador.items.length - 1}"] [data-campo="descripcion"]`, raizModal);
      if (campo) campo.focus();
    });

    tbody.addEventListener('click', (evento) => {
      const quitar = evento.target.closest('[data-quitar]');
      if (!quitar) return;
      borrador.items.splice(Number(quitar.getAttribute('data-quitar')), 1);
      pintarLineas();
    });

    tbody.addEventListener('input', (evento) => {
      const campo = evento.target.closest('[data-campo]');
      if (!campo || campo.tagName === 'SELECT') return;
      const fila = campo.closest('[data-fila]');
      const item = borrador.items[Number(fila.getAttribute('data-fila'))];
      if (!item) return;
      const clave = campo.getAttribute('data-campo');
      item[clave] = campo.type === 'number' ? Number(campo.value) || 0 : campo.value;
      actualizarTotales();
    });

    tbody.addEventListener('change', (evento) => {
      const campo = evento.target.closest('[data-campo]');
      if (!campo || campo.tagName !== 'SELECT') return;
      const fila = campo.closest('[data-fila]');
      const item = borrador.items[Number(fila.getAttribute('data-fila'))];
      if (!item) return;
      const clave = campo.getAttribute('data-campo');
      item[clave] = clave === 'iva_pct' ? Number(campo.value) : campo.value;
      actualizarTotales();
    });

    $('[name="fecha"]', raizModal).addEventListener('change', actualizarVencimiento);
    $('[name="dias_credito"]', raizModal).addEventListener('input', actualizarVencimiento);
    $$('[name="descuento_pct"], [name="retencion_pct"]', raizModal).forEach((campo) => campo.addEventListener('input', actualizarTotales));

    async function guardar(controladorModal, verPdf) {
      const datos = ui.leerFormulario(raizModal);
      ui.limpiarInvalidos(raizModal);
      if (!datos.proveedor_id) return ui.marcarInvalido(raizModal, 'proveedor_id', 'Selecciona un proveedor.');
      if (!borrador.items.length) return ui.aviso.aviso('Agrega al menos una linea al gasto.');

      const payload = {
        id: gasto ? gasto.id : undefined,
        proveedor_id: Number(datos.proveedor_id),
        fecha: datos.fecha,
        fecha_vencimiento: datos.fecha_vencimiento,
        categoria: datos.categoria || '',
        forma_pago: datos.forma_pago || 'Transferencia',
        descuento_pct: Number(datos.descuento_pct) || 0,
        retencion_pct: Number(datos.retencion_pct) || 0,
        observaciones: datos.observaciones || '',
        items: borrador.items,
      };

      const botones = $$('.modal__foot .btn', raizModal);
      botones.forEach((b) => { b.disabled = true; });

      try {
        const guardado = await VP.api.guardarGasto(payload);
        ui.aviso.exito(`Gasto ${guardado.numero} guardado.`, 'Documento guardado');
        VP.app.actualizarInsignias();
        controladorModal.cerrar(guardado);
        await recargar(raizActual);
        if (verPdf) await VP.api.documento('gasto', guardado.id, 'previsualizar');
      } catch (error) {
        ui.aviso.error(error.message);
        botones.forEach((b) => { b.disabled = false; });
      }
    }

    pintarLineas();
    return controlador;
  }

  /* ------------------------------------------------------------------ */
  /* Detalle                                                             */
  /* ------------------------------------------------------------------ */

  async function detalle(id, raiz) {
    const g = await VP.api.gasto(id);
    if (!g) return;

    const items = g.items
      .map(
        (i) => `
        <tr>
          <td>${escapeHtml(i.descripcion)}${i.codigo ? `<span class="sub">${escapeHtml(i.codigo)}</span>` : ''}</td>
          <td class="num">${formatNumero(i.cantidad, { decimales: 2 })}</td>
          <td class="num">${formatMoneda(i.precio_unitario)}</td>
          <td class="num">${formatNumero(i.descuento_pct)}%</td>
          <td class="num">${formatMoneda(i.total)}</td>
        </tr>`,
      )
      .join('');

    const pagos = g.pagos.length
      ? g.pagos
          .map(
            (p) => `
          <div class="timeline__item">
            <span class="timeline__dot"></span>
            <div style="flex:1">
              <div class="timeline__text">${formatMoneda(p.monto)} · ${escapeHtml(p.metodo)}${p.referencia ? ` · ${escapeHtml(p.referencia)}` : ''}</div>
              <div class="timeline__meta">${escapeHtml(formatFecha(p.fecha, 'largo'))}${p.notas ? ` · ${escapeHtml(p.notas)}` : ''}</div>
            </div>
            <button class="btn btn--ghost btn--icon" type="button" data-borrar-pago="${p.id}" title="Eliminar pago">${icon('borrar', 14)}</button>
          </div>`,
          )
          .join('')
      : '<p class="text-muted" style="font-size:13px">Sin pagos registrados.</p>';

    const modal = ui.modal({
      titulo: `Gasto ${g.numero}`,
      subtitulo: `${formatFecha(g.fecha, 'largo')} · vence ${formatFecha(g.fecha_vencimiento)} · ${g.estado}`,
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="grid grid--2">
            <div class="card"><div class="card__body">
              <div class="section-title" style="margin-top:0">Proveedor</div>
              <div class="info-list">
                <div class="info-list__row"><span>Razon social</span><span>${escapeHtml(g.proveedor_nombre)}</span></div>
                <div class="info-list__row"><span>Identificacion</span><span>${escapeHtml(g.proveedor_nit || '—')}</span></div>
                <div class="info-list__row"><span>Categoria</span><span>${escapeHtml(g.categoria || '—')}</span></div>
                <div class="info-list__row"><span>Forma de pago</span><span>${escapeHtml(g.forma_pago || '—')}</span></div>
              </div>
            </div></div>
            <div class="card"><div class="card__body">
              <div class="section-title" style="margin-top:0">Cuenta por pagar</div>
              <div class="grid grid--3" style="gap:10px">
                <div class="stat-mini"><span>Total</span><strong>${formatMoneda(g.total)}</strong></div>
                <div class="stat-mini"><span>Pagado</span><strong class="text-success">${formatMoneda(g.pagado)}</strong></div>
                <div class="stat-mini"><span>Saldo</span><strong class="${Number(g.saldo) > 0 ? 'text-danger' : 'text-success'}">${formatMoneda(g.saldo)}</strong></div>
              </div>
              <div class="info-list" style="margin-top:12px">
                <div class="info-list__row"><span>Subtotal</span><span>${formatMoneda(g.subtotal)}</span></div>
                ${Number(g.descuento_valor) ? `<div class="info-list__row"><span>Descuento</span><span class="text-danger">-${formatMoneda(g.descuento_valor)}</span></div>` : ''}
                <div class="info-list__row"><span>IVA</span><span>${formatMoneda(g.iva_valor)}</span></div>
                ${Number(g.retencion_valor) ? `<div class="info-list__row"><span>Retencion</span><span class="text-danger">-${formatMoneda(g.retencion_valor)}</span></div>` : ''}
              </div>
            </div></div>
          </div>

          <div class="card"><div class="table-wrap">
            <table class="data">
              <thead><tr><th>Descripcion</th><th class="num">Cant.</th><th class="num">Vr. unit</th><th class="num">Desc.</th><th class="num">Total</th></tr></thead>
              <tbody>${items}</tbody>
            </table>
          </div></div>

          <div class="card">
            <div class="card__head">
              <h3>Pagos al proveedor</h3>
              <div class="card__tools">
                ${g.estado !== 'Anulada' && Number(g.saldo) > 0 ? `<button class="btn btn--sm btn--primary" type="button" data-nuevo-pago>${icon('mas', 15)} Registrar pago</button>` : ''}
              </div>
            </div>
            <div class="card__body"><div class="timeline" data-pagos>${pagos}</div></div>
          </div>

          ${g.anulada_motivo ? `<div class="alert-row alert-row--danger">${icon('alerta', 17, { clase: 'ico' })}<div>Gasto anulado: ${escapeHtml(g.anulada_motivo)}</div></div>` : ''}
        </div>`,
      acciones: [
        g.estado !== 'Anulada'
          ? { texto: 'Anular', tipo: 'ghost', clase: 'left text-danger', icono: 'alerta', cerrar: false, accion: () => anularGasto(g, modal, raiz) }
          : null,
        { texto: 'Eliminar', tipo: 'ghost', clase: 'left text-danger', icono: 'borrar', cerrar: false, accion: () => eliminarGasto(g, modal, raiz) },
        { texto: 'PDF', icono: 'documento', cerrar: false, accion: () => VP.documento.menuDocumento('gasto', g.id) },
        g.estado !== 'Pagada' && g.estado !== 'Anulada'
          ? { texto: 'Editar', icono: 'editar', cerrar: false, accion: () => { modal.cerrar(); abrirEditor({ raiz, id: g.id }); } }
          : null,
        { texto: 'Cerrar' },
      ].filter(Boolean),
    });

    const refrescarModal = async () => {
      modal.cerrar();
      await recargar(raiz);
      await detalle(id, raiz);
    };

    $('[data-nuevo-pago]', modal.raiz)?.addEventListener('click', () => registrarPago(id, raiz, refrescarModal));
    $$('[data-borrar-pago]', modal.raiz).forEach((boton) => {
      boton.addEventListener('click', async () => {
        const confirmado = await ui.confirmar({ titulo: 'Eliminar pago', mensaje: 'Se eliminara este pago y se recalculara el estado del gasto.', textoOk: 'Eliminar' });
        if (!confirmado) return;
        try {
          await VP.api.eliminarPagoGasto(Number(boton.getAttribute('data-borrar-pago')));
          ui.aviso.exito('Pago eliminado.');
          VP.app.actualizarInsignias();
          await refrescarModal();
        } catch (error) {
          ui.aviso.error(error.message);
        }
      });
    });
  }

  async function registrarPago(id, raiz, alTerminar) {
    const g = await VP.api.gasto(id);
    if (!g) return;

    ui.modal({
      titulo: `Registrar pago · ${g.numero}`,
      subtitulo: `Saldo pendiente: ${formatMoneda(g.saldo)}`,
      tamano: 'sm',
      bloqueo: true,
      contenido: `
        <div class="form-grid">
          <div class="field">
            <label>Fecha</label>
            <input class="input" type="date" name="fecha" value="${hoyISO()}" />
          </div>
          <div class="field">
            <label>Monto <span class="req">*</span></label>
            <input class="input" type="number" name="monto" min="0" step="1000" value="${Number(g.saldo) || 0}" />
          </div>
          <div class="field">
            <label>Metodo</label>
            <select class="select" name="metodo">${metodos().map((m) => `<option ${g.forma_pago === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Referencia</label>
            <input class="input" name="referencia" placeholder="Nro. de comprobante" />
          </div>
          <div class="field span-2">
            <label>Notas</label>
            <input class="input" name="notas" />
          </div>
        </div>`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Registrar pago',
          tipo: 'primary',
          icono: 'ok',
          cerrar: false,
          accion: async (controlador) => {
            const datos = ui.leerFormulario(controlador.raiz);
            ui.limpiarInvalidos(controlador.raiz);
            if (!(Number(datos.monto) > 0)) return ui.marcarInvalido(controlador.raiz, 'monto', 'El monto debe ser mayor a cero.');
            try {
              await VP.api.guardarPagoGasto({ ...datos, gasto_id: id, monto: Number(datos.monto) });
              ui.aviso.exito('Pago registrado.');
              VP.app.actualizarInsignias();
              controlador.cerrar();
              if (alTerminar) await alTerminar();
              else await recargar(raizActual);
            } catch (error) {
              ui.aviso.error(error.message);
            }
          },
        },
      ],
    });
  }

  async function anularGasto(g, modal, raiz) {
    const motivo = await ui.pedirTexto({
      titulo: 'Anular gasto',
      etiqueta: 'Motivo de la anulacion',
      valor: 'Error de digitacion',
      textoOk: 'Anular gasto',
    });
    if (motivo === null) return;
    try {
      await VP.api.anularGasto(g.id, motivo || 'Sin motivo');
      ui.aviso.exito('Gasto anulado.');
      VP.app.actualizarInsignias();
      modal.cerrar();
      await recargar(raiz);
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  async function eliminarGasto(g, modal, raiz) {
    const confirmado = await ui.confirmar({
      titulo: 'Eliminar gasto',
      mensaje: `Se eliminara el gasto ${g.numero}.`,
      detalle: 'Solo es posible si no tiene pagos registrados.',
      textoOk: 'Eliminar',
    });
    if (!confirmado) return;
    try {
      await VP.api.eliminarGasto(g.id);
      ui.aviso.exito('Gasto eliminado.');
      VP.app.actualizarInsignias();
      modal.cerrar();
      await recargar(raiz);
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  async function exportar() {
    const cabeceras = [
      { titulo: 'Numero', valor: (g) => g.numero },
      { titulo: 'Fecha', valor: (g) => g.fecha },
      { titulo: 'Proveedor', valor: (g) => g.proveedor_nombre },
      { titulo: 'NIT', valor: (g) => g.proveedor_nit },
      { titulo: 'Categoria', valor: (g) => g.categoria },
      { titulo: 'Estado', valor: (g) => g.estado },
      { titulo: 'Total', valor: (g) => g.total },
      { titulo: 'Pagado', valor: (g) => g.pagado },
      { titulo: 'Saldo', valor: (g) => g.saldo },
    ];

    const r = await VP.api.exportarCsv({ nombre: 'gastos', cabeceras: cabeceras.map((c) => c.titulo), filas: ui.filasParaExportar(cabeceras, filas) });
    if (!r.cancelado) ui.aviso.exito('Exportacion generada.');
  }

  VP.views.gastos = {
    titulo: 'Gastos',
    subtitulo: 'Facturas de compra, categorias y cuentas por pagar',
    montar,
  };
})();
