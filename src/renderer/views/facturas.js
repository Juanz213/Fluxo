/* ==========================================================================
   Fluxo · Bandeja de facturas y cartera
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, formatFecha, formatPorcentaje, recortar, hoyISO } = VP.utils;
  const { $, $$ } = VP.dom;
  const ui = VP.ui;
  const doc = VP.documento;

  const POR_PAGINA = 40;

  const filtros = {
    q: '',
    grupo: 'todas',
    estado: '',
    asesor_id: '',
    desde: '',
    hasta: '',
    orden: { clave: 'fecha', dir: 'desc' },
    pagina: 1,
  };

  let filas = [];
  let asesores = [];
  let raizActual = null;

  function parametros() {
    return {
      q: filtros.q,
      estado: filtros.estado,
      estadoGrupo: filtros.grupo === 'todas' ? '' : filtros.grupo,
      asesor_id: filtros.asesor_id,
      desde: filtros.desde,
      hasta: filtros.hasta,
      conSaldo: filtros.grupo === 'cartera',
      vencidas: filtros.grupo === 'vencidas',
      sort: filtros.orden.clave,
      dir: filtros.orden.dir,
    };
  }

  async function recargar(raiz) {
    filas = await VP.api.facturas(parametros());
    pintar(raiz);
  }

  async function montar(raiz, acciones, params = {}) {
    raizActual = raiz;
    asesores = await VP.api.asesores({});

    if (params.estadoGrupo === 'vencidas') {
      filtros.grupo = 'vencidas';
    }

    acciones.innerHTML = `
      <button class="btn" type="button" data-accion="recargar">${icon('refrescar', 16)} Actualizar</button>
      <button class="btn" type="button" data-accion="exportar">${icon('descargar', 16)} Exportar</button>
      <button class="btn btn--primary" type="button" data-accion="nueva">${icon('mas', 16)} Nueva factura</button>`;

    raiz.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="table-toolbar">
            <div class="search">
              ${icon('buscar')}
              <label class="hidden" for="fac-buscar">Buscar</label>
              <input class="input" id="fac-buscar" type="search" placeholder="Buscar por numero o cliente..." value="${escapeHtml(filtros.q)}" />
            </div>
            <div class="seg" data-grupo>
              ${[['todas', 'Todas'], ['cartera', 'En cartera'], ['vencidas', 'Vencidas'], ['cobradas', 'Cobradas']]
                .map(([valor, texto]) => `<button type="button" data-grupo-valor="${valor}" class="${filtros.grupo === valor ? 'is-active' : ''}">${texto}</button>`)
                .join('')}
            </div>
            <select class="select" data-filtro="asesor_id" style="width:170px">
              <option value="">Todos los asesores</option>
              ${asesores.map((a) => `<option value="${a.id}" ${String(filtros.asesor_id) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`).join('')}
            </select>
            <input class="input" type="date" data-filtro="desde" value="${filtros.desde}" style="width:150px" title="Desde" />
            <input class="input" type="date" data-filtro="hasta" value="${filtros.hasta}" style="width:150px" title="Hasta" />
            <button class="btn btn--ghost btn--sm" type="button" data-accion="limpiar">${icon('refrescar', 15)} Limpiar</button>
          </div>
          <div data-resumen></div>
          <div data-tabla></div>
          <div data-paginacion></div>
        </div>
      </div>`;

    const buscar = $('#fac-buscar', raiz);
    buscar.addEventListener('input', VP.dom.debounce(async () => {
      filtros.q = buscar.value.trim();
      filtros.pagina = 1;
      await recargar(raiz);
    }, 320));

    $$('[data-grupo-valor]', raiz).forEach((boton) => {
      boton.addEventListener('click', async () => {
        filtros.grupo = boton.getAttribute('data-grupo-valor');
        filtros.pagina = 1;
        $$('[data-grupo-valor]', raiz).forEach((b) => b.classList.toggle('is-active', b === boton));
        await recargar(raiz);
      });
    });

    $$('[data-filtro]', raiz).forEach((campo) => {
      campo.addEventListener('change', async () => {
        filtros[campo.getAttribute('data-filtro')] = campo.value;
        filtros.pagina = 1;
        await recargar(raiz);
      });
    });

    $('[data-accion="limpiar"]', raiz).addEventListener('click', async () => {
      Object.assign(filtros, { q: '', grupo: 'todas', estado: '', asesor_id: '', desde: '', hasta: '', pagina: 1 });
      await montar(raiz, acciones);
    });

    $('[data-accion="recargar"]', acciones).addEventListener('click', async () => {
      await recargar(raiz);
      ui.aviso.info('Estados de cartera actualizados.');
    });

    $('[data-accion="nueva"]', acciones).addEventListener('click', () => doc.abrir({ tipo: 'factura', alGuardar: () => recargar(raiz) }));
    $('[data-accion="exportar"]', acciones).addEventListener('click', exportar);

    await recargar(raiz);

    if (params.abrir) await detalle(Number(params.abrir), raiz);
  }

  /* ------------------------------------------------------------------ */
  /* Tabla                                                               */
  /* ------------------------------------------------------------------ */

  const COLUMNAS = [
    {
      clave: 'numero',
      titulo: 'Factura',
      ordenable: true,
      render: (f) => `
        <div class="strong">${escapeHtml(f.numero)}</div>
        <span class="sub">${escapeHtml(formatFecha(f.fecha))}${f.cotizacion_numero ? ` · desde ${escapeHtml(f.cotizacion_numero)}` : ''}</span>`,
    },
    {
      clave: 'cliente',
      titulo: 'Cliente',
      ordenable: true,
      render: (f) => `
        <div>${escapeHtml(recortar(f.cliente_nombre, 34))}</div>
        <span class="sub">${f.asesor_nombre ? escapeHtml(f.asesor_nombre) : 'Sin asesor'}</span>`,
    },
    {
      clave: 'vencimiento',
      titulo: 'Vencimiento',
      ordenable: true,
      render: (f) => `
        <div class="${f.dias_vencida > 0 ? 'text-danger' : ''}">${escapeHtml(formatFecha(f.fecha_vencimiento))}</div>
        <span class="sub">${f.dias_vencida > 0 ? `${f.dias_vencida} dias de mora` : f.estado === 'Pagada' ? 'Pagada' : 'En termino'}</span>`,
    },
    { clave: 'estado', titulo: 'Estado', ordenable: true, render: (f) => ui.estado(f.estado) },
    { clave: 'total', titulo: 'Total', num: true, ordenable: true, render: (f) => `<strong>${formatMoneda(f.total)}</strong>` },
    {
      clave: 'saldo',
      titulo: 'Saldo',
      num: true,
      ordenable: true,
      render: (f) => (Number(f.saldo) > 0
        ? `<strong class="${f.dias_vencida > 0 ? 'text-danger' : ''}">${formatMoneda(f.saldo)}</strong><span class="sub">pagado ${formatMoneda(f.pagado)}</span>`
        : `<span class="text-success">Saldada</span>`),
    },
    {
      clave: 'acciones',
      titulo: '',
      clase: 'num',
      render: (f) => `
        <div class="table-actions">
          <button class="btn btn--ghost btn--icon" type="button" title="Documento PDF" data-accion-fila="documento" data-id="${f.id}">${icon('documento', 15)}</button>
          ${Number(f.saldo) > 0 && f.estado !== 'Anulada'
            ? `<button class="btn btn--ghost btn--icon" type="button" title="Registrar pago" data-accion-fila="pago" data-id="${f.id}">${icon('recaudo', 15)}</button>`
            : `<button class="btn btn--ghost btn--icon" type="button" title="Editar" data-accion-fila="editar" data-id="${f.id}" ${['Pagada', 'Anulada'].includes(f.estado) ? 'disabled' : ''}>${icon('editar', 15)}</button>`}
          <button class="btn btn--ghost btn--icon" type="button" title="Detalle" data-accion-fila="detalle" data-id="${f.id}">${icon('ver', 15)}</button>
        </div>`,
    },
  ];

  function pintar(raiz) {
    const total = filas.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    filtros.pagina = Math.min(filtros.pagina, paginas);
    const inicio = (filtros.pagina - 1) * POR_PAGINA;
    const visibles = filas.slice(inicio, inicio + POR_PAGINA);

    const activas = filas.filter((f) => f.estado !== 'Anulada');
    const valorTotal = activas.reduce((a, f) => a + Number(f.total), 0);
    const saldo = activas.reduce((a, f) => a + Number(f.saldo), 0);
    const vencido = activas.filter((f) => f.dias_vencida > 0).reduce((a, f) => a + Number(f.saldo), 0);
    const cobrado = activas.reduce((a, f) => a + Number(f.pagado), 0);

    $('[data-resumen]', raiz).innerHTML = `
      <div class="table-toolbar" style="border-bottom:0;padding-bottom:6px">
        <span class="chip">${icon('factura', 14)} ${formatNumero(total, { decimales: 0 })} facturas</span>
        <span class="chip">${icon('dinero', 14)} ${formatMoneda(valorTotal)}</span>
        <span class="chip">${icon('ok', 14)} Recaudado ${formatMoneda(cobrado)}</span>
        <span class="chip">${icon('caja', 14)} Saldo ${formatMoneda(saldo)}</span>
        ${vencido > 0 ? `<span class="chip" style="background:var(--danger-soft);border-color:#fecaca;color:var(--danger)">${icon('alerta', 14)} Vencido ${formatMoneda(vencido)}</span>` : ''}
      </div>`;

    $('[data-tabla]', raiz).innerHTML = ui.tabla(COLUMNAS, visibles, {
      vacioIcono: 'factura',
      vacioTitulo: filtros.q ? 'Sin resultados' : 'Aun no hay facturas',
      vacioTexto: filtros.q
        ? 'Prueba con otro numero de factura o el nombre del cliente.'
        : 'Puedes crear una factura directamente o convertir una cotizacion aprobada.',
      orden: filtros.orden,
      filaAtributos: (f) => `data-fila-id="${f.id}"`,
    });

    $('[data-paginacion]', raiz).innerHTML = total > POR_PAGINA ? ui.paginacion({ total, page: filtros.pagina, pageSize: POR_PAGINA }) : '';

    $$('[data-ordenar]', raiz).forEach((th) => {
      th.addEventListener('click', async () => {
        const clave = th.getAttribute('data-ordenar');
        filtros.orden = { clave, dir: filtros.orden.clave === clave && filtros.orden.dir === 'desc' ? 'asc' : 'desc' };
        await recargar(raiz);
      });
    });

    $$('[data-pagina]', raiz).forEach((boton) => {
      boton.addEventListener('click', () => {
        filtros.pagina = Number(boton.getAttribute('data-pagina'));
        pintar(raiz);
        raiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    $$('[data-accion-fila]', raiz).forEach((boton) => {
      boton.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        const id = Number(boton.getAttribute('data-id'));
        const accion = boton.getAttribute('data-accion-fila');
        if (accion === 'documento') return doc.menuDocumento('factura', id);
        if (accion === 'editar') return doc.abrir({ tipo: 'factura', id, alGuardar: () => recargar(raiz) });
        if (accion === 'pago') return registrarPago(id, raiz);
        return detalle(id, raiz);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Detalle                                                             */
  /* ------------------------------------------------------------------ */

  async function detalle(id, raiz) {
    const f = await VP.api.factura(id);
    if (!f) return;

    const items = f.items
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

    const pagos = f.pagos.length
      ? f.pagos
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
      titulo: `Factura ${f.numero}`,
      subtitulo: `${formatFecha(f.fecha, 'largo')} · vence ${formatFecha(f.fecha_vencimiento)} · ${f.estado}`,
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="grid grid--2">
            <div class="card"><div class="card__body">
              <div class="section-title" style="margin-top:0">Adquiriente</div>
              <div class="info-list">
                <div class="info-list__row"><span>Razon social</span><span>${escapeHtml(f.cliente_nombre)}</span></div>
                <div class="info-list__row"><span>Identificacion</span><span>${escapeHtml(f.cliente_nit || '—')}</span></div>
                <div class="info-list__row"><span>Asesor</span><span>${escapeHtml(f.asesor_nombre || 'Sin asignar')}</span></div>
                <div class="info-list__row"><span>Forma de pago</span><span>${escapeHtml(f.forma_pago || '—')}</span></div>
                ${f.cotizacion_numero ? `<div class="info-list__row"><span>Origen</span><span>${escapeHtml(f.cotizacion_numero)}</span></div>` : ''}
              </div>
            </div></div>
            <div class="card"><div class="card__body">
              <div class="section-title" style="margin-top:0">Cartera</div>
              <div class="grid grid--3" style="gap:10px">
                <div class="stat-mini"><span>Total</span><strong>${formatMoneda(f.total)}</strong></div>
                <div class="stat-mini"><span>Pagado</span><strong class="text-success">${formatMoneda(f.pagado)}</strong></div>
                <div class="stat-mini"><span>Saldo</span><strong class="${Number(f.saldo) > 0 ? 'text-danger' : 'text-success'}">${formatMoneda(f.saldo)}</strong></div>
              </div>
              <div class="info-list" style="margin-top:12px">
                <div class="info-list__row"><span>Subtotal</span><span>${formatMoneda(f.subtotal)}</span></div>
                ${Number(f.descuento_valor) ? `<div class="info-list__row"><span>Descuento</span><span class="text-danger">-${formatMoneda(f.descuento_valor)}</span></div>` : ''}
                <div class="info-list__row"><span>IVA</span><span>${formatMoneda(f.iva_valor)}</span></div>
                ${Number(f.retencion_valor) ? `<div class="info-list__row"><span>Retencion</span><span class="text-danger">-${formatMoneda(f.retencion_valor)}</span></div>` : ''}
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
              <h3>Pagos</h3>
              <div class="card__tools">
                ${f.estado !== 'Anulada' && Number(f.saldo) > 0 ? `<button class="btn btn--sm btn--primary" type="button" data-nuevo-pago>${icon('mas', 15)} Registrar pago</button>` : ''}
              </div>
            </div>
            <div class="card__body"><div class="timeline" data-pagos>${pagos}</div></div>
          </div>

          ${f.anulada_motivo ? `<div class="alert-row alert-row--danger">${icon('alerta', 17, { clase: 'ico' })}<div>Factura anulada: ${escapeHtml(f.anulada_motivo)}</div></div>` : ''}
        </div>`,
      acciones: [
        f.estado !== 'Anulada'
          ? { texto: 'Anular', tipo: 'ghost', clase: 'left text-danger', icono: 'alerta', cerrar: false, accion: () => anular(f, modal, raiz) }
          : null,
        { texto: 'Eliminar', tipo: 'ghost', clase: 'left text-danger', icono: 'borrar', cerrar: false, accion: () => eliminar(f, modal, raiz) },
        { texto: 'PDF', icono: 'documento', cerrar: false, accion: () => doc.menuDocumento('factura', f.id) },
        f.estado !== 'Pagada' && f.estado !== 'Anulada'
          ? { texto: 'Editar', icono: 'editar', cerrar: false, accion: () => { modal.cerrar(); doc.abrir({ tipo: 'factura', id: f.id, alGuardar: () => recargar(raiz) }); } }
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
        const confirmado = await ui.confirmar({ titulo: 'Eliminar pago', mensaje: 'Se eliminara este pago y se recalculara el estado de la factura.', textoOk: 'Eliminar' });
        if (!confirmado) return;
        try {
          await VP.api.eliminarPago(Number(boton.getAttribute('data-borrar-pago')));
          ui.aviso.exito('Pago eliminado.');
          VP.app.actualizarInsignias();
          await refrescarModal();
        } catch (error) {
          ui.aviso.error(error.message);
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Pagos                                                               */
  /* ------------------------------------------------------------------ */

  async function registrarPago(id, raiz, alTerminar) {
    const f = await VP.api.factura(id);
    if (!f) return;

    const modal = ui.modal({
      titulo: `Registrar pago · ${f.numero}`,
      subtitulo: `Saldo pendiente ${formatMoneda(f.saldo)}`,
      tamano: 'sm',
      contenido: `
        <div class="form-grid">
          <div class="field span-2">
            <label>Monto recibido <span class="req">*</span></label>
            <input class="input" type="number" name="monto" min="0" step="1" value="${Math.max(0, Math.round(Number(f.saldo) || 0))}" />
            <span class="hint">Saldo actual: ${formatMoneda(f.saldo)}</span>
          </div>
          <div class="field">
            <label>Fecha</label>
            <input class="input" type="date" name="fecha" value="${hoyISO()}" />
          </div>
          <div class="field">
            <label>Metodo</label>
            <select class="select" name="metodo">
              ${['Transferencia', 'Efectivo', 'Tarjeta', 'Cheque', 'Otro'].map((m) => `<option>${m}</option>`).join('')}
            </select>
          </div>
          <div class="field span-2">
            <label>Referencia</label>
            <input class="input" name="referencia" placeholder="Numero de transferencia, recibo, etc." />
          </div>
          <div class="field span-2">
            <label>Notas</label>
            <input class="input" name="notas" placeholder="Opcional" />
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
            if (!Number(datos.monto)) {
              ui.aviso.aviso('El monto debe ser mayor a cero.');
              return;
            }
            try {
              await VP.api.guardarPago({ factura_id: id, ...datos });
              ui.aviso.exito('Pago registrado y estado actualizado.', 'Listo');
              VP.app.actualizarInsignias();
              controlador.cerrar();
              if (alTerminar) await alTerminar();
              else await recargar(raiz);
            } catch (error) {
              ui.aviso.error(error.message);
            }
          },
        },
      ],
    });
    return modal;
  }

  async function anular(f, modal, raiz) {
    const motivo = await ui.pedirTexto({
      titulo: `Anular factura ${f.numero}`,
      etiqueta: 'Motivo de la anulacion',
      valor: '',
      textoOk: 'Anular factura',
      multilinea: true,
    });
    if (motivo === null) return;

    try {
      await VP.api.anularFactura(f.id, motivo);
      ui.aviso.exito(`Factura ${f.numero} anulada. El inventario fue reintegrado.`);
      VP.app.actualizarInsignias();
      modal.cerrar();
      await recargar(raiz);
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  async function eliminar(f, modal, raiz) {
    const confirmado = await ui.confirmar({
      titulo: 'Eliminar factura',
      mensaje: `Se eliminara definitivamente la factura ${f.numero}.`,
      detalle: 'Solo se permite si la factura no tiene pagos registrados.',
      textoOk: 'Eliminar',
    });
    if (!confirmado) return;
    try {
      await VP.api.eliminarFactura(f.id);
      ui.aviso.exito(`Factura ${f.numero} eliminada.`);
      VP.app.actualizarInsignias();
      modal.cerrar();
      await recargar(raiz);
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Exportacion                                                         */
  /* ------------------------------------------------------------------ */

  async function exportar() {
    const cabeceras = [
      { titulo: 'Numero', valor: (f) => f.numero },
      { titulo: 'Fecha', valor: (f) => f.fecha },
      { titulo: 'Vence', valor: (f) => f.fecha_vencimiento },
      { titulo: 'Cliente', valor: (f) => f.cliente_nombre },
      { titulo: 'NIT', valor: (f) => f.cliente_nit },
      { titulo: 'Asesor', valor: (f) => f.asesor_nombre },
      { titulo: 'Estado', valor: (f) => f.estado },
      { titulo: 'Dias vencida', valor: (f) => f.dias_vencida },
      { titulo: 'Total', valor: (f) => f.total },
      { titulo: 'Pagado', valor: (f) => f.pagado },
      { titulo: 'Saldo', valor: (f) => f.saldo },
    ];

    const opcion = await ui.modal({
      titulo: `Exportar ${filas.length} facturas`,
      subtitulo: filtros.grupo === 'cartera' || filtros.grupo === 'vencidas' ? 'Reporte de cartera' : '',
      tamano: 'sm',
      contenido: `
        <div class="stack" style="gap:9px">
          <button class="btn btn--block" type="button" data-salida="excel">${icon('descargar', 16)} Descargar Excel (CSV)</button>
          <button class="btn btn--block" type="button" data-salida="pdf">${icon('imprimir', 16)} Informe imprimible / PDF</button>
        </div>`,
      acciones: [{ texto: 'Cancelar' }],
    });

    opcion.raiz.querySelectorAll('[data-salida]').forEach((boton) => {
      boton.addEventListener('click', async () => {
        const salida = boton.getAttribute('data-salida');
        opcion.cerrar();
        if (salida === 'excel') {
          const r = await VP.api.exportarCsv({ nombre: 'facturas-cartera', cabeceras: cabeceras.map((c) => c.titulo), filas: ui.filasParaExportar(cabeceras, filas) });
          if (!r.cancelado) ui.aviso.exito('Exportacion generada.');
        } else {
          const r = await VP.api.informe({ titulo: 'Listado de facturas', subtitulo: `${filas.length} documentos`, cabeceras, filas, accion: 'guardar' });
          if (r && r.ruta) ui.aviso.exito('Informe generado.');
        }
      });
    });
  }

  VP.views.facturas = {
    titulo: 'Facturas y cartera',
    subtitulo: 'Emision, recaudo y control de saldos',
    montar,
  };
})();
