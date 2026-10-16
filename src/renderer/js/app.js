/* ==========================================================================
   Fluxo · Arranque, navegacion y atajos
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml } = VP.utils;
  const { $, $$ } = VP.dom;

  const NAV = [
    { grupo: 'Comercial' },
    { clave: 'panel', titulo: 'Panel', icono: 'panel' },
    { clave: 'cotizaciones', titulo: 'Cotizaciones', icono: 'cotizacion' },
    { clave: 'facturas', titulo: 'Facturas', icono: 'factura' },
    { clave: 'recaudos', titulo: 'Recaudos', icono: 'recaudo' },
    { grupo: 'Maestros' },
    { clave: 'clientes', titulo: 'Clientes', icono: 'clientes' },
    { clave: 'asesores', titulo: 'Asesores', icono: 'asesores' },
    { clave: 'productos', titulo: 'Productos', icono: 'productos' },
    { grupo: 'Sistema' },
    { clave: 'ajustes', titulo: 'Ajustes', icono: 'ajustes' },
  ];

  let vistaActual = null;
  let paramsActuales = {};
  let ocupado = false;

  const insignias = {};

  /* ------------------------------------------------------------------ */
  /* Navegacion                                                          */
  /* ------------------------------------------------------------------ */

  function pintarNavegacion() {
    const nav = $('#nav');
    nav.innerHTML = NAV.map((item) => {
      if (item.grupo) return `<div class="nav-group">${escapeHtml(item.grupo)}</div>`;
      const insignia = insignias[item.clave];
      return `
        <button class="nav-item ${item.clave === vistaActual ? 'is-active' : ''}" type="button" data-vista="${item.clave}">
          ${icon(item.icono, 18)}
          <span>${escapeHtml(item.titulo)}</span>
          ${insignia ? `<span class="nav-item__badge ${insignia.alerta ? 'is-alert' : ''}">${escapeHtml(String(insignia.valor))}</span>` : ''}
        </button>`;
    }).join('');

    $$('[data-vista]', nav).forEach((boton) => {
      boton.addEventListener('click', () => ir(boton.getAttribute('data-vista')));
    });

    const activo = $('.nav-item.is-active', nav);
    if (activo) activo.scrollIntoView({ block: 'nearest' });
  }

  async function ir(vista, params = {}) {
    if (!VP.views[vista]) vista = 'panel';
    if (ocupado && vista === vistaActual) return;

    // Cerrar modales abiertos al cambiar de seccion.
    $$('.modal-backdrop').forEach((m) => m.remove());
    document.querySelectorAll('.tooltip-chart').forEach((t) => t.remove());

    vistaActual = vista;
    paramsActuales = params;
    pintarNavegacion();

    const definicion = VP.views[vista];
    const workspace = $('#workspace');
    const acciones = $('#page-actions');

    $('#page-title').textContent = definicion.titulo;
    $('#page-subtitle').textContent = definicion.subtitulo;
    acciones.innerHTML = '';
    workspace.scrollTop = 0;
    workspace.innerHTML = VP.ui.cargando();

    ocupado = true;
    try {
      await definicion.montar(workspace, acciones, params);
    } catch (error) {
      console.error(error);
      workspace.innerHTML = VP.ui.vacio({
        icono: 'alerta',
        titulo: 'Ocurrio un error al abrir la seccion',
        texto: error.message,
        accion: '<button class="btn btn--primary" type="button" data-reintentar>Reintentar</button>',
      });
      $('[data-reintentar]', workspace)?.addEventListener('click', () => ir(vista, params));
    } finally {
      ocupado = false;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Insignias                                                           */
  /* ------------------------------------------------------------------ */

  async function actualizarInsignias() {
    try {
      const cfg = await VP.api.config();
      const dias = Number(cfg.cot_alerta_dias) || 15;

      const [cartera, cotizaciones, stock] = await Promise.all([
        VP.api.facturas({ estadoGrupo: 'cartera' }),
        VP.api.cotizaciones({ estancadasDias: dias }),
        VP.api.productos({ activo: true, bajoStock: true }),
      ]);

      const vencidas = cartera.filter((f) => Number(f.dias_vencida) > 0).length;

      insignias.cotizaciones = cotizaciones.length ? { valor: cotizaciones.length, alerta: cotizaciones.length > 3 } : null;
      insignias.facturas = vencidas ? { valor: vencidas, alerta: true } : null;
      insignias.productos = stock.length ? { valor: stock.length, alerta: stock.length > 2 } : null;
      insignias.clientes = null;
      insignias.asesores = null;
      insignias.recaudos = null;

      pintarNavegacion();
    } catch (error) {
      console.warn('No se pudieron calcular las insignias:', error.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Atajos y menu nativo                                                */
  /* ------------------------------------------------------------------ */

  function atajos() {
    document.addEventListener('keydown', (evento) => {
      const enFormulario = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

      if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
        evento.preventDefault();
        ir('cotizaciones');
        setTimeout(() => $('#cot-buscar')?.focus(), 120);
        return;
      }

      if (!enFormulario && evento.key === 'F5') {
        evento.preventDefault();
        ir(vistaActual, paramsActuales);
        return;
      }

      if (!enFormulario && evento.altKey) {
        const mapa = { 1: 'panel', 2: 'cotizaciones', 3: 'facturas', 4: 'recaudos', 5: 'clientes', 6: 'asesores', 7: 'productos', 8: 'ajustes' };
        const destino = mapa[evento.key];
        if (destino) {
          evento.preventDefault();
          ir(destino);
        }
      }
    });

    window.Fluxo.alMenu((accion) => {
      const mapa = {
        'nueva-cotizacion': () => VP.documento.abrir({ tipo: 'cotizacion', alGuardar: () => ir(vistaActual, paramsActuales) }),
        'nueva-factura': () => VP.documento.abrir({ tipo: 'factura', alGuardar: () => ir(vistaActual, paramsActuales) }),
        'nuevo-cliente': () => ir('clientes'),
        'ir-panel': () => ir('panel'),
        'ir-cotizaciones': () => ir('cotizaciones'),
        'ir-facturas': () => ir('facturas'),
      };
      if (mapa[accion]) mapa[accion]();
    });
  }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */

  async function iniciar() {
    try {
      const [info, cfg] = await Promise.all([VP.api.info(), VP.api.config()]);
      VP.state.config = cfg;

      $('#sidebar-version').innerHTML = `v${escapeHtml(info.version)} · Electron ${escapeHtml(String(info.electron).split('.')[0])}`;

      atajos();
      $('#sidebar').addEventListener('click', (evento) => {
        const boton = evento.target.closest('[data-accion="respaldar"]');
        if (!boton) return;
        VP.api
          .respaldar()
          .then((r) => {
            if (r && !r.cancelado) VP.ui.aviso.exito('Respaldo guardado.', 'Listo');
          })
          .catch((error) => VP.ui.aviso.error(error.message));
      });

      await ir('panel');
      actualizarInsignias();
    } catch (error) {
      console.error(error);
      $('#workspace').innerHTML = VP.ui.vacio({
        icono: 'alerta',
        titulo: 'No se pudo iniciar la aplicacion',
        texto: error.message,
      });
    }
  }

  VP.app = {
    ir,
    recargar: () => ir(vistaActual, paramsActuales),
    actualizarInsignias,
    get vista() {
      return vistaActual;
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
