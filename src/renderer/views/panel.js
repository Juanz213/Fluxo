/* ==========================================================================
   Fluxo · Panel de crecimiento
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, formatFecha, formatPorcentaje, formatCompacto, recortar } = VP.utils;
  const { $, $$, el } = VP.dom;
  const ui = VP.ui;
  const charts = VP.charts;

  let estado = { anio: null, vista: 'facturacion' };
  let datos = null;

  async function cargar() {
    datos = await VP.api.panel({ anio: estado.anio || undefined, meses: 12 });
    estado.anio = datos.anio;
    return datos;
  }

  /* ------------------------------------------------------------------ */
  /* Bloque: sin datos                                                   */
  /* ------------------------------------------------------------------ */

  function pantallaBienvenida(raiz, acciones) {
    acciones.innerHTML = '';
    raiz.innerHTML = `
      <div class="card" style="max-width:760px;margin:40px auto">
        <div class="card__body" style="padding:34px;text-align:center">
          <div style="display:flex;justify-content:center;margin-bottom:14px;color:var(--primary)">${icon('panel', 52)}</div>
          <h2 style="font-size:21px">Bienvenido a Fluxo</h2>
          <p class="text-muted" style="margin-top:9px;line-height:1.7;max-width:520px;margin-left:auto;margin-right:auto">
            Tu base de datos esta vacia. Puedes empezar a registrar clientes y cotizaciones desde cero,
            o cargar un conjunto de datos de demostracion con 15 meses de operacion comercial para
            explorar el panel de crecimiento, la cartera y el ranking de asesores.
          </p>
          <div class="row" style="justify-content:center;gap:11px;margin-top:22px">
            <button class="btn btn--primary" type="button" data-accion="demo">${icon('subir', 16)} Cargar datos de demostracion</button>
            <button class="btn" type="button" data-accion="empezar">${icon('clientes', 16)} Empezar desde cero</button>
          </div>
          <p class="text-muted" style="font-size:12px;margin-top:18px">
            Los datos de demostracion se pueden borrar en cualquier momento desde <strong>Ajustes</strong>.
          </p>
        </div>
      </div>`;

    $('[data-accion="demo"]', raiz).addEventListener('click', async (evento) => {
      const boton = evento.currentTarget;
      boton.disabled = true;
      boton.innerHTML = `${icon('refrescar', 16)} Generando informacion...`;
      try {
        const resumen = await VP.api.cargarDemo({ meses: 15, reiniciar: true });
        VP.documentoCache.limpiar();
        ui.aviso.exito(
          `${resumen.cotizaciones} cotizaciones, ${resumen.facturas} facturas y ${resumen.pagos} pagos.`,
          'Datos de demostracion cargados',
        );
        estado.anio = null;
        await montar(raiz, acciones);
      } catch (error) {
        ui.aviso.error(error.message);
        boton.disabled = false;
      }
    });

    $('[data-accion="empezar"]', raiz).addEventListener('click', () => {
      VP.app.ir('ajustes');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Bloques del panel                                                   */
  /* ------------------------------------------------------------------ */

  function kpis(k) {
    return `
      <div class="grid grid--kpi">
        ${ui.kpi({
          etiqueta: 'Facturado este mes',
          icono: 'factura',
          valor: formatMoneda(k.ventas_mes),
          pie: `${ui.delta(k.crecimiento_mes)} <span>vs mes anterior (${formatCompacto(k.ventas_mes_anterior)})</span>`,
        })}
        ${ui.kpi({
          etiqueta: `Facturado ${datos.anio} (acumulado)`,
          icono: 'tendencia',
          tono: 'success',
          valor: formatMoneda(k.ventas_anio),
          pie: `${ui.delta(k.crecimiento_anio)} <span>vs mismo periodo ${datos.anio - 1}</span>`,
        })}
        ${ui.kpi({
          etiqueta: 'Cotizado este mes',
          icono: 'cotizacion',
          tono: 'info',
          valor: formatMoneda(k.cotizado_mes),
          pie: `<span>${formatNumero(k.cotizaciones_mes, { decimales: 0 })} cotizaciones · acumulado ${formatCompacto(k.cotizado_anio)}</span>`,
        })}
        ${ui.kpi({
          etiqueta: 'Ticket promedio',
          icono: 'dinero',
          valor: formatMoneda(k.ticket_promedio),
          pie: `<span>${formatNumero(k.facturas_mes, { decimales: 0 })} facturas emitidas este mes</span>`,
        })}
        ${ui.kpi({
          etiqueta: 'Cartera por cobrar',
          icono: 'caja',
          tono: k.cartera_vencida > 0 ? 'danger' : 'success',
          valor: formatMoneda(k.cartera_total),
          pie: `<span class="${k.cartera_vencida > 0 ? 'text-danger' : 'text-success'}">${formatMoneda(k.cartera_vencida)} vencido</span>`,
        })}
        ${ui.kpi({
          etiqueta: 'Embudo abierto',
          icono: 'reloj',
          tono: 'warning',
          valor: formatNumero(k.cotizaciones_abiertas, { decimales: 0 }),
          pie: `<span>${formatMoneda(k.cotizaciones_abiertas_valor)} en negociacion · ${formatPorcentaje(datos.embudo.tasa_conversion)} conversion</span>`,
        })}
      </div>`;
  }

  function graficaPrincipal() {
    const serie = datos.serie;
    return `
      <div class="card">
        <div class="card__head">
          <div>
            <h3>Tendencia de ventas</h3>
            <p>Ultimos 12 meses · ${escapeHtml(VP.state.config.moneda || 'COP')}</p>
          </div>
          <div class="card__tools">
            <div class="seg" data-vista>
              <button type="button" data-vista-valor="facturacion" class="${estado.vista === 'facturacion' ? 'is-active' : ''}">Cotizado vs. Facturado</button>
              <button type="button" data-vista-valor="recaudo" class="${estado.vista === 'recaudo' ? 'is-active' : ''}">Recaudo</button>
              <button type="button" data-vista-valor="crecimiento" class="${estado.vista === 'crecimiento' ? 'is-active' : ''}">Crecimiento %</button>
            </div>
          </div>
        </div>
        <div class="card__body">
          <div data-grafica-principal></div>
          <div data-leyenda-principal></div>
        </div>
      </div>`;
  }

  function pintarGraficaPrincipal(contenedor) {
    const serie = datos.serie;
    const etiquetas = serie.map((s) => s.etiqueta);
    const nodo = $('[data-grafica-principal]', contenedor);
    const leyendaNodo = $('[data-leyenda-principal]', contenedor);

    if (estado.vista === 'recaudo') {
      const series = [
        { nombre: 'Facturado', color: '#2563eb', valores: serie.map((s) => s.facturado) },
        { nombre: 'Recaudado', color: '#059669', valores: serie.map((s) => s.cobrado) },
      ];
      charts.linea(nodo, { etiquetas, series, formato: 'moneda' });
      leyendaNodo.innerHTML = charts.leyenda(series);
      return;
    }

    if (estado.vista === 'crecimiento') {
      const variaciones = serie.map((s, i) => {
        if (i === 0) return 0;
        const anterior = serie[i - 1].facturado;
        if (!anterior) return s.facturado > 0 ? 100 : 0;
        return Number((((s.facturado - anterior) / anterior) * 100).toFixed(1));
      });
      const series = [{ nombre: 'Variacion mensual', color: '#7c3aed', valores: variaciones, area: false }];
      charts.linea(nodo, { etiquetas, series, formato: 'numero' });
      leyendaNodo.innerHTML = `${charts.leyenda(series)}<span style="margin-left:auto;font-size:12px;color:var(--muted)">Variacion porcentual de la facturacion respecto al mes anterior</span>`;
      return;
    }

    const series = [
      { nombre: 'Cotizado', color: '#93c5fd', valores: serie.map((s) => s.cotizado) },
      { nombre: 'Facturado', color: '#2563eb', valores: serie.map((s) => s.facturado) },
    ];
    charts.barras(nodo, { etiquetas, series, formato: 'moneda' });
    leyendaNodo.innerHTML = charts.leyenda(series);
  }

  function bloqueCartera() {
    const cartera = datos.cartera;
    const colores = ['#059669', '#0891b2', '#d97706', '#ea580c', '#dc2626'];
    const buckets = cartera.buckets.map((b, i) => ({ nombre: b.etiqueta, valor: b.monto, color: colores[i] }));
    const clientes = cartera.porCliente || [];

    return `
      <div class="card">
        <div class="card__head">
          <div>
            <h3>Cartera por cobrar</h3>
            <p>Antiguedad de saldos y concentracion por cliente</p>
          </div>
          <div class="card__tools">
            <button class="btn btn--sm" type="button" data-accion="ver-facturas">${icon('ver', 15)} Ver facturas</button>
          </div>
        </div>
        <div class="card__body">
          <div class="grid grid--3" style="gap:12px;margin-bottom:16px">
            <div class="stat-mini"><span>Saldo total</span><strong>${formatMoneda(cartera.total)}</strong></div>
            <div class="stat-mini"><span>Vencido</span><strong class="text-danger">${formatMoneda(cartera.vencido)}</strong></div>
            <div class="stat-mini"><span>Por vencer</span><strong class="text-success">${formatMoneda(cartera.corriente)}</strong></div>
          </div>
          <div data-grafica-cartera></div>
        </div>
        ${clientes.length
          ? `<div class="card__head" style="border-top:1px solid var(--border-2);border-bottom:0"><h3 style="font-size:13px">Mayores saldos por cliente</h3></div>
             <div class="quick-list">
               ${clientes
                 .slice(0, 6)
                 .map(
                   (c) => `
                 <div class="quick-list__item" data-cliente="${c.cliente_id}">
                   ${ui.avatar(c.cliente_nombre, 'sm')}
                   <div>
                     <div>${escapeHtml(recortar(c.cliente_nombre, 34))}</div>
                     <div class="meta">${c.facturas} factura${c.facturas === 1 ? '' : 's'}${c.dias_max > 0 ? ` · ${c.dias_max} dias de mora` : ' · al dia'}</div>
                   </div>
                   <div class="val ${c.dias_max > 0 ? 'text-danger' : ''}">${formatMoneda(c.saldo)}</div>
                 </div>`,
                 )
                 .join('')}
             </div>`
          : ''}
      </div>`;
  }

  function bloqueAsesores() {
    const ranking = datos.ranking.filter((r) => r.facturado > 0).slice(0, 8);
    return `
      <div class="card">
        <div class="card__head">
          <div>
            <h3>Ranking de asesores</h3>
            <p>Facturacion acumulada ${datos.anio}</p>
          </div>
          <div class="card__tools">
            <button class="btn btn--sm" type="button" data-accion="ver-asesores">${icon('ver', 15)} Ver detalle</button>
          </div>
        </div>
        <div class="card__body" data-ranking></div>
      </div>`;
  }

  function bloqueAlertas() {
    const { alertas } = datos;
    const total = alertas.stock.length + alertas.cotizaciones_estancadas.length + alertas.facturas_vencidas.length;

    if (!total) {
      return `
        <div class="card">
          <div class="card__head"><h3>Alertas</h3></div>
          <div class="card__body">
            <div class="row" style="gap:10px;color:var(--success)">${icon('ok', 20)}<span>Todo al dia: sin cartera vencida, sin cotizaciones estancadas y sin faltantes de inventario.</span></div>
          </div>
        </div>`;
    }

    const filasStock = alertas.stock
      .map(
        (p) => `
        <div class="alert-row alert-row--warning">
          ${icon('productos', 17, { clase: 'ico' })}
          <div>${escapeHtml(recortar(p.nombre, 40))}<div class="text-muted" style="font-size:11.5px">${escapeHtml(p.codigo)} · minimo ${formatNumero(p.stock_minimo)} ${escapeHtml(p.unidad)}</div></div>
          <span class="val">${formatNumero(p.stock)} ${escapeHtml(p.unidad)}</span>
        </div>`,
      )
      .join('');

    const filasVencidas = alertas.facturas_vencidas
      .map(
        (f) => `
        <div class="alert-row alert-row--danger" data-factura="${f.id}">
          ${icon('alerta', 17, { clase: 'ico' })}
          <div>${escapeHtml(f.numero)} · ${escapeHtml(recortar(f.cliente_nombre, 28))}<div class="text-muted" style="font-size:11.5px">Vencio hace ${f.dias_vencida} dias</div></div>
          <span class="val">${formatMoneda(f.saldo)}</span>
        </div>`,
      )
      .join('');

    const filasCot = alertas.cotizaciones_estancadas
      .map(
        (c) => `
        <div class="alert-row" data-cotizacion="${c.id}">
          ${icon('reloj', 17, { clase: 'ico' })}
          <div>${escapeHtml(c.numero)} · ${escapeHtml(recortar(c.cliente_nombre, 28))}<div class="text-muted" style="font-size:11.5px">Sin movimiento desde ${formatFecha(c.fecha)}</div></div>
          <span class="val">${formatMoneda(c.total)}</span>
        </div>`,
      )
      .join('');

    return `
      <div class="card">
        <div class="card__head">
          <div>
            <h3>Necesitan tu atencion</h3>
            <p>${total} punto${total === 1 ? '' : 's'} por revisar</p>
          </div>
        </div>
        <div class="card__body">
          ${filasVencidas}
          ${filasCot}
          ${filasStock}
        </div>
      </div>`;
  }

  function bloqueProductosClientes() {
    const productos = datos.top_productos.slice(0, 6);
    const clientes = datos.top_clientes.slice(0, 6);
    return `
      <div class="grid grid--2">
        <div class="card">
          <div class="card__head"><h3>Productos mas vendidos</h3><p class="text-muted" style="font-size:12px">Por importe facturado ${datos.anio}</p></div>
          <div class="card__body" data-top-productos></div>
        </div>
        <div class="card">
          <div class="card__head"><h3>Mejores clientes</h3><p class="text-muted" style="font-size:12px">Por importe facturado ${datos.anio}</p></div>
          <div class="card__body" data-top-clientes></div>
        </div>
      </div>`;
  }

  function bloqueEmbudo() {
    const e = datos.embudo;
    const pasos = [
      { nombre: 'Borrador', valor: e.Borrador.total, cantidad: e.Borrador.cantidad, color: '#94a3b8' },
      { nombre: 'Enviada', valor: e.Enviada.total, cantidad: e.Enviada.cantidad, color: '#60a5fa' },
      { nombre: 'Aprobada', valor: e.Aprobada.total, cantidad: e.Aprobada.cantidad, color: '#34d399' },
      { nombre: 'Convertida', valor: e.Convertida.total, cantidad: e.Convertida.cantidad, color: '#059669' },
    ];

    return `
      <div class="card">
        <div class="card__head">
          <div><h3>Embudo de cotizaciones</h3><p>Acumulado ${datos.anio}</p></div>
          <div class="card__tools">
            <span class="chip">${formatPorcentaje(e.tasa_conversion)} conversion</span>
          </div>
        </div>
        <div class="card__body">
          <div class="grid grid--3" style="gap:12px;margin-bottom:18px">
            <div class="stat-mini"><span>Cotizaciones</span><strong>${formatNumero(e.total_cotizaciones, { decimales: 0 })}</strong></div>
            <div class="stat-mini"><span>Ganadas</span><strong class="text-success">${formatNumero(e.ganadas, { decimales: 0 })}</strong></div>
            <div class="stat-mini"><span>Perdidas</span><strong class="text-danger">${formatNumero(e.perdidas, { decimales: 0 })}</strong></div>
          </div>
          <div data-grafica-embudo></div>
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Montaje                                                             */
  /* ------------------------------------------------------------------ */

  async function montar(raiz, acciones) {
    raiz.innerHTML = ui.cargando('Calculando indicadores...');

    try {
      await cargar();
    } catch (error) {
      raiz.innerHTML = ui.vacio({ icono: 'alerta', titulo: 'No se pudo cargar el panel', texto: error.message });
      return;
    }

    if (!datos.serie.some((s) => s.facturado || s.cotizado) && datos.kpis.clientes_activos === 0) {
      pantallaBienvenida(raiz, acciones);
      return;
    }

    const anios = Array.from(new Set([datos.anio, ...(datos.desempenadas.anios || []), new Date().getFullYear()])).sort((a, b) => b - a);

    acciones.innerHTML = `
      <div class="search">
        ${icon('calendario')}
        <label class="hidden" for="panel-anio">Anio</label>
      </div>
      <select class="select" id="panel-anio" style="width:110px">
        ${anios.map((a) => `<option value="${a}" ${a === datos.anio ? 'selected' : ''}>${a}</option>`).join('')}
      </select>
      <button class="btn" type="button" data-accion="exportar">${icon('descargar', 16)} Exportar</button>
      <button class="btn btn--primary" type="button" data-accion="nueva-cotizacion">${icon('mas', 16)} Nueva cotizacion</button>`;

    raiz.innerHTML = `
      <div class="stack">
        ${kpis(datos.kpis)}
        ${graficaPrincipal()}
        <div class="grid grid--2">
          ${bloqueCartera()}
          ${bloqueAsesores()}
        </div>
        ${bloqueEmbudo()}
        ${bloqueProductosClientes()}
        ${bloqueAlertas()}
      </div>`;

    /* Graficas */
    pintarGraficaPrincipal(raiz);

    charts.dona($('[data-grafica-cartera]', raiz), {
      datos: datos.cartera.buckets.map((b, i) => ({
        nombre: b.etiqueta,
        valor: b.monto,
        color: ['#059669', '#0891b2', '#d97706', '#ea580c', '#dc2626'][i],
      })),
      formato: 'moneda',
      centro: { titulo: 'Total', valor: formatCompacto(datos.cartera.total) },
    });

    charts.barrasHorizontales($('[data-ranking]', raiz), {
      datos: datos.ranking.filter((r) => r.facturado > 0).slice(0, 8).map((r) => ({ nombre: `${r.nombre} · ${r.zona || ''}`, valor: r.facturado, avatar: true })),
      formato: 'moneda',
    });

    charts.barrasHorizontales($('[data-top-productos]', raiz), {
      datos: datos.top_productos.slice(0, 6).map((p) => ({ nombre: p.descripcion, valor: p.importe })),
      formato: 'moneda',
    });

    charts.barrasHorizontales($('[data-top-clientes]', raiz), {
      datos: datos.top_clientes.slice(0, 6).map((c) => ({ nombre: c.nombre, valor: c.facturado })),
      formato: 'moneda',
    });

    charts.barrasHorizontales($('[data-grafica-embudo]', raiz), {
      datos: [
        { nombre: 'Borrador', valor: datos.embudo.Borrador.total },
        { nombre: 'Enviada', valor: datos.embudo.Enviada.total },
        { nombre: 'Aprobada', valor: datos.embudo.Aprobada.total },
        { nombre: 'Convertida', valor: datos.embudo.Convertida.total },
      ],
      formato: 'moneda',
    });

    /* Interacciones */
    $$('[data-vista-valor]', raiz).forEach((boton) => {
      boton.addEventListener('click', () => {
        estado.vista = boton.getAttribute('data-vista-valor');
        $$('[data-vista-valor]', raiz).forEach((b) => b.classList.toggle('is-active', b === boton));
        pintarGraficaPrincipal(raiz);
      });
    });

    $('#panel-anio', acciones).addEventListener('change', async (evento) => {
      estado.anio = Number(evento.target.value);
      await montar(raiz, acciones);
    });

    $('[data-accion="nueva-cotizacion"]', acciones).addEventListener('click', () => VP.documento.abrir({ tipo: 'cotizacion' }));
    $('[data-accion="exportar"]', acciones).addEventListener('click', exportar);
    $('[data-accion="ver-facturas"]', raiz).addEventListener('click', () => VP.app.ir('facturas', { estadoGrupo: 'vencidas' }));
    $('[data-accion="ver-asesores"]', raiz).addEventListener('click', () => VP.app.ir('asesores'));

    raiz.addEventListener('click', (evento) => {
      const factura = evento.target.closest('[data-factura]');
      if (factura) {
        VP.app.ir('facturas', { abrir: Number(factura.getAttribute('data-factura')) });
        return;
      }
      const cotizacion = evento.target.closest('[data-cotizacion]');
      if (cotizacion) {
        VP.app.ir('cotizaciones', { abrir: Number(cotizacion.getAttribute('data-cotizacion')) });
        return;
      }
      const cliente = evento.target.closest('[data-cliente]');
      if (cliente) VP.app.ir('clientes', { abrir: Number(cliente.getAttribute('data-cliente')) });
    });
  }

  async function exportar() {
    const serie = datos.serie;
    const cabeceras = [
      { titulo: 'Mes', valor: (f) => f.etiqueta },
      { titulo: 'Cotizado', valor: (f) => f.cotizado },
      { titulo: 'Facturado', valor: (f) => f.facturado },
      { titulo: 'Recaudado', valor: (f) => f.cobrado },
      { titulo: 'Facturas', valor: (f) => f.facturas },
      { titulo: 'Cotizaciones', valor: (f) => f.cotizaciones },
    ];

    const opcion = await VP.ui.modal({
      titulo: 'Exportar panel',
      subtitulo: `${datos.anio} · serie de 12 meses`,
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
          const resultado = await VP.api.exportarCsv({ nombre: `panel-ventas-${datos.anio}`, cabeceras: cabeceras.map((c) => c.titulo), filas: ui.filasParaExportar(cabeceras, serie) });
          if (!resultado.cancelado) ui.aviso.exito('Archivo CSV generado.', 'Exportacion lista');
        } else {
          const resultado = await VP.api.informe({
            titulo: `Panel de crecimiento ${datos.anio}`,
            subtitulo: `Facturado ${formatMoneda(datos.kpis.ventas_anio)} · cartera ${formatMoneda(datos.kpis.cartera_total)}`,
            cabeceras,
            filas: serie,
            accion: 'guardar',
          });
          if (resultado && resultado.ruta) ui.aviso.exito('Informe PDF generado.', 'Listo');
        }
      });
    });
  }

  VP.views.panel = {
    titulo: 'Panel de crecimiento',
    subtitulo: 'Indicadores de ventas, cartera y conversion comercial',
    montar,
  };
})();
