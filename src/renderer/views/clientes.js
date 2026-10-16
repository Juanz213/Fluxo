/* ==========================================================================
   Fluxo · Clientes
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, formatFecha, recortar } = VP.utils;
  const { $, $$ } = VP.dom;
  const ui = VP.ui;

  const filtros = { q: '', asesor_id: '', ciudad: '', activo: true, conSaldo: false, orden: { clave: 'nombre', dir: 'asc' } };
  let filas = [];
  let asesores = [];
  let ciudades = [];

  async function recargar(raiz) {
    filas = await VP.api.clientes(filtros);
    pintar(raiz);
  }

  async function montar(raiz, acciones, params = {}) {
    [asesores, ciudades] = await Promise.all([VP.api.asesores({}), VP.api.ciudades()]);

    acciones.innerHTML = `
      <button class="btn" type="button" data-accion="exportar">${icon('descargar', 16)} Exportar</button>
      <button class="btn btn--primary" type="button" data-accion="nuevo">${icon('mas', 16)} Nuevo cliente</button>`;

    raiz.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="table-toolbar">
            <div class="search">
              ${icon('buscar')}
              <label class="hidden" for="cli-buscar">Buscar</label>
              <input class="input" id="cli-buscar" type="search" placeholder="Buscar por nombre, NIT o ciudad..." value="${escapeHtml(filtros.q)}" />
            </div>
            <select class="select" data-filtro="asesor_id" style="width:180px">
              <option value="">Todos los asesores</option>
              ${asesores.map((a) => `<option value="${a.id}" ${String(filtros.asesor_id) === String(a.id) ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`).join('')}
            </select>
            <select class="select" data-filtro="ciudad" style="width:160px">
              <option value="">Todas las ciudades</option>
              ${ciudades.map((c) => `<option value="${escapeHtml(c)}" ${filtros.ciudad === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
            </select>
            <label class="switch">
              <input type="checkbox" data-filtro-check="conSaldo" ${filtros.conSaldo ? 'checked' : ''} />
              <span class="switch__track"></span>
              <span class="switch__label">Solo con saldo</span>
            </label>
            <label class="switch">
              <input type="checkbox" data-filtro-check="activo" ${filtros.activo ? 'checked' : ''} />
              <span class="switch__track"></span>
              <span class="switch__label">Solo activos</span>
            </label>
            <button class="btn btn--ghost btn--sm" type="button" data-accion="limpiar">${icon('refrescar', 15)} Limpiar</button>
          </div>
          <div data-resumen></div>
          <div data-tabla></div>
        </div>
      </div>`;

    const buscar = $('#cli-buscar', raiz);
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

    $$('[data-filtro-check]', raiz).forEach((campo) => {
      campo.addEventListener('change', async () => {
        filtros[campo.getAttribute('data-filtro-check')] = campo.checked;
        await recargar(raiz);
      });
    });

    $('[data-accion="limpiar"]', raiz).addEventListener('click', () => {
      Object.assign(filtros, { q: '', asesor_id: '', ciudad: '', activo: true, conSaldo: false });
      montar(raiz, acciones);
    });

    $('[data-accion="nuevo"]', acciones).addEventListener('click', () => formulario(null, raiz));
    $('[data-accion="exportar"]', acciones).addEventListener('click', exportar);

    await recargar(raiz);

    if (params.abrir) await detalle(Number(params.abrir), raiz);
  }

  /* ------------------------------------------------------------------ */
  /* Tabla                                                               */
  /* ------------------------------------------------------------------ */

  const COLUMNAS = [
    {
      clave: 'nombre',
      titulo: 'Cliente',
      ordenable: true,
      render: (c) => `
        <div class="pill-asesor">${ui.avatar(c.nombre, 'sm')}<div>
          <div class="strong">${escapeHtml(recortar(c.nombre, 40))}</div>
          <span class="sub">${escapeHtml(c.codigo)} · ${escapeHtml(c.tipo_documento || '')} ${escapeHtml(c.nit || '')}${c.dv ? `-${escapeHtml(c.dv)}` : ''}</span>
        </div></div>`,
    },
    {
      clave: 'ciudad',
      titulo: 'Ubicacion',
      ordenable: true,
      render: (c) => `<div>${escapeHtml(c.ciudad || '—')}</div><span class="sub">${escapeHtml(c.departamento || '')}</span>`,
    },
    {
      clave: 'asesor',
      titulo: 'Asesor',
      render: (c) => (c.asesor_nombre ? `<span class="chip">${escapeHtml(c.asesor_nombre)}</span>` : '<span class="text-muted">Sin asignar</span>'),
    },
    { clave: 'facturado_total', titulo: 'Facturado', num: true, ordenable: true, render: (c) => formatMoneda(c.facturado_total) },
    {
      clave: 'saldo',
      titulo: 'Saldo',
      num: true,
      ordenable: true,
      render: (c) => (Number(c.saldo) > 0
        ? `<strong class="${Number(c.vencido) > 0 ? 'text-danger' : ''}">${formatMoneda(c.saldo)}</strong>${Number(c.vencido) > 0 ? `<span class="sub text-danger">${formatMoneda(c.vencido)} vencido</span>` : ''}`
        : '<span class="text-success">Al dia</span>'),
    },
    {
      clave: 'acciones',
      titulo: '',
      clase: 'num',
      render: (c) => `
        <div class="table-actions">
          <button class="btn btn--ghost btn--icon" type="button" title="Cotizar" data-accion-fila="cotizar" data-id="${c.id}">${icon('cotizacion', 15)}</button>
          <button class="btn btn--ghost btn--icon" type="button" title="Editar" data-accion-fila="editar" data-id="${c.id}">${icon('editar', 15)}</button>
          <button class="btn btn--ghost btn--icon" type="button" title="Ficha" data-accion-fila="detalle" data-id="${c.id}">${icon('ver', 15)}</button>
        </div>`,
    },
  ];

  function pintar(raiz) {
    const totalSaldo = filas.reduce((a, c) => a + Number(c.saldo), 0);
    const totalVencido = filas.reduce((a, c) => a + Number(c.vencido), 0);

    $('[data-resumen]', raiz).innerHTML = `
      <div class="table-toolbar" style="border-bottom:0;padding-bottom:6px">
        <span class="chip">${icon('clientes', 14)} ${formatNumero(filas.length, { decimales: 0 })} clientes</span>
        <span class="chip">${icon('dinero', 14)} Facturado ${formatMoneda(filas.reduce((a, c) => a + Number(c.facturado_total), 0))}</span>
        <span class="chip">${icon('caja', 14)} Saldo ${formatMoneda(totalSaldo)}</span>
        ${totalVencido ? `<span class="chip" style="background:var(--danger-soft);border-color:#fecaca;color:var(--danger)">${icon('alerta', 14)} Vencido ${formatMoneda(totalVencido)}</span>` : ''}
      </div>`;

    $('[data-tabla]', raiz).innerHTML = ui.tabla(COLUMNAS, filas, {
      vacioIcono: 'clientes',
      vacioTitulo: filtros.q ? 'Sin resultados' : 'Aun no hay clientes',
      vacioTexto: filtros.q ? 'Prueba con otro nombre, NIT o ciudad.' : 'Registra tu primer cliente para empezar a cotizar.',
      orden: filtros.orden,
      filaAtributos: (c) => `data-fila-id="${c.id}"`,
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
        if (accion === 'editar') return formulario(id, raiz);
        if (accion === 'cotizar') return cotizarPara(id, raiz);
        return detalle(id, raiz);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Formulario                                                          */
  /* ------------------------------------------------------------------ */

  async function formulario(id, raiz) {
    const cliente = id
      ? await VP.api.cliente(id)
      : { codigo: await VP.api.codigoCliente(), tipo_persona: 'Juridica', tipo_documento: 'NIT', regimen: 'Responsable de IVA', activo: true, dias_credito: 30, asesor_id: '' };

    const modal = ui.modal({
      titulo: id ? `Editar cliente ${cliente.codigo}` : 'Nuevo cliente',
      subtitulo: 'Los datos de facturacion se usan en cotizaciones y facturas.',
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="section-title">Identificacion</div>
          <div class="form-grid">
            <div class="field">
              <label>Codigo</label>
              <input class="input" name="codigo" value="${escapeHtml(cliente.codigo || '')}" readonly />
            </div>
            <div class="field">
              <label>Tipo de persona</label>
              <select class="select" name="tipo_persona">
                ${['Juridica', 'Natural'].map((t) => `<option ${cliente.tipo_persona === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Tipo de documento</label>
              <select class="select" name="tipo_documento">
                ${['NIT', 'CC', 'CE', 'PP', 'TI'].map((t) => `<option ${cliente.tipo_documento === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Numero de documento <span class="req">*</span></label>
              <input class="input" name="nit" value="${escapeHtml(cliente.nit || '')}" />
            </div>
            <div class="field">
              <label>Digito de verificacion</label>
              <input class="input" name="dv" maxlength="2" value="${escapeHtml(cliente.dv || '')}" />
            </div>
            <div class="field span-2">
              <label>Razon social / Nombre <span class="req">*</span></label>
              <input class="input" name="nombre" value="${escapeHtml(cliente.nombre || '')}" />
            </div>
            <div class="field span-2">
              <label>Nombre comercial</label>
              <input class="input" name="nombre_comercial" value="${escapeHtml(cliente.nombre_comercial || '')}" />
            </div>
            <div class="field">
              <label>Regimen</label>
              <select class="select" name="regimen">
                ${['Responsable de IVA', 'No responsable de IVA', 'Simple', 'Gran contribuyente'].map((r) => `<option ${cliente.regimen === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="section-title">Contacto</div>
          <div class="form-grid">
            <div class="field">
              <label>Persona de contacto</label>
              <input class="input" name="contacto" value="${escapeHtml(cliente.contacto || '')}" />
            </div>
            <div class="field">
              <label>Telefono</label>
              <input class="input" name="telefono" value="${escapeHtml(cliente.telefono || '')}" />
            </div>
            <div class="field">
              <label>Correo electronico</label>
              <input class="input" name="email" value="${escapeHtml(cliente.email || '')}" />
            </div>
            <div class="field span-2">
              <label>Direccion</label>
              <input class="input" name="direccion" value="${escapeHtml(cliente.direccion || '')}" />
            </div>
            <div class="field">
              <label>Ciudad</label>
              <input class="input" name="ciudad" value="${escapeHtml(cliente.ciudad || '')}" />
            </div>
            <div class="field">
              <label>Departamento</label>
              <input class="input" name="departamento" value="${escapeHtml(cliente.departamento || '')}" />
            </div>
          </div>

          <div class="section-title">Condiciones comerciales</div>
          <div class="form-grid">
            <div class="field">
              <label>Asesor asignado</label>
              <select class="select" name="asesor_id">
                <option value="">Sin asignar</option>
                ${asesores.map((a) => `<option value="${a.id}" ${Number(cliente.asesor_id) === a.id ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Cupo de credito</label>
              <input class="input" type="number" name="cupo_credito" min="0" step="1000" value="${Number(cliente.cupo_credito) || 0}" />
            </div>
            <div class="field">
              <label>Dias de credito</label>
              <input class="input" type="number" name="dias_credito" min="0" step="1" value="${Number(cliente.dias_credito) || 0}" />
            </div>
            <div class="field" style="justify-content:flex-end">
              <label class="switch">
                <input type="checkbox" name="activo" ${cliente.activo ? 'checked' : ''} />
                <span class="switch__track"></span>
                <span class="switch__label">Cliente activo</span>
              </label>
            </div>
            <div class="field span-3">
              <label>Notas</label>
              <textarea class="textarea" name="notas" rows="2">${escapeHtml(cliente.notas || '')}</textarea>
            </div>
          </div>
        </div>`,
      acciones: [
        id ? { texto: 'Eliminar', tipo: 'ghost', clase: 'left text-danger', icono: 'borrar', cerrar: false, accion: () => eliminarCliente(cliente, raiz, modal) } : null,
        { texto: 'Cancelar' },
        {
          texto: id ? 'Guardar cambios' : 'Crear cliente',
          tipo: 'primary',
          icono: 'ok',
          cerrar: false,
          accion: async (controlador) => {
            const datos = ui.leerFormulario(controlador.raiz);
            ui.limpiarInvalidos(controlador.raiz);
            if (!String(datos.nombre || '').trim()) return ui.marcarInvalido(controlador.raiz, 'nombre', 'Escribe la razon social.');
            if (!String(datos.nit || '').trim()) return ui.marcarInvalido(controlador.raiz, 'nit', 'Escribe el documento.');
            try {
              const guardado = await VP.api.guardarCliente({ ...datos, id: cliente.id });
              VP.documentoCache.limpiar();
              ui.aviso.exito(`Cliente ${guardado.codigo} guardado.`);
              controlador.cerrar();
              ciudades = await VP.api.ciudades();
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

  async function eliminarCliente(cliente, raiz, modal) {
    const confirmado = await ui.confirmar({ titulo: 'Eliminar cliente', mensaje: `Se eliminara ${cliente.nombre}.`, detalle: 'Solo es posible si no tiene cotizaciones ni facturas.', textoOk: 'Eliminar' });
    if (!confirmado) return;
    try {
      await VP.api.eliminarCliente(cliente.id);
      ui.aviso.exito('Cliente eliminado.');
      modal.cerrar();
      await recargar(raiz);
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ficha del cliente                                                   */
  /* ------------------------------------------------------------------ */

  async function detalle(id, raiz) {
    const [cliente, historial] = await Promise.all([VP.api.cliente(id), VP.api.historialCliente(id)]);
    if (!cliente) return;

    const cotizaciones = historial.cotizaciones.length
      ? historial.cotizaciones
          .map(
            (c) => `
          <div class="quick-list__item" data-cotizacion="${c.id}">
            <div><div>${escapeHtml(c.numero)}</div><div class="meta">${escapeHtml(formatFecha(c.fecha))}</div></div>
            ${ui.estado(c.estado)}
            <div class="val">${formatMoneda(c.total)}</div>
          </div>`,
          )
          .join('')
      : '<div class="card__body text-muted" style="font-size:13px">Sin cotizaciones registradas.</div>';

    const facturas = historial.facturas.length
      ? historial.facturas
          .map(
            (f) => `
          <div class="quick-list__item" data-factura="${f.id}">
            <div><div>${escapeHtml(f.numero)}</div><div class="meta">${escapeHtml(formatFecha(f.fecha))} · vence ${escapeHtml(formatFecha(f.fecha_vencimiento))}</div></div>
            ${ui.estado(f.estado)}
            <div class="val">${formatMoneda(f.total)}${Number(f.saldo) > 0 ? `<div class="meta text-danger">saldo ${formatMoneda(f.saldo)}</div>` : ''}</div>
          </div>`,
          )
          .join('')
      : '<div class="card__body text-muted" style="font-size:13px">Sin facturas registradas.</div>';

    const modal = ui.modal({
      titulo: cliente.nombre,
      subtitulo: `${cliente.codigo} · ${cliente.tipo_documento} ${cliente.nit || ''}${cliente.dv ? `-${cliente.dv}` : ''}`,
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="grid grid--3" style="gap:12px">
            <div class="stat-mini"><span>Facturado historico</span><strong>${formatMoneda(cliente.facturado_total)}</strong></div>
            <div class="stat-mini"><span>Saldo pendiente</span><strong class="${Number(cliente.saldo) > 0 ? 'text-danger' : 'text-success'}">${formatMoneda(cliente.saldo)}</strong></div>
            <div class="stat-mini"><span>Cupo de credito</span><strong>${formatMoneda(cliente.cupo_credito)}</strong></div>
          </div>

          ${Number(cliente.cupo_credito) > 0 && Number(cliente.saldo) > Number(cliente.cupo_credito)
            ? `<div class="alert-row alert-row--danger">${icon('alerta', 17, { clase: 'ico' })}<div>Cupo de credito excedido: el saldo supera el limite autorizado.</div></div>`
            : ''}

          <div class="card"><div class="card__body">
            <div class="section-title" style="margin-top:0">Datos de contacto</div>
            <div class="info-list">
              <div class="info-list__row"><span>Contacto</span><span>${escapeHtml(cliente.contacto || '—')}</span></div>
              <div class="info-list__row"><span>Telefono</span><span>${escapeHtml(cliente.telefono || '—')}</span></div>
              <div class="info-list__row"><span>Correo</span><span>${escapeHtml(cliente.email || '—')}</span></div>
              <div class="info-list__row"><span>Direccion</span><span>${escapeHtml(cliente.direccion || '—')}</span></div>
              <div class="info-list__row"><span>Ciudad</span><span>${escapeHtml(cliente.ciudad || '—')}${cliente.departamento ? `, ${escapeHtml(cliente.departamento)}` : ''}</span></div>
              <div class="info-list__row"><span>Asesor</span><span>${escapeHtml(cliente.asesor_nombre || 'Sin asignar')}</span></div>
              <div class="info-list__row"><span>Condiciones</span><span>${Number(cliente.dias_credito)} dias de credito · ${escapeHtml(cliente.regimen || '')}</span></div>
            </div>
          </div></div>

          <div class="card">
            <div class="card__head"><h3>Cotizaciones recientes</h3></div>
            <div class="quick-list">${cotizaciones}</div>
          </div>

          <div class="card">
            <div class="card__head"><h3>Facturas recientes</h3></div>
            <div class="quick-list">${facturas}</div>
          </div>
        </div>`,
      acciones: [
        { texto: 'Cotizar', icono: 'cotizacion', accion: () => cotizarPara(id, raiz) },
        { texto: 'Facturar', tipo: 'primary', icono: 'factura', accion: () => VP.documento.abrir({ tipo: 'factura', alCerrar: () => recargar(raiz) }) },
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

  function cotizarPara(id, raiz) {
    return VP.documento.abrir({
      tipo: 'cotizacion',
      alGuardar: () => recargar(raiz),
      clienteInicial: id,
    });
  }

  async function exportar() {
    const cabeceras = [
      { titulo: 'Codigo', valor: (c) => c.codigo },
      { titulo: 'Nombre', valor: (c) => c.nombre },
      { titulo: 'Documento', valor: (c) => `${c.tipo_documento || ''} ${c.nit || ''}` },
      { titulo: 'Ciudad', valor: (c) => c.ciudad },
      { titulo: 'Contacto', valor: (c) => c.contacto },
      { titulo: 'Telefono', valor: (c) => c.telefono },
      { titulo: 'Correo', valor: (c) => c.email },
      { titulo: 'Asesor', valor: (c) => c.asesor_nombre },
      { titulo: 'Facturado', valor: (c) => c.facturado_total },
      { titulo: 'Saldo', valor: (c) => c.saldo },
      { titulo: 'Activo', valor: (c) => (c.activo ? 'Si' : 'No') },
    ];

    const r = await VP.api.exportarCsv({ nombre: 'clientes', cabeceras: cabeceras.map((c) => c.titulo), filas: ui.filasParaExportar(cabeceras, filas) });
    if (!r.cancelado) ui.aviso.exito('Exportacion generada.');
  }

  VP.views.clientes = {
    titulo: 'Clientes',
    subtitulo: 'Cartera de clientes, condiciones y saldos',
    montar,
  };
})();
