/* ==========================================================================
   Fluxo · Recaudos (pagos recibidos)
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, formatFecha, recortar } = VP.utils;
  const { $, $$ } = VP.dom;
  const ui = VP.ui;

  const filtros = { q: '', desde: '', hasta: '', metodo: '', orden: { clave: 'fecha', dir: 'desc' } };
  let filas = [];

  async function recargar(raiz) {
    filas = await VP.api.pagos(filtros);
    pintar(raiz);
  }

  async function montar(raiz, acciones) {
    acciones.innerHTML = `
      <button class="btn" type="button" data-accion="exportar">${icon('descargar', 16)} Exportar</button>
      <button class="btn btn--primary" type="button" data-accion="registrar">${icon('mas', 16)} Registrar recaudo</button>`;

    raiz.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="table-toolbar">
            <div class="search">
              ${icon('buscar')}
              <label class="hidden" for="rec-buscar">Buscar</label>
              <input class="input" id="rec-buscar" type="search" placeholder="Buscar por factura, cliente o referencia..." value="${escapeHtml(filtros.q)}" />
            </div>
            <select class="select" data-filtro="metodo" style="width:160px">
              <option value="">Todos los metodos</option>
              ${['Transferencia', 'Efectivo', 'Tarjeta', 'Cheque', 'Otro'].map((m) => `<option value="${m}" ${filtros.metodo === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
            <input class="input" type="date" data-filtro="desde" value="${filtros.desde}" style="width:150px" title="Desde" />
            <input class="input" type="date" data-filtro="hasta" value="${filtros.hasta}" style="width:150px" title="Hasta" />
            <button class="btn btn--ghost btn--sm" type="button" data-accion="limpiar">${icon('refrescar', 15)} Limpiar</button>
          </div>
          <div data-resumen></div>
          <div data-tabla></div>
        </div>
      </div>`;

    const buscar = $('#rec-buscar', raiz);
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

    $('[data-accion="limpiar"]', raiz).addEventListener('click', () => montar(raiz, acciones));
    $('[data-accion="registrar"]', acciones).addEventListener('click', () => registrar(raiz));
    $('[data-accion="exportar"]', acciones).addEventListener('click', exportar);

    await recargar(raiz);
  }

  const COLUMNAS = [
    {
      clave: 'fecha',
      titulo: 'Fecha',
      ordenable: true,
      render: (p) => `<div>${escapeHtml(formatFecha(p.fecha))}</div><span class="sub">${escapeHtml(VP.utils.hace(p.fecha))}</span>`,
    },
    {
      clave: 'cliente',
      titulo: 'Cliente',
      ordenable: true,
      render: (p) => `<div>${escapeHtml(recortar(p.cliente_nombre, 36))}</div><span class="sub">${escapeHtml(p.factura_numero)}</span>`,
    },
    { clave: 'metodo', titulo: 'Metodo', render: (p) => `<span class="chip">${escapeHtml(p.metodo || '—')}</span>` },
    { clave: 'referencia', titulo: 'Referencia', render: (p) => escapeHtml(p.referencia || '—') },
    { clave: 'monto', titulo: 'Monto', num: true, ordenable: true, render: (p) => `<strong class="text-success">${formatMoneda(p.monto)}</strong>` },
    {
      clave: 'acciones',
      titulo: '',
      clase: 'num',
      render: (p) => `
        <div class="table-actions">
          <button class="btn btn--ghost btn--icon" type="button" title="Ver factura" data-accion-fila="factura" data-id="${p.factura_id}">${icon('factura', 15)}</button>
          <button class="btn btn--ghost btn--icon" type="button" title="Eliminar" data-accion-fila="eliminar" data-id="${p.id}">${icon('borrar', 15)}</button>
        </div>`,
    },
  ];

  function pintar(raiz) {
    const total = filas.reduce((a, p) => a + Number(p.monto), 0);
    const porMetodo = {};
    filas.forEach((p) => {
      const m = p.metodo || 'Otro';
      porMetodo[m] = (porMetodo[m] || 0) + Number(p.monto);
    });

    $('[data-resumen]', raiz).innerHTML = `
      <div class="table-toolbar" style="border-bottom:0;padding-bottom:6px">
        <span class="chip">${icon('recaudo', 14)} ${formatNumero(filas.length, { decimales: 0 })} pagos</span>
        <span class="chip" style="background:var(--success-soft);border-color:#a7f3d0;color:var(--success)">${icon('dinero', 14)} Total ${formatMoneda(total)}</span>
        ${Object.entries(porMetodo)
          .map(([m, v]) => `<span class="chip">${escapeHtml(m)}: ${formatMoneda(v)}</span>`)
          .join('')}
      </div>`;

    $('[data-tabla]', raiz).innerHTML = ui.tabla(COLUMNAS, filas, {
      vacioIcono: 'recaudo',
      vacioTitulo: filtros.q ? 'Sin resultados' : 'Aun no hay recaudos',
      vacioTexto: filtros.q
        ? 'Prueba con otro numero de factura, cliente o referencia.'
        : 'Registra un pago desde aqui o desde el detalle de una factura.',
      orden: filtros.orden,
    });

    $$('[data-ordenar]', raiz).forEach((th) => {
      th.addEventListener('click', async () => {
        const clave = th.getAttribute('data-ordenar');
        filtros.orden = { clave, dir: filtros.orden.clave === clave && filtros.orden.dir === 'desc' ? 'asc' : 'desc' };
        await recargar(raiz);
      });
    });

    $$('[data-accion-fila]', raiz).forEach((boton) => {
      boton.addEventListener('click', async () => {
        const id = Number(boton.getAttribute('data-id'));
        if (boton.getAttribute('data-accion-fila') === 'factura') {
          VP.app.ir('facturas', { abrir: id });
          return;
        }
        const confirmado = await ui.confirmar({ titulo: 'Eliminar pago', mensaje: 'Se eliminara el pago y se recalculara el saldo de la factura.', textoOk: 'Eliminar' });
        if (!confirmado) return;
        try {
          await VP.api.eliminarPago(id);
          ui.aviso.exito('Pago eliminado.');
          await recargar(raiz);
        } catch (error) {
          ui.aviso.error(error.message);
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Registro de un recaudo suelto                                       */
  /* ------------------------------------------------------------------ */

  async function registrar(raiz) {
    const [clientes, facturas] = await Promise.all([VP.api.clientes({ activo: true }), VP.api.facturas({ estadoGrupo: 'cartera' })]);

    if (!facturas.length) {
      ui.aviso.info('No hay facturas con saldo pendiente.');
      return;
    }

    const modal = ui.modal({
      titulo: 'Registrar recaudo',
      subtitulo: 'Aplica el pago a una factura en cartera.',
      tamano: 'sm',
      contenido: `
        <div class="form-grid">
          <div class="field span-2">
            <label>Cliente</label>
            <select class="select" data-cliente>
              <option value="">Todos</option>
              ${clientes.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="field span-2">
            <label>Factura <span class="req">*</span></label>
            <select class="select" name="factura_id" data-factura>
              ${facturas
                .map((f) => `<option value="${f.id}" data-cliente="${f.cliente_id}" data-saldo="${f.saldo}">${escapeHtml(f.numero)} · ${escapeHtml(recortar(f.cliente_nombre, 26))} · saldo ${formatMoneda(f.saldo)}</option>`)
                .join('')}
            </select>
          </div>
          <div class="field span-2">
            <label>Monto <span class="req">*</span></label>
            <input class="input" type="number" name="monto" min="0" step="1" value="${Math.max(0, Math.round(Number(facturas[0].saldo) || 0))}" data-monto />
          </div>
          <div class="field">
            <label>Fecha</label>
            <input class="input" type="date" name="fecha" value="${VP.utils.hoyISO()}" />
          </div>
          <div class="field">
            <label>Metodo</label>
            <select class="select" name="metodo">
              ${['Transferencia', 'Efectivo', 'Tarjeta', 'Cheque', 'Otro'].map((m) => `<option>${m}</option>`).join('')}
            </select>
          </div>
          <div class="field span-2">
            <label>Referencia</label>
            <input class="input" name="referencia" placeholder="Numero de transferencia o recibo" />
          </div>
        </div>`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: 'Registrar',
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
              await VP.api.guardarPago({ ...datos, factura_id: Number(datos.factura_id) });
              ui.aviso.exito('Recaudo registrado.');
              controlador.cerrar();
              await recargar(raiz);
            } catch (error) {
              ui.aviso.error(error.message);
            }
          },
        },
      ],
    });

    const selectFactura = $('[data-factura]', modal.raiz);
    const campoMonto = $('[data-monto]', modal.raiz);

    const sincronizarMonto = () => {
      const saldo = selectFactura.selectedOptions[0]?.getAttribute('data-saldo');
      if (saldo) campoMonto.value = Math.round(Number(saldo));
    };

    selectFactura.addEventListener('change', sincronizarMonto);

    $('[data-cliente]', modal.raiz).addEventListener('change', (evento) => {
      const clienteId = evento.target.value;
      Array.from(selectFactura.options).forEach((opcion) => {
        opcion.hidden = Boolean(clienteId) && opcion.getAttribute('data-cliente') !== clienteId;
      });
      const primera = Array.from(selectFactura.options).find((o) => !o.hidden);
      if (primera) {
        selectFactura.value = primera.value;
        sincronizarMonto();
      }
    });
  }

  async function exportar() {
    const cabeceras = [
      { titulo: 'Fecha', valor: (p) => p.fecha },
      { titulo: 'Factura', valor: (p) => p.factura_numero },
      { titulo: 'Cliente', valor: (p) => p.cliente_nombre },
      { titulo: 'Metodo', valor: (p) => p.metodo },
      { titulo: 'Referencia', valor: (p) => p.referencia },
      { titulo: 'Monto', valor: (p) => p.monto },
      { titulo: 'Notas', valor: (p) => p.notas },
    ];

    const r = await VP.api.exportarCsv({ nombre: 'recaudos', cabeceras: cabeceras.map((c) => c.titulo), filas: ui.filasParaExportar(cabeceras, filas) });
    if (!r.cancelado) ui.aviso.exito('Exportacion generada.');
  }

  VP.views.recaudos = {
    titulo: 'Recaudos',
    subtitulo: 'Pagos recibidos y aplicacion a cartera',
    montar,
  };
})();
