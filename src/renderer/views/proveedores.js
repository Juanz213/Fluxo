/* ==========================================================================
   Fluxo · Proveedores
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, formatFecha, recortar } = VP.utils;
  const { $, $$ } = VP.dom;
  const ui = VP.ui;

  const filtros = { q: '', ciudad: '', activo: true, conSaldo: false, orden: { clave: 'nombre', dir: 'asc' } };
  let filas = [];
  let ciudades = [];

  async function recargar(raiz) {
    filas = await VP.api.proveedores(filtros);
    pintar(raiz);
  }

  async function montar(raiz, acciones, params = {}) {
    ciudades = await VP.api.ciudadesProveedor();

    acciones.innerHTML = `
      <button class="btn" type="button" data-accion="exportar">${icon('descargar', 16)} Exportar</button>
      <button class="btn btn--primary" type="button" data-accion="nuevo">${icon('mas', 16)} Nuevo proveedor</button>`;

    raiz.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="table-toolbar">
            <div class="search">
              ${icon('buscar')}
              <label class="hidden" for="prv-buscar">Buscar</label>
              <input class="input" id="prv-buscar" type="search" placeholder="Buscar por nombre, NIT o contacto..." value="${escapeHtml(filtros.q)}" />
            </div>
            <select class="select" data-filtro="ciudad" style="width:170px">
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

    const buscar = $('#prv-buscar', raiz);
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
      Object.assign(filtros, { q: '', ciudad: '', activo: true, conSaldo: false });
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
      titulo: 'Proveedor',
      ordenable: true,
      render: (p) => `
        <div class="pill-asesor">${ui.avatar(p.nombre, 'sm')}<div>
          <div class="strong">${escapeHtml(recortar(p.nombre, 40))}</div>
          <span class="sub">${escapeHtml(p.codigo)} · NIT ${escapeHtml(p.nit || '—')}${p.dv ? `-${escapeHtml(p.dv)}` : ''}</span>
        </div></div>`,
    },
    {
      clave: 'ciudad',
      titulo: 'Ubicacion',
      ordenable: true,
      render: (p) => `<div>${escapeHtml(p.ciudad || '—')}</div><span class="sub">${escapeHtml(p.contacto || p.departamento || '')}</span>`,
    },
    {
      clave: 'contacto',
      titulo: 'Contacto',
      render: (p) => `<div>${escapeHtml(p.telefono || '—')}</div><span class="sub">${escapeHtml(p.email || '')}</span>`,
    },
    { clave: 'comprado_total', titulo: 'Comprado', num: true, ordenable: true, render: (p) => formatMoneda(p.comprado_total) },
    {
      clave: 'saldo',
      titulo: 'Por pagar',
      num: true,
      ordenable: true,
      render: (p) => (Number(p.saldo) > 0
        ? `<strong class="text-danger">${formatMoneda(p.saldo)}</strong>`
        : '<span class="text-success">Al dia</span>'),
    },
    {
      clave: 'acciones',
      titulo: '',
      clase: 'num',
      render: (p) => `
        <div class="table-actions">
          <button class="btn btn--ghost btn--icon" type="button" title="Registrar gasto" data-accion-fila="gasto" data-id="${p.id}">${icon('gastos', 15)}</button>
          <button class="btn btn--ghost btn--icon" type="button" title="Editar" data-accion-fila="editar" data-id="${p.id}">${icon('editar', 15)}</button>
          <button class="btn btn--ghost btn--icon" type="button" title="Ficha" data-accion-fila="detalle" data-id="${p.id}">${icon('ver', 15)}</button>
        </div>`,
    },
  ];

  function pintar(raiz) {
    const totalSaldo = filas.reduce((a, p) => a + Number(p.saldo), 0);

    $('[data-resumen]', raiz).innerHTML = `
      <div class="table-toolbar" style="border-bottom:0;padding-bottom:6px">
        <span class="chip">${icon('caja', 14)} ${formatNumero(filas.length, { decimales: 0 })} proveedores</span>
        <span class="chip">${icon('gastos', 14)} Comprado ${formatMoneda(filas.reduce((a, p) => a + Number(p.comprado_total), 0))}</span>
        <span class="chip">${icon('dinero', 14)} Por pagar ${formatMoneda(totalSaldo)}</span>
      </div>`;

    $('[data-tabla]', raiz).innerHTML = ui.tabla(COLUMNAS, filas, {
      vacioIcono: 'caja',
      vacioTitulo: filtros.q ? 'Sin resultados' : 'Aun no hay proveedores',
      vacioTexto: filtros.q ? 'Prueba con otro nombre o NIT.' : 'Registra tus proveedores para controlar los gastos.',
      orden: filtros.orden,
      filaAtributos: (p) => `data-fila-id="${p.id}"`,
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
        if (accion === 'gasto') return gastarPara(id, raiz);
        return detalle(id, raiz);
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Formulario                                                          */
  /* ------------------------------------------------------------------ */

  async function formulario(id, raiz) {
    const proveedor = id
      ? await VP.api.proveedor(id)
      : { codigo: await VP.api.codigoProveedor(), activo: true };

    const modal = ui.modal({
      titulo: id ? `Editar proveedor ${proveedor.codigo}` : 'Nuevo proveedor',
      subtitulo: 'Los usaras al registrar facturas de gasto.',
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="section-title">Identificacion</div>
          <div class="form-grid">
            <div class="field">
              <label>Codigo</label>
              <input class="input" name="codigo" value="${escapeHtml(proveedor.codigo || '')}" readonly />
            </div>
            <div class="field">
              <label>NIT / Documento <span class="req">*</span></label>
              <input class="input" name="nit" value="${escapeHtml(proveedor.nit || '')}" />
            </div>
            <div class="field">
              <label>Digito de verificacion</label>
              <input class="input" name="dv" maxlength="2" value="${escapeHtml(proveedor.dv || '')}" />
            </div>
            <div class="field span-3">
              <label>Razon social / Nombre <span class="req">*</span></label>
              <input class="input" name="nombre" value="${escapeHtml(proveedor.nombre || '')}" />
            </div>
          </div>

          <div class="section-title">Contacto</div>
          <div class="form-grid">
            <div class="field">
              <label>Persona de contacto</label>
              <input class="input" name="contacto" value="${escapeHtml(proveedor.contacto || '')}" />
            </div>
            <div class="field">
              <label>Telefono</label>
              <input class="input" name="telefono" value="${escapeHtml(proveedor.telefono || '')}" />
            </div>
            <div class="field">
              <label>Correo electronico</label>
              <input class="input" name="email" value="${escapeHtml(proveedor.email || '')}" />
            </div>
            <div class="field span-3">
              <label>Direccion</label>
              <input class="input" name="direccion" value="${escapeHtml(proveedor.direccion || '')}" />
            </div>
            <div class="field">
              <label>Ciudad</label>
              <input class="input" name="ciudad" value="${escapeHtml(proveedor.ciudad || '')}" />
            </div>
            <div class="field">
              <label>Departamento</label>
              <input class="input" name="departamento" value="${escapeHtml(proveedor.departamento || '')}" />
            </div>
            <div class="field" style="justify-content:flex-end">
              <label class="switch">
                <input type="checkbox" name="activo" ${proveedor.activo ? 'checked' : ''} />
                <span class="switch__track"></span>
                <span class="switch__label">Proveedor activo</span>
              </label>
            </div>
            <div class="field span-3">
              <label>Notas</label>
              <textarea class="textarea" name="notas" rows="2">${escapeHtml(proveedor.notas || '')}</textarea>
            </div>
          </div>
        </div>`,
      acciones: [
        id ? { texto: 'Eliminar', tipo: 'ghost', clase: 'left text-danger', icono: 'borrar', cerrar: false, accion: () => eliminarProveedor(proveedor, raiz, modal) } : null,
        { texto: 'Cancelar' },
        {
          texto: id ? 'Guardar cambios' : 'Crear proveedor',
          tipo: 'primary',
          icono: 'ok',
          cerrar: false,
          accion: async (controlador) => {
            const datos = ui.leerFormulario(controlador.raiz);
            ui.limpiarInvalidos(controlador.raiz);
            if (!String(datos.nombre || '').trim()) return ui.marcarInvalido(controlador.raiz, 'nombre', 'Escribe la razon social.');
            try {
              const guardado = await VP.api.guardarProveedor({ ...datos, id: proveedor.id });
              ui.aviso.exito(`Proveedor ${guardado.codigo} guardado.`);
              controlador.cerrar();
              ciudades = await VP.api.ciudadesProveedor();
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

  async function eliminarProveedor(proveedor, raiz, modal) {
    const confirmado = await ui.confirmar({
      titulo: 'Eliminar proveedor',
      mensaje: `Se eliminara ${proveedor.nombre}.`,
      detalle: 'Solo es posible si no tiene facturas de gasto asociadas.',
      textoOk: 'Eliminar',
    });
    if (!confirmado) return;
    try {
      await VP.api.eliminarProveedor(proveedor.id);
      ui.aviso.exito('Proveedor eliminado.');
      modal.cerrar();
      await recargar(raiz);
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Ficha del proveedor                                                 */
  /* ------------------------------------------------------------------ */

  async function detalle(id, raiz) {
    const [proveedor, historial] = await Promise.all([VP.api.proveedor(id), VP.api.historialProveedor(id)]);
    if (!proveedor) return;

    const gastos = historial.length
      ? historial
          .map(
            (g) => `
          <div class="quick-list__item" data-gasto="${g.id}">
            <div><div>${escapeHtml(g.numero)}</div><div class="meta">${escapeHtml(formatFecha(g.fecha))} · vence ${escapeHtml(formatFecha(g.fecha_vencimiento))}</div></div>
            ${ui.estado(g.estado)}
            <div class="val">${formatMoneda(g.total)}${Number(g.saldo) > 0 ? `<div class="meta text-danger">saldo ${formatMoneda(g.saldo)}</div>` : ''}</div>
          </div>`,
          )
          .join('')
      : '<div class="card__body text-muted" style="font-size:13px">Sin gastos registrados.</div>';

    const modal = ui.modal({
      titulo: proveedor.nombre,
      subtitulo: `${proveedor.codigo} · NIT ${proveedor.nit || ''}${proveedor.dv ? `-${proveedor.dv}` : ''}`,
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="grid grid--3" style="gap:12px">
            <div class="stat-mini"><span>Comprado historico</span><strong>${formatMoneda(proveedor.comprado_total)}</strong></div>
            <div class="stat-mini"><span>Por pagar</span><strong class="${Number(proveedor.saldo) > 0 ? 'text-danger' : 'text-success'}">${formatMoneda(proveedor.saldo)}</strong></div>
            <div class="stat-mini"><span>Ciudad</span><strong>${escapeHtml(proveedor.ciudad || '—')}</strong></div>
          </div>

          <div class="card"><div class="card__body">
            <div class="section-title" style="margin-top:0">Datos de contacto</div>
            <div class="info-list">
              <div class="info-list__row"><span>Contacto</span><span>${escapeHtml(proveedor.contacto || '—')}</span></div>
              <div class="info-list__row"><span>Telefono</span><span>${escapeHtml(proveedor.telefono || '—')}</span></div>
              <div class="info-list__row"><span>Correo</span><span>${escapeHtml(proveedor.email || '—')}</span></div>
              <div class="info-list__row"><span>Direccion</span><span>${escapeHtml(proveedor.direccion || '—')}</span></div>
              <div class="info-list__row"><span>Notas</span><span>${escapeHtml(proveedor.notas || '—')}</span></div>
            </div>
          </div></div>

          <div class="card">
            <div class="card__head"><h3>Gastos recientes</h3></div>
            <div class="quick-list">${gastos}</div>
          </div>
        </div>`,
      acciones: [
        { texto: 'Registrar gasto', icono: 'gastos', accion: () => gastarPara(id, raiz) },
        { texto: 'Editar', icono: 'editar', accion: () => { modal.cerrar(); formulario(id, raiz); } },
        { texto: 'Cerrar' },
      ],
    });

    modal.raiz.addEventListener('click', (evento) => {
      const g = evento.target.closest('[data-gasto]');
      if (g) { modal.cerrar(); VP.app.ir('gastos', { abrir: Number(g.getAttribute('data-gasto')) }); }
    });
  }

  function gastarPara(id, raiz) {
    return VP.app.ir('gastos', { nuevo: true, proveedor: id });
  }

  async function exportar() {
    const cabeceras = [
      { titulo: 'Codigo', valor: (p) => p.codigo },
      { titulo: 'Nombre', valor: (p) => p.nombre },
      { titulo: 'NIT', valor: (p) => p.nit },
      { titulo: 'Ciudad', valor: (p) => p.ciudad },
      { titulo: 'Contacto', valor: (p) => p.contacto },
      { titulo: 'Telefono', valor: (p) => p.telefono },
      { titulo: 'Correo', valor: (p) => p.email },
      { titulo: 'Comprado', valor: (p) => p.comprado_total },
      { titulo: 'Por pagar', valor: (p) => p.saldo },
      { titulo: 'Activo', valor: (p) => (p.activo ? 'Si' : 'No') },
    ];

    const r = await VP.api.exportarCsv({ nombre: 'proveedores', cabeceras: cabeceras.map((c) => c.titulo), filas: ui.filasParaExportar(cabeceras, filas) });
    if (!r.cancelado) ui.aviso.exito('Exportacion generada.');
  }

  VP.views.proveedores = {
    titulo: 'Proveedores',
    subtitulo: 'Compras, contactos y cuentas por pagar',
    montar,
  };
})();
