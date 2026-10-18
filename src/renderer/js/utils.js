/* ==========================================================================
   Fluxo · Utilidades de la interfaz
   ========================================================================== */
(function () {
  'use strict';

  const VP = (window.VP = window.VP || {});
  VP.views = VP.views || {};
  VP.state = VP.state || { config: {}, filtros: {} };

  /* ------------------------------------------------------------------ */
  /* Iconos                                                              */
  /* ------------------------------------------------------------------ */

  const TRAZOS = {
    panel: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    cotizacion: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h4"/>',
    factura: '<path d="M4 2h16v20l-3-2-2 2-3-2-3 2-2-2-3 2z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    recaudo: '<rect x="2" y="6" width="20" height="13" rx="2.5"/><path d="M2 10h20"/><circle cx="17" cy="14.5" r="1.4"/>',
    clientes: '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    asesores: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M16.5 11.5l2 2 4-4.5"/>',
    productos: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5"/><path d="M12 22V12"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.6h.1A1.7 1.7 0 0 0 9 1V1a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 2.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    mas: '<path d="M12 5v14M5 12h14"/>',
    buscar: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    descargar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    imprimir: '<path d="M6 9V2h12v7"/><rect x="6" y="14" width="12" height="8"/><path d="M18 9h1a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1"/><path d="M6 9H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1"/>',
    ver: '<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>',
    editar: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    borrar: '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    duplicar: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    cerrar: '<path d="M18 6L6 18M6 6l12 12"/>',
    chevronIzq: '<path d="M15 18l-6-6 6-6"/>',
    chevronDer: '<path d="M9 18l6-6-6-6"/>',
    flechaArriba: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    flechaAbajo: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    alerta: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    ok: '<circle cx="12" cy="12" r="10"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
    refrescar: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    calendario: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    filtro: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    enviar: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    dinero: '<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    tendencia: '<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>',
    reloj: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    carpeta: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    usuario: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    subir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
    basura: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    caja: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
    documento: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>',
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    gastos: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.4 12.4a1.6 1.6 0 0 0 1.6 1.3h9.2a1.6 1.6 0 0 0 1.6-1.3L22 7H6"/>',
    paleta: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 1 0 0 20 2.5 2.5 0 0 0 2.5-2.5c0-.6-.2-1.1-.6-1.5a2.1 2.1 0 0 1 1.5-3.6H17a5 5 0 0 0 5-5c0-4.4-4.5-7.4-10-7.4z"/>',
    tarjeta: '<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M6 15h4"/>',
    okPago: '<path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    luna: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  };

  /**
   * Devuelve un icono SVG en linea.
   * @param {string} nombre
   * @param {number|object} opciones tamano o { size, clase, stroke }
   */
  function icon(nombre, opciones) {
    const opts = typeof opciones === 'number' ? { size: opciones } : opciones || {};
    const size = opts.size || 18;
    const cuerpo = TRAZOS[nombre] || TRAZOS.info;
    const stroke = opts.stroke || 'currentColor';
    return `<svg class="${opts.clase || ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${opts.grosor || 1.9}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cuerpo}</svg>`;
  }

  VP.icon = icon;
  VP.iconos = TRAZOS;

  /* ------------------------------------------------------------------ */
  /* Texto                                                               */
  /* ------------------------------------------------------------------ */

  function escapeHtml(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizar(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function iniciales(nombre) {
    const partes = String(nombre || '?').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '?';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[1][0]).toUpperCase();
  }

  const PALETA = ['#2563eb', '#0891b2', '#059669', '#d97706', '#7c3aed', '#db2777', '#0ea5e9', '#65a30d', '#ea580c', '#4f46e5'];

  function colorDe(texto) {
    const clave = String(texto || '');
    let suma = 0;
    for (let i = 0; i < clave.length; i += 1) suma = (suma * 31 + clave.charCodeAt(i)) >>> 0;
    return PALETA[suma % PALETA.length];
  }

  function recortar(texto, max = 42) {
    const t = String(texto || '');
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }

  /* ------------------------------------------------------------------ */
  /* Numeros                                                             */
  /* ------------------------------------------------------------------ */

  function decimales() {
    const d = Number(VP.state.config.decimales);
    return Number.isFinite(d) ? d : 0;
  }

  function simbolo() {
    return VP.state.config.simbolo || '$';
  }

  function formatNumero(valor, opciones = {}) {
    const n = Number(valor) || 0;
    const d = opciones.decimales === undefined ? decimales() : opciones.decimales;
    return n.toLocaleString('es-CO', {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }

  function formatMoneda(valor, opciones = {}) {
    const n = Number(valor) || 0;
    const signo = n < 0 ? '-' : '';
    return `${signo}${simbolo()} ${formatNumero(Math.abs(n), opciones)}`;
  }

  /** Formato compacto para ejes y tarjetas: 1,2 M · 850 K. */
  function formatCompacto(valor) {
    const n = Math.abs(Number(valor) || 0);
    const signo = Number(valor) < 0 ? '-' : '';
    if (n >= 1e9) return `${signo}${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace('.', ',')} MM`;
    if (n >= 1e6) return `${signo}${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',')} M`;
    if (n >= 1e3) return `${signo}${Math.round(n / 1e3)} K`;
    return `${signo}${Math.round(n)}`;
  }

  function formatPorcentaje(valor, decimal = 1) {
    const n = Number(valor) || 0;
    return `${n.toFixed(decimal).replace('.', ',')}%`;
  }

  /* ------------------------------------------------------------------ */
  /* Fechas                                                              */
  /* ------------------------------------------------------------------ */

  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

  function hoyISO() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function fechaISO(fecha) {
    if (!fecha) return '';
    if (fecha instanceof Date) return fecha.toISOString().slice(0, 10);
    return String(fecha).slice(0, 10);
  }

  function formatFecha(fecha, formato = 'corto') {
    const iso = fechaISO(fecha);
    if (!iso || iso.length < 10) return '—';
    const [a, m, d] = iso.split('-');
    if (formato === 'largo') return `${Number(d)} de ${MESES[Number(m) - 1]} de ${a}`;
    if (formato === 'corto') return `${d}/${m}/${a}`;
    if (formato === 'mes') return `${MESES_CORTOS[Number(m) - 1]} ${a.slice(2)}`;
    return iso;
  }

  function diasEntre(desde, hasta) {
    const a = Date.parse(`${fechaISO(desde)}T00:00:00Z`);
    const b = Date.parse(`${fechaISO(hasta)}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return 0;
    return Math.round((b - a) / 86400000);
  }

  function sumarDias(fecha, dias) {
    const [a, m, d] = fechaISO(fecha).split('-').map(Number);
    if (!a) return '';
    const date = new Date(Date.UTC(a, m - 1, d));
    date.setUTCDate(date.getUTCDate() + Number(dias || 0));
    return date.toISOString().slice(0, 10);
  }

  /** "hace 3 dias", "en 5 dias", "hoy". */
  function hace(fecha) {
    const dias = diasEntre(fecha, hoyISO());
    if (dias === 0) return 'hoy';
    if (dias === 1) return 'ayer';
    if (dias > 1) return `hace ${dias} dias`;
    return `en ${Math.abs(dias)} dias`;
  }

  function rangoMes(mes) {
    const [a, m] = String(mes).split('-').map(Number);
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
    return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
  }

  const ACENTOS = {
    azul: { primary: '#2563eb', dark: '#1d4ed8', soft: '#eff4ff', rgb: '37, 99, 235' },
    verde: { primary: '#059669', dark: '#047857', soft: '#ecfdf5', rgb: '5, 150, 105' },
    morado: { primary: '#7c3aed', dark: '#6d28d9', soft: '#f5f3ff', rgb: '124, 58, 237' },
    rosa: { primary: '#db2777', dark: '#be185d', soft: '#fdf2f8', rgb: '219, 39, 119' },
    naranja: { primary: '#ea580c', dark: '#c2410c', soft: '#fff7ed', rgb: '234, 88, 12' },
    turquesa: { primary: '#0891b2', dark: '#0e7490', soft: '#ecfeff', rgb: '8, 145, 178' },
  };
  const NOMBRES_ACENTO = { azul: 'Azul', verde: 'Verde', morado: 'Morado', rosa: 'Rosa', naranja: 'Naranja', turquesa: 'Turquesa' };

  /** Lee una lista guardada como JSON en la configuracion. */
  function listaConfig(clave, respaldo = []) {
    const valor = VP.state.config ? VP.state.config[clave] : null;
    try {
      const lista = JSON.parse(valor);
      return Array.isArray(lista) && lista.length ? lista : respaldo;
    } catch {
      return respaldo;
    }
  }

  /** Aplica tema, color de acento y estado de la barra lateral. */
  function aplicarApariencia(cfg = {}) {
    const tema = cfg.tema === 'oscuro' ? 'oscuro' : 'claro';
    const acento = ACENTOS[cfg.acento] ? cfg.acento : 'azul';
    const colapsado = cfg.sidebar_colapsado === '1' || cfg.sidebar_colapsado === 1 || cfg.sidebar_colapsado === true;

    const html = document.documentElement;
    html.setAttribute('data-tema', tema);
    html.setAttribute('data-acento', acento);
    html.classList.toggle('is-colapsado', colapsado);

    try {
      localStorage.setItem('fluxo_tema', tema);
      localStorage.setItem('fluxo_acento', acento);
      localStorage.setItem('fluxo_sidebar', colapsado ? '1' : '0');
    } catch { /* almacenamiento no disponible */ }

    return { tema, acento, colapsado };
  }

  VP.utils = {
    icon, escapeHtml, normalizar, iniciales, colorDe, recortar,
    decimales, simbolo, formatNumero, formatMoneda, formatCompacto, formatPorcentaje,
    MESES, MESES_CORTOS, DIAS,
    hoyISO, fechaISO, formatFecha, diasEntre, sumarDias, hace, rangoMes,
    ACENTOS, NOMBRES_ACENTO, listaConfig, aplicarApariencia,
  };

  /* ------------------------------------------------------------------ */
  /* DOM                                                                 */
  /* ------------------------------------------------------------------ */

  const $ = (selector, raiz = document) => raiz.querySelector(selector);
  const $$ = (selector, raiz = document) => Array.from(raiz.querySelectorAll(selector));

  function el(html) {
    const plantilla = document.createElement('template');
    plantilla.innerHTML = String(html).trim();
    return plantilla.content.firstElementChild;
  }

  function debounce(fn, espera = 250) {
    let id = null;
    return function debounced(...args) {
      clearTimeout(id);
      id = setTimeout(() => fn.apply(this, args), espera);
    };
  }

  function uid(prefijo = 'id') {
    return `${prefijo}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function porId(lista) {
    const mapa = {};
    for (const item of lista || []) mapa[item.id] = item;
    return mapa;
  }

  function sumarPor(lista, campo) {
    return (lista || []).reduce((acc, item) => acc + (Number(item[campo]) || 0), 0);
  }

  VP.dom = { $, $$, el, debounce, uid, porId, sumarPor };
})();
