/* ==========================================================================
   Fluxo · Componentes de interfaz
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml } = VP.utils;
  const { $, $$, el } = VP.dom;

  /* ------------------------------------------------------------------ */
  /* Avisos flotantes                                                    */
  /* ------------------------------------------------------------------ */

  const ICONO_TIPO = { exito: 'ok', error: 'alerta', aviso: 'alerta', info: 'info' };

  function toast(mensaje, tipo = 'info', titulo) {
    const raiz = $('#toast-root');
    const nodo = el(`
      <div class="toast toast--${tipo}">
        <span class="toast__icon">${icon(ICONO_TIPO[tipo] || 'info', 18)}</span>
        <div class="toast__text">
          ${titulo ? `<strong>${escapeHtml(titulo)}</strong>` : ''}
          <span>${escapeHtml(mensaje)}</span>
        </div>
      </div>`);

    raiz.appendChild(nodo);
    const quitar = () => {
      nodo.style.transition = 'opacity .18s, transform .18s';
      nodo.style.opacity = '0';
      nodo.style.transform = 'translateX(16px)';
      setTimeout(() => nodo.remove(), 190);
    };
    setTimeout(quitar, tipo === 'error' ? 6500 : 3800);
    nodo.addEventListener('click', quitar);
    return quitar;
  }

  const aviso = {
    exito: (m, t) => toast(m, 'exito', t),
    error: (m, t) => toast(m, 'error', t || 'No se pudo completar'),
    aviso: (m, t) => toast(m, 'aviso', t),
    info: (m, t) => toast(m, 'info', t),
  };

  /* ------------------------------------------------------------------ */
  /* Modal                                                               */
  /* ------------------------------------------------------------------ */

  let modalesAbiertos = 0;

  function modal(opciones = {}) {
    const {
      titulo = '',
      subtitulo = '',
      contenido = '',
      tamano = '',
      acciones = [],
      bloqueo = false,
      alCerrar = null,
    } = opciones;

    const root = $('#modal-root');
    const backdrop = el(`
      <div class="modal-backdrop">
        <div class="modal ${tamano ? `modal--${tamano}` : ''}" role="dialog" aria-modal="true">
          <div class="modal__head">
            <div>
              <h3>${escapeHtml(titulo)}</h3>
              ${subtitulo ? `<p>${escapeHtml(subtitulo)}</p>` : ''}
            </div>
            <button class="btn btn--ghost btn--icon modal__close" type="button" aria-label="Cerrar">
              ${icon('cerrar', 18)}
            </button>
          </div>
          <div class="modal__body"></div>
          ${acciones.length ? '<div class="modal__foot"></div>' : ''}
        </div>
      </div>`);

    const cuerpo = $('.modal__body', backdrop);
    if (typeof contenido === 'string') cuerpo.innerHTML = contenido;
    else if (contenido) cuerpo.appendChild(contenido);

    modalesAbiertos += 1;

    let cerrado = false;
    function cerrar(resultado) {
      if (cerrado) return;
      cerrado = true;
      modalesAbiertos = Math.max(0, modalesAbiertos - 1);
      backdrop.remove();
      if (alCerrar) alCerrar(resultado);
    }

    const controlador = { cerrar, raiz: backdrop, cuerpo, footer: null };

    if (acciones.length) {
      const pie = $('.modal__foot', backdrop);
      controlador.footer = pie;
      for (const accion of acciones) {
        const boton = el(
          `<button class="btn ${accion.tipo ? `btn--${accion.tipo}` : ''} ${accion.clase || ''}" type="button">
             ${accion.icono ? icon(accion.icono, 16) : ''}<span>${escapeHtml(accion.texto)}</span>
           </button>`,
        );
        if (accion.izquierda) {
          boton.classList.add('left');
          pie.insertBefore(boton, pie.firstChild);
          if (!pie.classList.contains('left')) pie.classList.add('left');
        } else {
          pie.appendChild(boton);
        }
        boton.addEventListener('click', () => {
          if (accion.accion) accion.accion(controlador);
          if (accion.cerrar !== false) cerrar(accion.valor);
        });
      }
    }

    $('.modal__close', backdrop).addEventListener('click', () => {
      if (!bloqueo) cerrar(null);
      else toast('Completa o cancela el formulario para continuar.', 'aviso');
    });

    backdrop.addEventListener('mousedown', (evento) => {
      if (evento.target === backdrop && !bloqueo) cerrar(null);
    });

    root.appendChild(backdrop);

    const primerCampo = $('input:not([type="hidden"]), select, textarea', cuerpo);
    if (primerCampo && !opciones.sinFoco) setTimeout(() => primerCampo.focus(), 40);

    return controlador;
  }

  /** Confirmacion con promesa. */
  function confirmar(opciones = {}) {
    const {
      titulo = 'Confirmar accion',
      mensaje = '¿Deseas continuar?',
      detalle = '',
      textoOk = 'Confirmar',
      textoCancelar = 'Cancelar',
      tipo = 'danger',
    } = opciones;

    return new Promise((resolve) => {
      const controlador = modal({
        titulo,
        tamano: 'sm',
        contenido: `
          <div class="row" style="align-items:flex-start;gap:13px">
            <span class="ico" style="color:var(--${tipo === 'danger' ? 'danger' : 'primary'});flex:none">${icon(tipo === 'danger' ? 'alerta' : 'info', 22)}</span>
            <div style="font-size:13.5px;line-height:1.6">
              <div>${escapeHtml(mensaje)}</div>
              ${detalle ? `<div class="text-muted" style="margin-top:7px;font-size:12.5px">${detalle}</div>` : ''}
            </div>
          </div>`,
        acciones: [
          { texto: textoCancelar, accion: () => resolve(false) },
          { texto: textoOk, tipo, accion: () => resolve(true) },
        ],
        alCerrar: () => resolve(false),
      });
      $('.modal__foot .btn--' + tipo, controlador.raiz)?.focus();
    });
  }

  /** Entrada de texto simple con promesa. */
  function pedirTexto(opciones = {}) {
    const { titulo = 'Escribe un valor', etiqueta = 'Valor', valor = '', textoOk = 'Aceptar', requerido = true, multilinea = false } = opciones;
    return new Promise((resolve) => {
      let resuelto = false;
      const campo = multilinea
        ? `<textarea class="textarea" name="valor" rows="3">${escapeHtml(valor)}</textarea>`
        : `<input class="input" name="valor" value="${escapeHtml(valor)}" />`;

      const controlador = modal({
        titulo,
        tamano: 'sm',
        contenido: `<div class="field"><label>${escapeHtml(etiqueta)}</label>${campo}</div>`,
        acciones: [
          { texto: 'Cancelar', accion: () => { resuelto = true; resolve(null); } },
          {
            texto: textoOk,
            tipo: 'primary',
            cerrar: false,
            accion: (c) => {
              const nodo = $('[name="valor"]', c.raiz);
              const texto = nodo.value.trim();
              if (requerido && !texto) {
                nodo.classList.add('is-invalid');
                nodo.focus();
                return;
              }
              resuelto = true;
              c.cerrar(texto);
              resolve(texto);
            },
          },
        ],
        alCerrar: () => { if (!resuelto) resolve(null); },
      });
      return controlador;
    });
  }

  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    const abiertos = $$('.modal-backdrop');
    if (!abiertos.length) return;
    const ultimo = abiertos[abiertos.length - 1];
    $('.modal__close', ultimo)?.click();
  });

  /* ------------------------------------------------------------------ */
  /* Bloques reutilizables                                               */
  /* ------------------------------------------------------------------ */

  function cargando(texto = 'Cargando informacion...') {
    return `<div class="loading"><div class="spinner"></div><p>${escapeHtml(texto)}</p></div>`;
  }

  function vacio({ icono = 'documento', titulo = 'Sin resultados', texto = '', accion = '' } = {}) {
    return `
      <div class="empty">
        <div class="empty__icon">${icon(icono, 54)}</div>
        <h3>${escapeHtml(titulo)}</h3>
        ${texto ? `<p>${escapeHtml(texto)}</p>` : ''}
        ${accion}
      </div>`;
  }

  function pista(texto, icono = 'info') {
    return `<div class="hint-box">${icon(icono, 17)}<div>${escapeHtml(texto)}</div></div>`;
  }

  const CLASE_ESTADO = {
    Borrador: 'badge--borrador',
    Enviada: 'badge--enviada',
    Aprobada: 'badge--aprobada',
    Rechazada: 'badge--rechazada',
    Vencida: 'badge--vencida',
    Convertida: 'badge--convertida',
    Emitida: 'badge--emitida',
    Parcial: 'badge--parcial',
    Pagada: 'badge--pagada',
    Pendiente: 'badge--pendiente',
    Anulada: 'badge--anulada',
  };

  function estado(valor) {
    const clase = CLASE_ESTADO[valor] || 'badge--borrador';
    return `<span class="badge ${clase}">${escapeHtml(valor)}</span>`;
  }

  function delta(valor, opciones = {}) {
    const n = Number(valor) || 0;
    const sentido = n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat';
    const ico = sentido === 'up' ? 'flechaArriba' : sentido === 'down' ? 'flechaAbajo' : 'check';
    const texto = opciones.texto || `${n > 0 ? '+' : ''}${VP.utils.formatPorcentaje(n)}`;
    return `<span class="delta delta--${sentido}">${icon(ico, 12)}${escapeHtml(texto)}</span>`;
  }

  function avatar(nombre, tamano = '') {
    return `<span class="avatar ${tamano ? `avatar--${tamano}` : ''}" style="background:linear-gradient(135deg, ${VP.utils.colorDe(nombre)}, ${VP.utils.colorDe(nombre + 'x')})">${escapeHtml(VP.utils.iniciales(nombre))}</span>`;
  }

  function kpi({ etiqueta, valor, pie = '', tono = '', icono = '' }) {
    return `
      <div class="kpi ${tono ? `kpi--${tono}` : ''}">
        <div class="kpi__label">${icono ? icon(icono, 13) + ' ' : ''}${escapeHtml(etiqueta)}</div>
        <div class="kpi__value">${valor}</div>
        ${pie ? `<div class="kpi__foot">${pie}</div>` : ''}
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Tablas                                                              */
  /* ------------------------------------------------------------------ */

  /**
   * @param {Array} columnas [{ clave, titulo, clase, ordenable, render(fila) }]
   * @param {Array} filas
   */
  function tabla(columnas, filas, opciones = {}) {
    const { vacioTitulo = 'Sin registros', vacioTexto = '', vacioIcono = 'documento', pie = '', orden = {}, alOrdenar = '' } = opciones;

    if (!filas || !filas.length) {
      return vacio({ icono: vacioIcono, titulo: vacioTitulo, texto: vacioTexto });
    }

    const encabezados = columnas
      .map((col) => {
        const clases = [col.num ? 'num' : '', col.clase || '', col.ordenable ? 'sortable' : ''].filter(Boolean).join(' ');
        const marca = col.ordenable && orden.clave === col.clave
          ? `<span class="orden">${orden.dir === 'asc' ? '▲' : '▼'}</span>`
          : '';
        return `<th class="${clases}" ${col.ordenable ? `data-ordenar="${col.clave}"` : ''}>${escapeHtml(col.titulo)}${marca}</th>`;
      })
      .join('');

    const cuerpo = filas
      .map((fila, indice) => {
        const celdas = columnas
          .map((col) => {
            const contenido = col.render ? col.render(fila, indice) : escapeHtml(fila[col.clave]);
            const clases = [col.num ? 'num' : '', col.clase || ''].filter(Boolean).join(' ');
            return `<td class="${clases}">${contenido}</td>`;
          })
          .join('');
        const atributos = opciones.filaAtributos ? opciones.filaAtributos(fila) : '';
        return `<tr ${atributos}>${celdas}</tr>`;
      })
      .join('');

    return `
      <div class="table-wrap">
        <table class="data" ${alOrdenar ? 'data-ordenable="1"' : ''}>
          <thead><tr>${encabezados}</tr></thead>
          <tbody>${cuerpo}</tbody>
          ${pie ? `<tfoot>${pie}</tfoot>` : ''}
        </table>
      </div>`;
  }

  function paginacion({ total, page, pageSize, alCambiar }) {
    const paginas = Math.max(1, Math.ceil(total / pageSize));
    if (total === 0) return '';
    const inicio = (page - 1) * pageSize + 1;
    const fin = Math.min(total, page * pageSize);

    const botones = [];
    const agregar = (numero) => {
      botones.push(`<button type="button" data-pagina="${numero}" class="${numero === page ? 'is-active' : ''}">${numero}</button>`);
    };

    let desde = Math.max(1, page - 2);
    const hasta = Math.min(paginas, desde + 4);
    desde = Math.max(1, hasta - 4);
    for (let i = desde; i <= hasta; i += 1) agregar(i);

    return `
      <div class="pagination">
        <span>Mostrando <strong>${inicio}-${fin}</strong> de <strong>${total}</strong></span>
        <div class="pagination__pages">
          <button type="button" data-pagina="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('chevronIzq', 14)}</button>
          ${botones.join('')}
          <button type="button" data-pagina="${page + 1}" ${page >= paginas ? 'disabled' : ''}>${icon('chevronDer', 14)}</button>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Formularios                                                         */
  /* ------------------------------------------------------------------ */

  /** Lee los campos [name] de un contenedor. */
  function leerFormulario(raiz) {
    const datos = {};
    $$('[name]', raiz).forEach((campo) => {
      const nombre = campo.getAttribute('name');
      if (campo.type === 'checkbox') datos[nombre] = campo.checked;
      else if (campo.type === 'number') datos[nombre] = campo.value === '' ? null : Number(campo.value);
      else datos[nombre] = campo.value;
    });
    return datos;
  }

  /** Vuelca un objeto en los campos [name] de un contenedor. */
  function escribirFormulario(raiz, datos) {
    $$('[name]', raiz).forEach((campo) => {
      const nombre = campo.getAttribute('name');
      if (!(nombre in datos)) return;
      const valor = datos[nombre];
      if (campo.type === 'checkbox') campo.checked = Boolean(valor);
      else campo.value = valor === null || valor === undefined ? '' : valor;
    });
  }

  function marcarInvalido(raiz, nombre, mensaje) {
    const campo = $(`[name="${nombre}"]`, raiz);
    if (campo) campo.classList.add('is-invalid');
    const error = el(`<div class="error" data-error="${nombre}">${escapeHtml(mensaje)}</div>`);
    if (campo && campo.parentElement) campo.parentElement.appendChild(error);
  }

  function limpiarInvalidos(raiz) {
    $$('.is-invalid', raiz).forEach((n) => n.classList.remove('is-invalid'));
    $$('[data-error]', raiz).forEach((n) => n.remove());
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades de tabla / exportacion                                   */
  /* ------------------------------------------------------------------ */

  /**
   * Construye el payload de una exportacion a CSV o informe imprimible.
   */
  function filasParaExportar(columnas, filas) {
    return filas.map((fila) => columnas.map((col) => (col.valor ? col.valor(fila) : fila[col.clave])));
  }

  VP.ui = {
    toast, aviso, modal, confirmar, pedirTexto,
    cargando, vacio, pista, estado, delta, avatar, kpi, tabla, paginacion,
    leerFormulario, escribirFormulario, marcarInvalido, limpiarInvalidos,
    filasParaExportar,
  };
})();
