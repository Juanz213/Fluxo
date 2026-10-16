/* ==========================================================================
   Fluxo · Bandeja de cotizaciones
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, formatFecha, formatPorcentaje, recortar, hoyISO } = VP.utils;
  const { $, $$, el } = VP.dom;
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

  function parametros() {
    return {
      q: filtros.q,
      estado: filtros.estado,
      estadoGrupo: filtros.grupo === 'todas' ? '' : filtros.grupo,
      asesor_id: filtros.asesor_id,
      desde: filtros.desde,
      hasta: filtros.hasta,
      sort: filtros.orden.clave,
      dir: filtros.orden.dir,
    };
  }

  async function recargar(raiz) {
    filas = await VP.api.cotizaciones(parametros());
    pintar(raiz);
  }

  async function montar(raiz, acciones) {
    asesores = await VP.api.asesores({});

    acciones.innerHTML = `
      <button class="btn" type="button" data-accion="exportar">${icon('descargar', 16)} Exportar</button>
      <button class="btn btn--primary" type="button" data-accion="nueva">${icon('mas', 16)} Nueva cotizacion</button>`;

    raiz.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="table-toolbar">
            <div class="search">
              ${icon('buscar')}
              <label class="hidden" for="cot-buscar">Buscar</label>
              <input class="input" id="cot-buscar" type="search" placeholder="Buscar por numero o cliente..." value="${escapeHtml(filtros.q)}" />
            </div>
            <div class="seg" data-grupo>
              ${[['todas', 'Todas'], ['abiertas', 'Abiertas'], ['ganadas', 'Ganadas'], ['perdidas', 'Perdidas']]
                .map(([valor, texto]) => `<button type="button" data-grupo-valor="${valor}" class="${filtros.grupo === valor ? 'is-active' : ''}">${texto}</button>`)
                .join('')}
            </div>
            <select class="select" data-filtro="asesor_id" style="width:180px">
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

    /* Eventos de filtros */
    const buscar = $('#cot-buscar', raiz);
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

    $('[data-accion="nueva"]', acciones).addEventListener('click', async () => {
      await doc.abrir({ tipo: 'cotizacion', alGuardar: () => recargar(raiz) });
    });

    $('[data-accion="exportar"]', acciones).addEventListener('click', () => exportar());

    await recargar(raiz);
  }

  /* ------------------------------------------------------------------ */
  /* Tabla                                                               */
  /* ------------------------------------------------------------------ */

  const COLUMNAS = [
    {
      clave: 'numero',
      titulo: 'Cotizacion',
      ordenable: true,
      render: (f) => `
        <div class="strong">${escapeHtml(f.numero)}</div>
        <span class="sub">${escapeHtml(formatFecha(f.fecha))} · ${f.items_count} linea${f.items_count === 1 ? '' : 's'}</span>`,
    },
    {
      clave: 'cliente',
      titulo: 'Cliente',
      ordenable: true,
      render: (f) => `
        <div>${escapeHtml(recortar(f.cliente_nombre, 38))}</div>
        <span class="sub">${escapeHtml(f.cliente_nit || '')}${f.asesor_nombre ? ` · ${escapeHtml(f.asesor_nombre)}` : ''}</span>`,
    },
    {
      clave: 'vencimiento',
      titulo: 'Vigencia',
      ordenable: true,
      render: (f) => {
        const vencida = f.fecha_vencimiento && f.fecha_vencimiento < hoyISO() && !['Convertida', 'Rechazada'].includes(f.estado);
        return `<div class="${vencida ? 'text-danger' : ''}">${escapeHtml(formatFecha(f.fecha_vencimiento))}</div>
                <span class="sub">${vencida ? 'Vencida' : escapeHtml(VP.utils.hace(f.fecha))}</span>`;
      },
    },
    { clave: 'estado', titulo: 'Estado', ordenable: true, render: (f) => ui.estado(f.estado) },
    { clave: 'total', titulo: 'Total', num: true, ordenable: true, render: (f) => `<strong>${formatMoneda(f.total)}</strong>` },
    {
      clave: 'acciones',
      titulo: '',
      clase: 'num',
      render: (f) => `
        <div class="table-actions">
          <button class="btn btn--ghost btn--icon" type="button" title="Documento PDF" data-accion-fila="documento" data-id="${f.id}">${icon('documento', 15)}</button>
          <button class="btn btn--ghost btn--icon" type="button" title="Editar" data-accion-fila="editar" data-id="${f.id}">${icon('editar', 15)}</button>
          <button class="btn btn--ghost btn--icon" type="button" title="Mas acciones" data-accion-fila="detalle" data-id="${f.id}">${icon('ver', 15)}</button>
        </div>`,
    },
  ];

  function pintar(raiz) {
    const total = filas.length;
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    filtros.pagina = Math.min(filtros.pagina, paginas);
    const inicio = (filtros.pagina - 1) * POR_PAGINA;
    const visibles = filas.slice(inicio, inicio + POR_PAGINA);

    const abiertas = filas.filter((f) => ['Borrador', 'Enviada', 'Aprobada'].includes(f.estado));
    const ganadas = filas.filter((f) => ['Aprobada', 'Convertida'].includes(f.estado));
    const valorAbiertas = abiertas.reduce((a, f) => a + Number(f.total), 0);
    const valorTotal = filas.reduce((a, f) => a + Number(f.total), 0);
    const conversion = total ? (ganadas.length / total) * 100 : 0;

    $('[data-resumen]', raiz).innerHTML = `
      <div class="table-toolbar" style="border-bottom:0;padding-bottom:6px">
        <span class="chip">${icon('cotizacion', 14)} ${formatNumero(total, { decimales: 0 })} cotizaciones</span>
        <span class="chip">${icon('dinero', 14)} ${formatMoneda(valorTotal)}</span>
        <span class="chip">${icon('reloj', 14)} ${formatNumero(abiertas.length, { decimales: 0 })} abiertas · ${formatMoneda(valorAbiertas)}</span>
        <span class="chip">${icon('tendencia', 14)} ${formatPorcentaje(conversion)} de conversion</span>
      </div>`;

    $('[data-tabla]', raiz).innerHTML = ui.tabla(COLUMNAS, visibles, {
      vacioIcono: 'cotizacion',
      vacioTitulo: filtros.q ? 'Sin resultados' : 'Aun no hay cotizaciones',
      vacioTexto: filtros.q
        ? 'Prueba con otro numero de cotizacion o el nombre del cliente.'
        : 'Crea tu primera cotizacion con el boton "Nueva cotizacion".',
      orden: filtros.orden,
      filaAtributos: (f) => `data-fila-id="${f.id}"`,
    });

    $('[data-paginacion]', raiz).innerHTML =
      total > POR_PAGINA
        ? ui.paginacion({ total, page: filtros.pagina, pageSize: POR_PAGINA })
        : '';

    /* Orden */
    $$('[data-ordenar]', raiz).forEach((th) => {
      th.addEventListener('click', async () => {
        const clave = th.getAttribute('data-ordenar');
        filtros.orden = {
          clave,
          dir: filtros.orden.clave === clave && filtros.orden.dir === 'desc' ? 'asc' : 'desc',
        };
        await recargar(raiz);
      });
    });

    /* Paginacion */
    $$('[data-pagina]', raiz).forEach((boton) => {
      boton.addEventListener('click', () => {
        filtros.pagina = Number(boton.getAttribute('data-pagina'));
        pintar(raiz);
        raiz.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    /* Acciones de fila */
    $$('[data-accion-fila]', raiz).forEach((boton) => {
      boton.addEventListener('click', async (evento) => {
        evento.stopPropagation();
        const id = Number(boton.getAttribute('data-id'));
        const accion = boton.getAttribute('data-accion-fila');
        if (accion === 'documento') return doc.menuDocumento('cotizacion', id);
        if (accion === 'editar') return editar(id, raiz);
        return detalle(id, raiz);
      });
    });

    $$('[data-fila-id]', raiz).forEach((fila) => {
      fila.addEventListener('dblclick', () => detalle(Number(fila.getAttribute('data-fila-id')), raiz));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Acciones                                                            */
  /* ------------------------------------------------------------------ */

  async function editar(id, raiz) {
    const cotizacion = await VP.api.cotizacion(id);
    if (cotizacion.estado === 'Convertida') {
      ui.aviso.aviso('Esta cotizacion ya se convirtio en factura: crea una copia si necesitas modificarla.');
    }
    await doc.abrir({ tipo: 'cotizacion', id, alGuardar: () => recargar(raiz) });
  }

  async function detalle(id, raiz) {
    const f = await VP.api.cotizacion(id);
    if (!f) return;

    const items = f.items
      .map(
        (i) => `
        <tr>
          <td>${escapeHtml(i.descripcion)}${i.codigo ? `<span class="sub">${escapeHtml(i.codigo)}</span>` : ''}</td>
          <td class="center">${escapeHtml(i.unidad || '')}</td>
          <td class="num">${formatNumero(i.cantidad, { decimales: 2 })}</td>
          <td class="num">${formatMoneda(i.precio_unitario)}</td>
          <td class="num">${formatNumero(i.descuento_pct)}%</td>
          <td class="num">${formatNumberIva(i.iva_pct)}</td>
          <td class="num strong">${formatMoneda(i.total)}</td>
        </tr>`,
      )
      .join('');

    const accionesEstado = ['Borrador', 'Enviada', 'Aprobada', 'Rechazada']
      .map((e) => `<option value="${e}" ${f.estado === e ? 'selected' : ''}>${e}</option>`)
      .join('');

    const modal = ui.modal({
      titulo: `Cotizacion ${f.numero}`,
      subtitulo: `${formatFecha(f.fecha, 'largo')} · vence ${formatFecha(f.fecha_vencimiento)}`,
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="grid grid--2">
            <div class="card"><div class="card__body">
              <div class="section-title" style="margin-top:0">Cliente</div>
              <div class="info-list">
                <div class="info-list__row"><span>Razon social</span><span>${escapeHtml(f.cliente_nombre)}</span></div>
                <div class="info-list__row"><span>Identificacion</span><span>${escapeHtml(f.cliente_nit || '—')}</span></div>
                <div class="info-list__row"><span>Asesor</span><span>${escapeHtml(f.asesor_nombre || 'Sin asignar')}</span></div>
                <div class="info-list__row"><span>Condicion</span><span>${escapeHtml(f.condicion_pago || '—')}</span></div>
              </div>
            </div></div>
            <div class="card"><div class="card__body">
              <div class="section-title" style="margin-top:0">Totales</div>
              <div class="info-list">
                <div class="info-list__row"><span>Subtotal</span><span>${formatMoneda(f.subtotal)}</span></div>
                ${Number(f.descuento_valor) ? `<div class="info-list__row"><span>Descuento</span><span class="text-danger">-${formatMoneda(f.descuento_valor)}</span></div>` : ''}
                <div class="info-list__row"><span>IVA</span><span>${formatMoneda(f.iva_valor)}</span></div>
                <div class="info-list__row"><span>Total</span><span style="font-size:15px">${formatMoneda(f.total)}</span></div>
              </div>
            </div></div>
          </div>

          <div class="card"><div class="table-wrap">
            <table class="data">
              <thead><tr><th>Descripcion</th><th class="center">Und</th><th class="num">Cant.</th><th class="num">Vr. unit</th><th class="num">Desc.</th><th class="num">IVA</th><th class="num">Total</th></tr></thead>
              <tbody>${items}</tbody>
            </table>
          </div></div>

          ${f.observaciones ? `<div class="card"><div class="card__body"><div class="section-title" style="margin-top:0">Observaciones</div><p style="font-size:13px;line-height:1.65;color:var(--text-2)">${escapeHtml(f.observaciones)}</p></div></div>` : ''}
          ${f.motivo_perdida ? `<div class="alert-row alert-row--danger">${icon('alerta', 17, { clase: 'ico' })}<div>Motivo de perdida: ${escapeHtml(f.motivo_perdida)}</div></div>` : ''}
        </div>`,
      acciones: [
        { texto: 'Eliminar', tipo: 'ghost', clase: 'left text-danger', icono: 'borrar', cerrar: false, accion: () => eliminar(f, modal, raiz) },
        { texto: 'PDF', icono: 'documento', cerrar: false, accion: () => doc.menuDocumento('cotizacion', f.id) },
        { texto: 'Duplicar', icono: 'duplicar', cerrar: false, accion: async () => { modal.cerrar(); const copia = await VP.api.duplicarCotizacion(f.id); ui.aviso.exito(`Creada la cotizacion ${copia.numero}.`, 'Copia generada'); await recargar(raiz); } },
        { texto: 'Editar', icono: 'editar', cerrar: false, accion: () => { modal.cerrar(); editar(f.id, raiz); } },
        f.factura_id
          ? { texto: 'Ver factura', tipo: 'primary', icono: 'factura', accion: () => VP.app.ir('facturas', { abrir: f.factura_id }) }
          : { texto: 'Facturar', tipo: 'primary', icono: 'factura', accion: () => { modal.cerrar(); convertir(f, raiz); } },
      ],
    });

    /* Selector de estado dentro del modal */
    const cabecera = $('.modal__head > div', modal.raiz);
    const control = el(`
      <div class="row" style="margin-top:10px;gap:8px">
        <select class="select" style="width:150px;height:32px" data-estado>${accionesEstado}</select>
        <button class="btn btn--sm" type="button" data-aplicar-estado>${icon('check', 14)} Actualizar estado</button>
      </div>`);
    cabecera.appendChild(control);

    $('[data-aplicar-estado]', control).addEventListener('click', async () => {
      const nuevo = $('[data-estado]', control).value;
      if (nuevo === f.estado) return;
      let motivo = '';
      if (nuevo === 'Rechazada') {
        motivo = (await ui.pedirTexto({ titulo: 'Motivo de perdida', etiqueta: '¿Por que no se cerro la venta?', valor: f.motivo_perdida || '', textoOk: 'Guardar' })) || '';
      }
      try {
        await VP.api.estadoCotizacion(f.id, nuevo, motivo);
        ui.aviso.exito(`Estado actualizado a ${nuevo}.`);
        modal.cerrar();
        await recargar(raiz);
      } catch (error) {
        ui.aviso.error(error.message);
      }
    });
  }

  function formatNumberIva(valor) {
    return Number(valor) ? `${formatNumero(valor)}%` : 'Excl.';
  }

  async function convertir(f, raiz) {
    const modal = ui.modal({
      titulo: `Facturar cotizacion ${f.numero}`,
      subtitulo: 'Se creara una factura con las mismas lineas y el inventario se descontara automaticamente.',
      tamano: 'sm',
      contenido: `
        <div class="form-grid">
          <div class="field">
            <label>Fecha de emision</label>
            <input class="input" type="date" name="fecha" value="${hoyISO()}" />
          </div>
          <div class="field">
            <label>Dias de credito</label>
            <input class="input" type="number" name="dias_credito" min="0" value="${Number(VP.state.config.fac_dias_credito) || 30}" />
          </div>
          <div class="field">
            <label>Retencion en la fuente (%)</label>
            <input class="input" type="number" name="retencion_pct" min="0" max="100" step="0.5" value="0" />
          </div>
          <div class="field">
            <label>Forma de pago</label>
            <select class="select" name="forma_pago">
              ${['Transferencia', 'Contado', 'Tarjeta', 'Cheque', 'Otro'].map((o) => `<option>${o}</option>`).join('')}
            </select>
          </div>
        </div>`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Generar factura',
          tipo: 'primary',
          icono: 'factura',
          cerrar: false,
          accion: async (controlador) => {
            const datos = ui.leerFormulario(controlador.raiz);
            try {
              const factura = await VP.api.facturaDesdeCotizacion({ cotizacion_id: f.id, ...datos });
              VP.documentoCache.limpiar();
              ui.aviso.exito(`Factura ${factura.numero} generada.`, 'Listo');
              controlador.cerrar();
              await recargar(raiz);
              await VP.api.documento('factura', factura.id, 'previsualizar');
            } catch (error) {
              ui.aviso.error(error.message);
            }
          },
        },
      ],
    });
    return modal;
  }

  async function eliminar(f, modal, raiz) {
    const confirmado = await ui.confirmar({
      titulo: 'Eliminar cotizacion',
      mensaje: `Se eliminara definitivamente la cotizacion ${f.numero}.`,
      detalle: 'Esta accion no se puede deshacer.',
      textoOk: 'Eliminar',
    });
    if (!confirmado) return;

    try {
      await VP.api.eliminarCotizacion(f.id);
      ui.aviso.exito(`Cotizacion ${f.numero} eliminada.`);
      modal.cerrar();
      await recargar(raiz);
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  async function exportar() {
    const cabeceras = [
      { titulo: 'Numero', valor: (f) => f.numero },
      { titulo: 'Fecha', valor: (f) => f.fecha },
      { titulo: 'Cliente', valor: (f) => f.cliente_nombre },
      { titulo: 'NIT', valor: (f) => f.cliente_nit },
      { titulo: 'Asesor', valor: (f) => f.asesor_nombre },
      { titulo: 'Vence', valor: (f) => f.fecha_vencimiento },
      { titulo: 'Estado', valor: (f) => f.estado },
      { titulo: 'Subtotal', valor: (f) => f.subtotal },
      { titulo: 'IVA', valor: (f) => f.iva_valor },
      { titulo: 'Total', valor: (f) => f.total },
    ];

    const opcion = await ui.modal({
      titulo: `Exportar ${filas.length} cotizaciones`,
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
          const r = await VP.api.exportarCsv({ nombre: 'cotizaciones', cabeceras: cabeceras.map((c) => c.titulo), filas: ui.filasParaExportar(cabeceras, filas) });
          if (!r.cancelado) ui.aviso.exito('Exportacion generada.');
        } else {
          const r = await VP.api.informe({ titulo: 'Listado de cotizaciones', subtitulo: `${filas.length} documentos`, cabeceras, filas, accion: 'guardar' });
          if (r && r.ruta) ui.aviso.exito('Informe generado.');
        }
      });
    });
  }

  VP.views.cotizaciones = {
    titulo: 'Cotizaciones',
    subtitulo: 'Propuestas comerciales, vigencia y seguimiento',
    montar,
  };
})();
