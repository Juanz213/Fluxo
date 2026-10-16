/* ==========================================================================
   Fluxo · Asesores comerciales
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, formatPorcentaje, formatFecha, formatCompacto, recortar, hoyISO } = VP.utils;
  const { $, $$ } = VP.dom;
  const ui = VP.ui;

  const filtros = { q: '', activo: true, zona: '', orden: { clave: 'facturado_mes', dir: 'desc' } };
  let filas = [];
  let zonas = [];

  async function recargar(raiz) {
    filas = await VP.api.asesores(filtros);
    pintar(raiz);
  }

  async function montar(raiz, acciones) {
    zonas = await VP.api.zonas();

    acciones.innerHTML = `
      <button class="btn" type="button" data-accion="exportar">${icon('descargar', 16)} Exportar</button>
      <button class="btn btn--primary" type="button" data-accion="nuevo">${icon('mas', 16)} Nuevo asesor</button>`;

    raiz.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="table-toolbar">
            <div class="search">
              ${icon('buscar')}
              <label class="hidden" for="ase-buscar">Buscar</label>
              <input class="input" id="ase-buscar" type="search" placeholder="Buscar asesor por nombre, zona o documento..." value="${escapeHtml(filtros.q)}" />
            </div>
            <select class="select" data-filtro="zona" style="width:180px">
              <option value="">Todas las zonas</option>
              ${zonas.map((z) => `<option value="${escapeHtml(z)}" ${filtros.zona === z ? 'selected' : ''}>${escapeHtml(z)}</option>`).join('')}
            </select>
            <select class="select" data-filtro-orden style="width:210px">
              ${[
                ['facturado_mes', 'Mayor facturacion del mes'],
                ['facturado_total', 'Mayor facturacion historica'],
                ['nombre', 'Nombre (A-Z)'],
                ['cartera', 'Mayor cartera pendiente'],
              ].map(([v, t]) => `<option value="${v}" ${filtros.orden.clave === v ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <label class="switch">
              <input type="checkbox" data-filtro-check="activo" ${filtros.activo ? 'checked' : ''} />
              <span class="switch__track"></span>
              <span class="switch__label">Solo activos</span>
            </label>
          </div>
          <div data-resumen></div>
        </div>
        <div data-tarjetas></div>
      </div>`;

    const buscar = $('#ase-buscar', raiz);
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

    $('[data-filtro-orden]', raiz).addEventListener('change', async (evento) => {
      filtros.orden = { clave: evento.target.value, dir: evento.target.value === 'nombre' ? 'asc' : 'desc' };
      await recargar(raiz);
    });

    $('[data-filtro-check="activo"]', raiz).addEventListener('change', async (evento) => {
      filtros.activo = evento.target.checked;
      await recargar(raiz);
    });

    $('[data-accion="nuevo"]', acciones).addEventListener('click', () => formulario(null, raiz));
    $('[data-accion="exportar"]', acciones).addEventListener('click', exportar);

    await recargar(raiz);
  }

  function pintar(raiz) {
    const facturadoMes = filas.reduce((a, f) => a + Number(f.facturado_mes), 0);
    const metaMes = filas.reduce((a, f) => a + Number(f.meta_mensual), 0);
    const cartera = filas.reduce((a, f) => a + Number(f.cartera), 0);

    $('[data-resumen]', raiz).innerHTML = `
      <div class="table-toolbar" style="border-bottom:0;padding-bottom:6px">
        <span class="chip">${icon('asesores', 14)} ${formatNumero(filas.length, { decimales: 0 })} asesores</span>
        <span class="chip">${icon('dinero', 14)} Facturado del mes ${formatMoneda(facturadoMes)}</span>
        <span class="chip">${icon('tendencia', 14)} Meta del equipo ${formatMoneda(metaMes)} · ${formatPorcentaje(metaMes ? (facturadoMes / metaMes) * 100 : 0)}</span>
        <span class="chip">${icon('caja', 14)} Cartera ${formatMoneda(cartera)}</span>
      </div>`;

    const contenedor = $('[data-tarjetas]', raiz);

    if (!filas.length) {
      contenedor.innerHTML = ui.vacio({ icono: 'asesores', titulo: 'Sin asesores', texto: 'Registra a tu equipo comercial para medir su desempeño.', accion: '' });
      return;
    }

    contenedor.innerHTML = `<div class="grid grid--3">${filas.map(tarjeta).join('')}</div>`;

    $$('[data-asesor]', raiz).forEach((nodo) => {
      const id = Number(nodo.getAttribute('data-asesor'));
      nodo.querySelectorAll('[data-accion-fila]').forEach((boton) => {
        boton.addEventListener('click', (evento) => {
          evento.stopPropagation();
          const accion = boton.getAttribute('data-accion-fila');
          if (accion === 'editar') formulario(id, raiz);
          else desglose(id, raiz);
        });
      });
      nodo.addEventListener('click', () => desglose(id, raiz));
    });
  }

  function tarjeta(a) {
    const avance = Math.min(100, Number(a.avance_meta) || 0);
    const tono = avance >= 100 ? '' : avance >= 60 ? 'progress__bar--warning' : 'progress__bar--danger';
    return `
      <div class="card" data-asesor="${a.id}" style="cursor:pointer">
        <div class="card__body">
          <div class="row" style="gap:12px;align-items:flex-start">
            ${ui.avatar(a.nombre, 'lg')}
            <div style="flex:1;min-width:0">
              <div style="font-weight:650;font-size:15px">${escapeHtml(a.nombre)}</div>
              <div class="text-muted" style="font-size:12px">${escapeHtml(a.codigo)} · ${escapeHtml(a.zona || 'Sin zona')}</div>
              <div class="row" style="gap:6px;margin-top:7px">
                ${a.activo ? '<span class="badge badge--aprobada">Activo</span>' : '<span class="badge badge--rechazada">Inactivo</span>'}
                <span class="chip" style="font-size:11px">${formatNumero(a.comision_pct)}% comision</span>
              </div>
            </div>
            <div class="table-actions">
              <button class="btn btn--ghost btn--icon" type="button" data-accion-fila="editar" title="Editar">${icon('editar', 15)}</button>
              <button class="btn btn--ghost btn--icon" type="button" data-accion-fila="detalle" title="Desempeño">${icon('ver', 15)}</button>
            </div>
          </div>

          <div class="grid grid--3" style="gap:10px;margin-top:16px">
            <div class="stat-mini"><span>Facturado mes</span><strong>${formatCompacto(a.facturado_mes)}</strong></div>
            <div class="stat-mini"><span>Cierre</span><strong>${formatPorcentaje(a.tasa_cierre, 0)}</strong></div>
            <div class="stat-mini"><span>Clientes</span><strong>${formatNumero(a.clientes_activos, { decimales: 0 })}</strong></div>
          </div>

          <div style="margin-top:14px">
            <div class="row" style="justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:5px">
              <span>Meta del mes</span>
              <span>${formatMoneda(a.facturado_mes)} / ${formatMoneda(a.meta_mensual)}</span>
            </div>
            <div class="progress"><div class="progress__bar ${tono}" style="width:${avance}%"></div></div>
            <div class="row" style="justify-content:space-between;font-size:11.5px;margin-top:5px">
              <span class="text-muted">${formatPorcentaje(a.avance_meta)} de la meta</span>
              <span class="text-muted">Comision estimada ${formatMoneda(a.comision_estimada)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Formulario                                                          */
  /* ------------------------------------------------------------------ */

  async function formulario(id, raiz) {
    const asesor = id
      ? await VP.api.asesor(id)
      : { codigo: await VP.api.codigoAsesor(), activo: true, comision_pct: 3, meta_mensual: 50000000 };

    const modal = ui.modal({
      titulo: id ? `Editar asesor ${asesor.codigo}` : 'Nuevo asesor',
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="form-grid">
            <div class="field">
              <label>Codigo</label>
              <input class="input" name="codigo" value="${escapeHtml(asesor.codigo || '')}" readonly />
            </div>
            <div class="field span-2">
              <label>Nombre completo <span class="req">*</span></label>
              <input class="input" name="nombre" value="${escapeHtml(asesor.nombre || '')}" />
            </div>
            <div class="field">
              <label>Documento</label>
              <input class="input" name="documento" value="${escapeHtml(asesor.documento || '')}" />
            </div>
            <div class="field">
              <label>Telefono</label>
              <input class="input" name="telefono" value="${escapeHtml(asesor.telefono || '')}" />
            </div>
            <div class="field">
              <label>Correo</label>
              <input class="input" name="email" value="${escapeHtml(asesor.email || '')}" />
            </div>
            <div class="field">
              <label>Zona / Region</label>
              <input class="input" name="zona" value="${escapeHtml(asesor.zona || '')}" list="zonas-lista" />
              <datalist id="zonas-lista">${zonas.map((z) => `<option value="${escapeHtml(z)}"></option>`).join('')}</datalist>
            </div>
            <div class="field">
              <label>Fecha de ingreso</label>
              <input class="input" type="date" name="fecha_ingreso" value="${escapeHtml(asesor.fecha_ingreso || hoyISO())}" />
            </div>
            <div class="field">
              <label>Comision (%)</label>
              <input class="input" type="number" name="comision_pct" min="0" max="100" step="0.1" value="${Number(asesor.comision_pct) || 0}" />
            </div>
            <div class="field">
              <label>Meta mensual</label>
              <input class="input" type="number" name="meta_mensual" min="0" step="100000" value="${Number(asesor.meta_mensual) || 0}" />
            </div>
            <div class="field" style="justify-content:flex-end">
              <label class="switch">
                <input type="checkbox" name="activo" ${asesor.activo ? 'checked' : ''} />
                <span class="switch__track"></span>
                <span class="switch__label">Asesor activo</span>
              </label>
            </div>
            <div class="field span-3">
              <label>Notas</label>
              <textarea class="textarea" name="notas" rows="2">${escapeHtml(asesor.notas || '')}</textarea>
            </div>
          </div>
        </div>`,
      acciones: [
        id ? { texto: 'Eliminar', tipo: 'ghost', clase: 'left text-danger', icono: 'borrar', cerrar: false, accion: () => eliminar(asesor, raiz, modal) } : null,
        { texto: 'Cancelar' },
        {
          texto: id ? 'Guardar cambios' : 'Crear asesor',
          tipo: 'primary',
          icono: 'ok',
          cerrar: false,
          accion: async (controlador) => {
            const datos = ui.leerFormulario(controlador.raiz);
            ui.limpiarInvalidos(controlador.raiz);
            if (!String(datos.nombre || '').trim()) return ui.marcarInvalido(controlador.raiz, 'nombre', 'Escribe el nombre del asesor.');
            try {
              const guardado = await VP.api.guardarAsesor({ ...datos, id: asesor.id });
              VP.documentoCache.limpiar();
              ui.aviso.exito(`Asesor ${guardado.codigo} guardado.`);
              controlador.cerrar();
              zonas = await VP.api.zonas();
              await recargar(raiz);
            } catch (error) {
              ui.aviso.error(error.message);
            }
          },
        },
      ].filter(Boolean),
    });
    return modal;
  }

  async function eliminar(asesor, raiz, modal) {
    const confirmado = await ui.confirmar({
      titulo: 'Eliminar asesor',
      mensaje: `Se eliminara ${asesor.nombre}.`,
      detalle: 'Solo es posible si no tiene clientes, cotizaciones ni facturas asociadas.',
      textoOk: 'Eliminar',
    });
    if (!confirmado) return;
    try {
      await VP.api.eliminarAsesor(asesor.id);
      ui.aviso.exito('Asesor eliminado.');
      modal.cerrar();
      await recargar(raiz);
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Desglose de desempeño                                               */
  /* ------------------------------------------------------------------ */

  async function desglose(id, raiz) {
    const asesor = await VP.api.asesor(id);
    if (!asesor) return;

    const [cotizaciones, facturas] = await Promise.all([
      VP.api.cotizaciones({ asesor_id: id }),
      VP.api.facturas({ asesor_id: id }),
    ]);

    const ultimasCot = cotizaciones.slice(0, 8);
    const ultimasFac = facturas.slice(0, 8);

    const modal = ui.modal({
      titulo: asesor.nombre,
      subtitulo: `${asesor.codigo} · ${asesor.zona || 'Sin zona'} · ${formatPorcentaje(asesor.tasa_cierre)} de cierre`,
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="grid grid--3" style="gap:12px">
            <div class="stat-mini"><span>Facturado historico</span><strong>${formatMoneda(asesor.facturado_total)}</strong></div>
            <div class="stat-mini"><span>Facturado del mes</span><strong>${formatMoneda(asesor.facturado_mes)}</strong></div>
            <div class="stat-mini"><span>Cartera pendiente</span><strong>${formatMoneda(asesor.cartera)}</strong></div>
            <div class="stat-mini"><span>Cotizaciones</span><strong>${formatNumero(asesor.cotizaciones_total, { decimales: 0 })}</strong></div>
            <div class="stat-mini"><span>Ganadas</span><strong class="text-success">${formatNumero(asesor.cotizaciones_ganadas, { decimales: 0 })}</strong></div>
            <div class="stat-mini"><span>Clientes activos</span><strong>${formatNumero(asesor.clientes_activos, { decimales: 0 })}</strong></div>
          </div>

          <div class="card"><div class="card__body">
            <div class="section-title" style="margin-top:0">Avance de meta mensual</div>
            <div class="row" style="justify-content:space-between;font-size:13px;margin-bottom:6px">
              <span>${formatMoneda(asesor.facturado_mes)} de ${formatMoneda(asesor.meta_mensual)}</span>
              <strong>${formatPorcentaje(asesor.avance_meta)}</strong>
            </div>
            <div class="progress"><div class="progress__bar" style="width:${Math.min(100, Number(asesor.avance_meta) || 0)}%"></div></div>
            <div class="row" style="margin-top:12px;gap:18px;flex-wrap:wrap">
              <span class="chip">Comision ${formatNumero(asesor.comision_pct)}%</span>
              <span class="chip">Comision estimada del mes ${formatMoneda(asesor.comision_estimada)}</span>
              <span class="chip">Ingreso ${formatFecha(asesor.fecha_ingreso)}</span>
            </div>
          </div></div>

          <div class="grid grid--2">
            <div class="card">
              <div class="card__head"><h3>Ultimas cotizaciones</h3></div>
              <div class="quick-list">
                ${ultimasCot.length
                  ? ultimasCot
                      .map(
                        (c) => `<div class="quick-list__item" data-cotizacion="${c.id}">
                          <div><div>${escapeHtml(c.numero)}</div><div class="meta">${escapeHtml(recortar(c.cliente_nombre, 26))}</div></div>
                          ${ui.estado(c.estado)}
                          <div class="val">${formatMoneda(c.total)}</div>
                        </div>`,
                      )
                      .join('')
                  : '<div class="card__body text-muted" style="font-size:13px">Sin cotizaciones.</div>'}
              </div>
            </div>
            <div class="card">
              <div class="card__head"><h3>Ultimas facturas</h3></div>
              <div class="quick-list">
                ${ultimasFac.length
                  ? ultimasFac
                      .map(
                        (f) => `<div class="quick-list__item" data-factura="${f.id}">
                          <div><div>${escapeHtml(f.numero)}</div><div class="meta">${escapeHtml(recortar(f.cliente_nombre, 26))}</div></div>
                          ${ui.estado(f.estado)}
                          <div class="val">${formatMoneda(f.total)}</div>
                        </div>`,
                      )
                      .join('')
                  : '<div class="card__body text-muted" style="font-size:13px">Sin facturas.</div>'}
              </div>
            </div>
          </div>
        </div>`,
      acciones: [
        { texto: 'Editar', icono: 'editar', accion: () => { modal.cerrar(); formulario(id, raiz); } },
        { texto: 'Cerrar' },
      ],
    });

    modal.raiz.addEventListener('click', (evento) => {
      const c = evento.target.closest('[data-cotizacion]');
      if (c) { modal.cerrar(); VP.app.ir('cotizaciones', { abrir: Number(c.getAttribute('data-cotizacion')) }); return; }
      const f = evento.target.closest('[data-factura]');
      if (f) { modal.cerrar(); VP.app.ir('facturas', { abrir: Number(f.getAttribute('data-factura')) }); }
    });
  }

  async function exportar() {
    const cabeceras = [
      { titulo: 'Codigo', valor: (a) => a.codigo },
      { titulo: 'Nombre', valor: (a) => a.nombre },
      { titulo: 'Zona', valor: (a) => a.zona },
      { titulo: 'Telefono', valor: (a) => a.telefono },
      { titulo: 'Correo', valor: (a) => a.email },
      { titulo: 'Comision %', valor: (a) => a.comision_pct },
      { titulo: 'Meta mensual', valor: (a) => a.meta_mensual },
      { titulo: 'Facturado mes', valor: (a) => a.facturado_mes },
      { titulo: 'Facturado total', valor: (a) => a.facturado_total },
      { titulo: 'Cartera', valor: (a) => a.cartera },
      { titulo: 'Tasa de cierre %', valor: (a) => a.tasa_cierre },
      { titulo: 'Activo', valor: (a) => (a.activo ? 'Si' : 'No') },
    ];
    const r = await VP.api.exportarCsv({ nombre: 'asesores', cabeceras: cabeceras.map((c) => c.titulo), filas: ui.filasParaExportar(cabeceras, filas) });
    if (!r.cancelado) ui.aviso.exito('Exportacion generada.');
  }

  VP.views.asesores = {
    titulo: 'Asesores comerciales',
    subtitulo: 'Equipo de ventas, metas y comisiones',
    montar,
  };
})();
