/* ==========================================================================
   Fluxo · Ajustes, respaldos y datos
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatFecha, formatNumero } = VP.utils;
  const { $, $$ } = VP.dom;
  const ui = VP.ui;

  const SECCIONES = [
    { clave: 'empresa', titulo: 'Empresa', icono: 'escudo' },
    { clave: 'documentos', titulo: 'Documentos', icono: 'documento' },
    { clave: 'ventas', titulo: 'Ventas e impuestos', icono: 'dinero' },
    { clave: 'datos', titulo: 'Respaldos y datos', icono: 'carpeta' },
    { clave: 'acerca', titulo: 'Acerca de', icono: 'info' },
  ];

  let seccion = 'empresa';

  async function montar(raiz, acciones) {
    const [cfg, info] = await Promise.all([VP.api.config(), VP.api.info()]);

    acciones.innerHTML = `
      <button class="btn" type="button" data-accion="respaldar">${icon('carpeta', 16)} Respaldar ahora</button>
      <button class="btn btn--primary" type="button" data-accion="guardar">${icon('ok', 16)} Guardar cambios</button>`;

    raiz.innerHTML = `
      <div class="grid" style="grid-template-columns:230px 1fr;align-items:start;gap:18px">
        <div class="card">
          <div class="card__body" style="padding:9px">
            <div class="stack" style="gap:2px">
              ${SECCIONES.map(
                (s) => `<button class="nav-item ${s.clave === seccion ? 'is-active' : ''}" type="button" data-seccion="${s.clave}" style="color:${s.clave === seccion ? '' : 'var(--text-2)'};background:${s.clave === seccion ? '' : 'transparent'}">
                  ${icon(s.icono, 17)}<span>${escapeHtml(s.titulo)}</span>
                </button>`,
              ).join('')}
            </div>
          </div>
        </div>
        <div data-panel></div>
      </div>`;

    $$('[data-seccion]', raiz).forEach((boton) => {
      boton.addEventListener('click', () => {
        seccion = boton.getAttribute('data-seccion');
        montar(raiz, acciones);
      });
    });

    pintarPanel($('[data-panel]', raiz), cfg, info, raiz, acciones);

    $('[data-accion="guardar"]', acciones).addEventListener('click', async () => {
      await guardar(raiz, acciones);
    });
    $('[data-accion="respaldar"]', acciones).addEventListener('click', respaldar);
  }

  /* ------------------------------------------------------------------ */
  /* Paneles                                                             */
  /* ------------------------------------------------------------------ */

  function pintarPanel(panel, cfg, info, raiz, acciones) {
    if (seccion === 'empresa') return panelEmpresa(panel, cfg, raiz, acciones, info);
    if (seccion === 'documentos') return panelDocumentos(panel, cfg, raiz, acciones, info);
    if (seccion === 'ventas') return panelVentas(panel, cfg, raiz, acciones, info);
    if (seccion === 'datos') return panelDatos(panel, cfg, info, raiz, acciones);
    return panelAcerca(panel, info);
  }

  function panelEmpresa(panel, cfg, raiz, acciones, info) {
    panel.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="card__head"><div><h3>Datos de la empresa</h3><p>Aparecen en el encabezado de cotizaciones y facturas</p></div></div>
          <div class="card__body">
            <div class="stack" style="gap:16px">
              <div class="logo-drop">
                ${cfg.empresa_logo
                  ? `<img src="${escapeHtml(cfg.empresa_logo)}" alt="Logo" />`
                  : `<div class="logo-drop__placeholder">Sin logo</div>`}
                <div style="flex:1">
                  <div style="font-weight:600;font-size:13px;margin-bottom:4px">Logotipo del documento</div>
                  <div class="text-muted" style="font-size:12px;margin-bottom:9px">PNG o JPG. Se ajusta automaticamente a 400 px de ancho.</div>
                  <div class="row" style="gap:8px">
                    <label class="btn btn--sm" style="cursor:pointer">
                      ${icon('subir', 15)} Seleccionar archivo
                      <input type="file" accept="image/png,image/jpeg,image/webp" style="display:none" data-logo />
                    </label>
                    ${cfg.empresa_logo ? `<button class="btn btn--sm btn--ghost text-danger" type="button" data-quitar-logo>Quitar logo</button>` : ''}
                  </div>
                </div>
              </div>

              <div class="form-grid">
                <div class="field span-2">
                  <label>Razon social</label>
                  <input class="input" name="empresa_nombre" value="${escapeHtml(cfg.empresa_nombre || '')}" />
                </div>
                <div class="field">
                  <label>NIT</label>
                  <input class="input" name="empresa_nit" value="${escapeHtml(cfg.empresa_nit || '')}" />
                </div>
                <div class="field">
                  <label>Digito de verificacion</label>
                  <input class="input" name="empresa_dv" maxlength="2" value="${escapeHtml(cfg.empresa_dv || '')}" />
                </div>
                <div class="field span-2">
                  <label>Direccion</label>
                  <input class="input" name="empresa_direccion" value="${escapeHtml(cfg.empresa_direccion || '')}" />
                </div>
                <div class="field">
                  <label>Ciudad</label>
                  <input class="input" name="empresa_ciudad" value="${escapeHtml(cfg.empresa_ciudad || '')}" />
                </div>
                <div class="field">
                  <label>Departamento</label>
                  <input class="input" name="empresa_departamento" value="${escapeHtml(cfg.empresa_departamento || '')}" />
                </div>
                <div class="field">
                  <label>Telefono</label>
                  <input class="input" name="empresa_telefono" value="${escapeHtml(cfg.empresa_telefono || '')}" />
                </div>
                <div class="field">
                  <label>Correo</label>
                  <input class="input" name="empresa_email" value="${escapeHtml(cfg.empresa_email || '')}" />
                </div>
                <div class="field">
                  <label>Sitio web</label>
                  <input class="input" name="empresa_web" value="${escapeHtml(cfg.empresa_web || '')}" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const entrada = $('[data-logo]', panel);
    entrada.addEventListener('change', async () => {
      const archivo = entrada.files && entrada.files[0];
      if (!archivo) return;
      try {
        const dataUrl = await redimensionarImagen(archivo, 400);
        await VP.api.guardarConfig({ empresa_logo: dataUrl });
        VP.state.config = await VP.api.config();
        ui.aviso.exito('Logotipo actualizado.');
        montar(raiz, acciones);
      } catch (error) {
        ui.aviso.error(error.message);
      }
    });

    $('[data-quitar-logo]', panel)?.addEventListener('click', async () => {
      await VP.api.guardarConfig({ empresa_logo: '' });
      VP.state.config = await VP.api.config();
      ui.aviso.exito('Logotipo eliminado.');
      montar(raiz, acciones);
    });
  }

  function panelDocumentos(panel, cfg) {
    panel.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="card__head"><div><h3>Numeracion de documentos</h3><p>Los consecutivos se generan por prefijo y ano</p></div></div>
          <div class="card__body">
            <div class="form-grid">
              <div class="field">
                <label>Prefijo de cotizaciones</label>
                <input class="input" name="cot_prefijo" value="${escapeHtml(cfg.cot_prefijo || 'COT')}" />
                <span class="hint">Ejemplo: ${escapeHtml(cfg.cot_prefijo || 'COT')}-${new Date().getFullYear()}-0001</span>
              </div>
              <div class="field">
                <label>Prefijo de facturas</label>
                <input class="input" name="fac_prefijo" value="${escapeHtml(cfg.fac_prefijo || 'FAC')}" />
                <span class="hint">Ejemplo: ${escapeHtml(cfg.fac_prefijo || 'FAC')}-${new Date().getFullYear()}-0001</span>
              </div>
              <div class="field">
                <label>Validez de cotizaciones (dias)</label>
                <input class="input" type="number" name="cot_validez_dias" min="1" step="1" value="${Number(cfg.cot_validez_dias) || 30}" />
              </div>
              <div class="field">
                <label>Dias de credito por defecto</label>
                <input class="input" type="number" name="fac_dias_credito" min="0" step="1" value="${Number(cfg.fac_dias_credito) || 30}" />
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><div><h3>Textos de los documentos</h3><p>Se imprimen en el pie de cada PDF</p></div></div>
          <div class="card__body">
            <div class="form-grid">
              <div class="field span-2">
                <label>Leyenda legal</label>
                <textarea class="textarea" name="leyenda_documento" rows="2">${escapeHtml(cfg.leyenda_documento || '')}</textarea>
                <span class="hint">Importante: si no tienes habilitacion de la DIAN, manten esta leyenda para no presentar el documento como factura electronica.</span>
              </div>
              <div class="field span-2">
                <label>Mensaje de cierre</label>
                <input class="input" name="pie_documento" value="${escapeHtml(cfg.pie_documento || '')}" />
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function panelVentas(panel, cfg) {
    panel.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="card__head"><div><h3>Moneda y formato</h3><p>Se aplica a toda la aplicacion</p></div></div>
          <div class="card__body">
            <div class="form-grid">
              <div class="field">
                <label>Moneda</label>
                <input class="input" name="moneda" value="${escapeHtml(cfg.moneda || 'COP')}" />
              </div>
              <div class="field">
                <label>Simbolo</label>
                <input class="input" name="simbolo" value="${escapeHtml(cfg.simbolo || '$')}" maxlength="4" />
              </div>
              <div class="field">
                <label>Decimales</label>
                <select class="select" name="decimales">
                  ${[0, 2].map((d) => `<option value="${d}" ${Number(cfg.decimales) === d ? 'selected' : ''}>${d} ${d === 0 ? '(recomendado para COP)' : ''}</option>`).join('')}
                </select>
              </div>
              <div class="field">
                <label>IVA por defecto (%)</label>
                <select class="select" name="iva_default">
                  ${[19, 5, 0].map((v) => `<option value="${v}" ${Number(cfg.iva_default) === v ? 'selected' : ''}>${v}%</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><div><h3>Metas y alertas</h3><p>Impulsan los indicadores del panel de crecimiento</p></div></div>
          <div class="card__body">
            <div class="form-grid">
              <div class="field">
                <label>Meta anual de facturacion</label>
                <input class="input" type="number" name="meta_anual" min="0" step="1000000" value="${Number(cfg.meta_anual) || 0}" />
                <span class="hint">Actual: ${formatMoneda(Number(cfg.meta_anual) || 0)}</span>
              </div>
              <div class="field">
                <label>Alerta de cotizaciones sin movimiento (dias)</label>
                <input class="input" type="number" name="cot_alerta_dias" min="1" step="1" value="${Number(cfg.cot_alerta_dias) || 15}" />
              </div>
              <div class="field">
                <label>Alerta de cartera (dias)</label>
                <input class="input" type="number" name="alerta_cartera_dias" min="1" step="1" value="${Number(cfg.alerta_cartera_dias) || 30}" />
              </div>
              <div class="field" style="justify-content:flex-end">
                <label class="switch">
                  <input type="checkbox" name="backup_automatico" ${cfg.backup_automatico === '1' ? 'checked' : ''} />
                  <span class="switch__track"></span>
                  <span class="switch__label">Respaldo automatico al cerrar</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  function panelDatos(panel, cfg, info, raiz, acciones) {
    const respaldos = info.respaldos || [];
    panel.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="card__head"><div><h3>Base de datos</h3><p>Todo se guarda localmente en tu equipo</p></div></div>
          <div class="card__body">
            <div class="info-list">
              <div class="info-list__row"><span>Ubicacion</span><span class="mono" style="font-size:12px">${escapeHtml(info.datos)}</span></div>
              <div class="info-list__row"><span>Tamano</span><span>${formatNumero((info.bytes || 0) / 1024, { decimales: 1 })} KB</span></div>
            </div>
            <div class="row row--wrap" style="gap:9px;margin-top:16px">
              <button class="btn" type="button" data-accion-datos="respaldar">${icon('carpeta', 16)} Crear respaldo</button>
              <button class="btn" type="button" data-accion-datos="restaurar">${icon('subir', 16)} Restaurar respaldo</button>
              <button class="btn" type="button" data-accion-datos="abrir">${icon('carpeta', 16)} Abrir carpeta de respaldos</button>
            </div>
          </div>
        </div>

        ${respaldos.length
          ? `<div class="card">
               <div class="card__head"><h3>Respaldos recientes</h3><p class="text-muted" style="font-size:12px">Se conservan los ultimos 15</p></div>
               <div class="quick-list">
                 ${respaldos
                   .slice(0, 8)
                   .map(
                     (r) => `<div class="quick-list__item" style="cursor:default">
                       ${icon('escudo', 17)}
                       <div><div class="mono" style="font-size:12px">${escapeHtml(r.archivo)}</div><div class="meta">${escapeHtml(formatFecha(r.fecha.slice(0, 10), 'largo'))}</div></div>
                     </div>`,
                   )
                   .join('')}
               </div>
             </div>`
          : ''}

        <div class="card">
          <div class="card__head"><div><h3>Datos de demostracion</h3><p>Util para probar el sistema o capacitar al equipo</p></div></div>
          <div class="card__body">
            ${ui.pista('Cargar los datos de demostracion reemplaza por completo la informacion actual. Antes de hacerlo se guarda un respaldo automatico.')}
            <div class="row row--wrap" style="gap:9px;margin-top:14px">
              <button class="btn" type="button" data-accion-datos="demo">${icon('subir', 16)} Cargar datos de demostracion</button>
              <button class="btn btn--ghost text-danger" type="button" data-accion-datos="borrar">${icon('basura', 16)} Borrar toda la informacion</button>
            </div>
          </div>
        </div>
      </div>`;

    $$('[data-accion-datos]', panel).forEach((boton) => {
      boton.addEventListener('click', async () => {
        const accion = boton.getAttribute('data-accion-datos');
        if (accion === 'respaldar') return respaldar();
        if (accion === 'restaurar') return restaurar();
        if (accion === 'abrir') { await VP.api.abrirRespaldos(); return; }
        if (accion === 'demo') {
          const ok = await ui.confirmar({
            titulo: 'Cargar datos de demostracion',
            mensaje: 'Se reemplazara toda la informacion actual por 15 meses de datos de ejemplo.',
            detalle: 'Se creara un respaldo automatico antes de continuar.',
            textoOk: 'Cargar datos',
          });
          if (!ok) return;
          await VP.api.respaldar && (await VP.api.respaldar());
          const resumen = await VP.api.cargarDemo({ meses: 15, reiniciar: true });
          VP.documentoCache.limpiar();
          ui.aviso.exito(`${resumen.cotizaciones} cotizaciones y ${resumen.facturas} facturas creadas.`, 'Datos cargados');
          VP.app.ir('panel');
          return;
        }
        if (accion === 'borrar') {
          const texto = await ui.pedirTexto({
            titulo: 'Borrar toda la informacion',
            etiqueta: 'Escribe BORRAR para confirmar',
            valor: '',
            textoOk: 'Borrar todo',
          });
          if (texto !== 'BORRAR') {
            if (texto !== null) ui.aviso.aviso('Confirmacion incorrecta: la informacion no se borro.');
            return;
          }
          await VP.api.limpiarDemo();
          VP.documentoCache.limpiar();
          ui.aviso.exito('La base de datos quedo vacia.', 'Listo');
          VP.app.ir('panel');
        }
      });
    });
  }

  function panelAcerca(panel, info) {
    panel.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="card__body" style="text-align:center;padding:30px">
            <div style="display:flex;justify-content:center;color:var(--primary);margin-bottom:10px">${icon('panel', 46)}</div>
            <h2 style="font-size:19px">Fluxo ${escapeHtml(info.version)}</h2>
            <p class="text-muted" style="margin-top:8px;font-size:13px;line-height:1.7;max-width:520px;margin-left:auto;margin-right:auto">
              Sistema de gestion comercial con cotizaciones, facturacion interna, clientes,
              asesores y panel de crecimiento. Funciona sin conexion a internet y guarda
              toda la informacion en tu propio equipo.
            </p>
            <div class="grid grid--3" style="gap:12px;margin-top:22px;text-align:left">
              <div class="stat-mini"><span>Electron</span><strong>${escapeHtml(info.electron)}</strong></div>
              <div class="stat-mini"><span>Chromium</span><strong>${escapeHtml(info.chrome)}</strong></div>
              <div class="stat-mini"><span>Node.js</span><strong>${escapeHtml(info.node)}</strong></div>
            </div>
            <div class="info-list" style="margin-top:22px;text-align:left">
              <div class="info-list__row"><span>Plataforma</span><span class="mono">${escapeHtml(info.plataforma)}</span></div>
              <div class="info-list__row"><span>Base de datos</span><span class="mono" style="font-size:12px">${escapeHtml(info.datos)}</span></div>
            </div>
          </div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Acciones                                                            */
  /* ------------------------------------------------------------------ */

  async function guardar(raiz, acciones) {
    const panel = $('[data-panel]', raiz);

    const campos = {
      empresa_nombre: '[name="empresa_nombre"]',
      empresa_nit: '[name="empresa_nit"]',
      empresa_dv: '[name="empresa_dv"]',
      empresa_direccion: '[name="empresa_direccion"]',
      empresa_ciudad: '[name="empresa_ciudad"]',
      empresa_departamento: '[name="empresa_departamento"]',
      empresa_telefono: '[name="empresa_telefono"]',
      empresa_email: '[name="empresa_email"]',
      empresa_web: '[name="empresa_web"]',
      cot_prefijo: '[name="cot_prefijo"]',
      fac_prefijo: '[name="fac_prefijo"]',
      cot_validez_dias: '[name="cot_validez_dias"]',
      fac_dias_credito: '[name="fac_dias_credito"]',
      leyenda_documento: '[name="leyenda_documento"]',
      pie_documento: '[name="pie_documento"]',
      moneda: '[name="moneda"]',
      simbolo: '[name="simbolo"]',
      decimales: '[name="decimales"]',
      iva_default: '[name="iva_default"]',
      meta_anual: '[name="meta_anual"]',
      cot_alerta_dias: '[name="cot_alerta_dias"]',
      alerta_cartera_dias: '[name="alerta_cartera_dias"]',
      backup_automatico: '[name="backup_automatico"]',
    };

    const patch = {};
    for (const [clave, selector] of Object.entries(campos)) {
      const campo = $(selector, panel);
      if (!campo) continue;
      if (campo.type === 'checkbox') patch[clave] = campo.checked ? '1' : '0';
      else if (campo.value !== undefined && campo.value !== '') patch[clave] = campo.value;
    }

    if (!Object.keys(patch).length) {
      ui.aviso.info('No hay cambios que guardar en esta seccion.');
      return;
    }

    try {
      await VP.api.guardarConfig(patch);
      VP.state.config = await VP.api.config();
      VP.documentoCache.limpiar();
      ui.aviso.exito('Configuracion guardada.', 'Listo');
      montar(raiz, acciones);
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  async function respaldar() {
    try {
      const r = await VP.api.respaldar();
      if (r && !r.cancelado) ui.aviso.exito(`Respaldo guardado en ${r.ruta}`, 'Respaldo creado');
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  async function restaurar() {
    const ok = await ui.confirmar({
      titulo: 'Restaurar respaldo',
      mensaje: 'Se reemplazaran todos los datos actuales por los del archivo seleccionado.',
      detalle: 'La aplicacion se reiniciara automaticamente y guardara una copia del estado actual.',
      textoOk: 'Seleccionar archivo',
    });
    if (!ok) return;
    try {
      await VP.api.restaurar();
    } catch (error) {
      ui.aviso.error(error.message);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Redimension de imagenes (sin librerias)                             */
  /* ------------------------------------------------------------------ */

  function redimensionarImagen(archivo, anchoMax) {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onerror = () => reject(new Error('No se pudo leer el archivo seleccionado.'));
      lector.onload = () => {
        const imagen = new Image();
        imagen.onerror = () => reject(new Error('El archivo no parece ser una imagen valida.'));
        imagen.onload = () => {
          const escala = Math.min(1, anchoMax / imagen.width);
          const lienzo = document.createElement('canvas');
          lienzo.width = Math.round(imagen.width * escala);
          lienzo.height = Math.round(imagen.height * escala);
          const ctx = lienzo.getContext('2d');
          ctx.drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
          resolve(lienzo.toDataURL('image/png'));
        };
        imagen.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  VP.views.ajustes = {
    titulo: 'Ajustes',
    subtitulo: 'Empresa, documentos, respaldos y datos',
    montar,
  };
})();
