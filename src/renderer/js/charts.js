/* ==========================================================================
   Fluxo · Graficas SVG (sin dependencias externas)
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { escapeHtml, formatCompacto, formatMoneda, formatNumero } = VP.utils;

  const COLORES = ['#2563eb', '#0891b2', '#059669', '#d97706', '#7c3aed', '#dc2626'];

  /* ------------------------------------------------------------------ */
  /* Tooltip compartido                                                  */
  /* ------------------------------------------------------------------ */

  let tooltip = null;

  function mostrarTooltip(evento, html) {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.className = 'tooltip-chart';
      document.body.appendChild(tooltip);
    }
    tooltip.innerHTML = html;
    tooltip.style.left = `${evento.clientX}px`;
    tooltip.style.top = `${evento.clientY - 10}px`;
    tooltip.style.display = 'block';
  }

  function ocultarTooltip() {
    if (tooltip) tooltip.style.display = 'none';
  }

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  /** Redondea el maximo a un valor "bonito" para el eje Y. */
  function techoBonito(valor) {
    if (valor <= 0) return 1;
    const exponente = Math.floor(Math.log10(valor));
    const base = 10 ** exponente;
    const escalado = valor / base;
    const paso = escalado <= 1 ? 1 : escalado <= 2 ? 2 : escalado <= 2.5 ? 2.5 : escalado <= 5 ? 5 : 10;
    return paso * base;
  }

  function puntos(serie, n, x, y) {
    return serie.valores.map((v, i) => ({ x: x(i), y: y(Number(v) || 0), valor: Number(v) || 0, indice: i }));
  }

  /* ------------------------------------------------------------------ */
  /* Grafica de lineas / area                                            */
  /* ------------------------------------------------------------------ */

  /**
   * @param {HTMLElement} contenedor
   * @param {object} opciones
   *   etiquetas: string[]
   *   series: [{ nombre, color, valores, area }]
   *   formato: 'moneda' | 'numero'
   */
  function linea(contenedor, opciones) {
    const { etiquetas = [], series = [], formato = 'moneda' } = opciones;
    const n = etiquetas.length;

    if (!contenedor) return;
    if (!n || !series.length) {
      contenedor.innerHTML = '<div class="empty" style="padding:38px 12px"><p>Sin datos para graficar.</p></div>';
      return;
    }

    const W = 1000;
    const H = 300;
    const pad = { t: 18, r: 20, b: 36, l: 62 };
    const ancho = W - pad.l - pad.r;
    const alto = H - pad.t - pad.b;

    const maximo = Math.max(...series.flatMap((s) => s.valores.map((v) => Number(v) || 0)), 1);
    const techo = techoBonito(maximo * 1.06);

    const x = (i) => (n === 1 ? pad.l + ancho / 2 : pad.l + (i * ancho) / (n - 1));
    const y = (v) => pad.t + alto - (v / techo) * alto;

    const formatear = (v) => (formato === 'moneda' ? formatMoneda(v) : formatNumero(v));
    const formatearEje = (v) => formatCompacto(v);

    /* Rejilla + eje Y */
    let rejilla = '';
    const divisiones = 4;
    for (let i = 0; i <= divisiones; i += 1) {
      const valor = (techo / divisiones) * i;
      const posY = y(valor);
      rejilla += `<line class="grid-line" x1="${pad.l}" y1="${posY}" x2="${W - pad.r}" y2="${posY}" />`;
      rejilla += `<text x="${pad.l - 10}" y="${posY + 4}" text-anchor="end">${escapeHtml(formatearEje(valor))}</text>`;
    }

    /* Etiquetas X (se saltan para no saturar) */
    const salto = n > 14 ? Math.ceil(n / 12) : 1;
    let etiquetasX = '';
    etiquetas.forEach((etiqueta, i) => {
      if (i % salto !== 0 && i !== n - 1) return;
      etiquetasX += `<text x="${x(i)}" y="${H - 12}" text-anchor="middle">${escapeHtml(etiqueta)}</text>`;
    });

    /* Series */
    let cuerpo = '';
    series.forEach((serie, indice) => {
      const color = serie.color || COLORES[indice % COLORES.length];
      const pts = puntos(serie, n, x, y);
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

      if (serie.area !== false) {
        const area = `${d} L${pts[pts.length - 1].x.toFixed(1)},${(pad.t + alto).toFixed(1)} L${pts[0].x.toFixed(1)},${(pad.t + alto).toFixed(1)} Z`;
        cuerpo += `<path class="serie-area" d="${area}" fill="${color}" />`;
      }

      cuerpo += `<path class="serie-line" d="${d}" stroke="${color}" />`;

      pts.forEach((p) => {
        cuerpo += `<circle class="dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#fff" stroke="${color}" stroke-width="2.4" data-punto="${p.indice}" />`;
      });
    });

    /* Zonas de interaccion */
    let zonas = '';
    etiquetas.forEach((etiqueta, i) => {
      const anchoMes = n === 1 ? ancho : ancho / (n - 1);
      const izquierda = Math.max(pad.l, x(i) - anchoMes / 2);
      zonas += `
        <rect x="${izquierda.toFixed(1)}" y="${pad.t}" width="${Math.min(anchoMes, W - pad.r - izquierda).toFixed(1)}" height="${alto}"
              fill="transparent" data-zona="${i}" style="cursor:crosshair">
          <title>${escapeHtml(etiqueta)}</title>
        </rect>`;
      zonas += `<line class="hover-line" data-linea="${i}" x1="${x(i).toFixed(1)}" y1="${pad.t}" x2="${x(i).toFixed(1)}" y2="${pad.t + alto}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 4" style="display:none" />`;
    });

    contenedor.innerHTML = `
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">
        ${rejilla}
        <line class="axis-line" x1="${pad.l}" y1="${pad.t + alto}" x2="${W - pad.r}" y2="${pad.t + alto}" />
        ${cuerpo}
        ${etiquetasX}
        ${zonas}
      </svg>`;

    /* Interaccion */
    const svg = contenedor.querySelector('svg');
    svg.querySelectorAll('[data-zona]').forEach((zona) => {
      zona.addEventListener('mousemove', (evento) => {
        const i = Number(zona.getAttribute('data-zona'));
        svg.querySelectorAll('[data-linea]').forEach((l) => { l.style.display = 'none'; });
        const guia = svg.querySelector(`[data-linea="${i}"]`);
        if (guia) guia.style.display = 'block';

        const filas = series
          .map((serie, indice) => {
            const color = serie.color || COLORES[indice % COLORES.length];
            const valor = Number(serie.valores[i]) || 0;
            return `<div><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>${escapeHtml(serie.nombre)}: <strong>${escapeHtml(formatear(valor))}</strong></div>`;
          })
          .join('');
        mostrarTooltip(evento, `<div style="margin-bottom:4px"><strong>${escapeHtml(etiquetas[i])}</strong></div>${filas}`);
      });
      zona.addEventListener('mouseleave', () => {
        ocultarTooltip();
        svg.querySelectorAll('[data-linea]').forEach((l) => { l.style.display = 'none'; });
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Grafica de barras agrupadas                                         */
  /* ------------------------------------------------------------------ */

  function barras(contenedor, opciones) {
    const { etiquetas = [], series = [], formato = 'moneda', apilado = false } = opciones;
    const n = etiquetas.length;

    if (!contenedor) return;
    if (!n || !series.length) {
      contenedor.innerHTML = '<div class="empty" style="padding:38px 12px"><p>Sin datos para graficar.</p></div>';
      return;
    }

    const W = 1000;
    const H = 300;
    const pad = { t: 18, r: 20, b: 36, l: 62 };
    const ancho = W - pad.l - pad.r;
    const alto = H - pad.t - pad.b;

    const totales = etiquetas.map((_, i) =>
      apilado
        ? series.reduce((acc, s) => acc + (Number(s.valores[i]) || 0), 0)
        : Math.max(...series.map((s) => Number(s.valores[i]) || 0), 0));
    const techo = techoBonito(Math.max(...totales, 1) * 1.08);

    const anchoGrupo = ancho / n;
    const formatear = (v) => (formato === 'moneda' ? formatMoneda(v) : formatNumero(v));

    let rejilla = '';
    const divisiones = 4;
    for (let i = 0; i <= divisiones; i += 1) {
      const valor = (techo / divisiones) * i;
      const posY = pad.t + alto - (valor / techo) * alto;
      rejilla += `<line class="grid-line" x1="${pad.l}" y1="${posY.toFixed(1)}" x2="${W - pad.r}" y2="${posY.toFixed(1)}" />`;
      rejilla += `<text x="${pad.l - 10}" y="${(posY + 4).toFixed(1)}" text-anchor="end">${escapeHtml(formatCompacto(valor))}</text>`;
    }

    const salto = n > 14 ? Math.ceil(n / 12) : 1;
    let etiquetasX = '';
    etiquetas.forEach((etiqueta, i) => {
      if (i % salto !== 0 && i !== n - 1) return;
      etiquetasX += `<text x="${(pad.l + anchoGrupo * i + anchoGrupo / 2).toFixed(1)}" y="${H - 12}" text-anchor="middle">${escapeHtml(etiqueta)}</text>`;
    });

    let cuerpo = '';
    etiquetas.forEach((etiqueta, i) => {
      const centro = pad.l + anchoGrupo * i;
      if (apilado) {
        let acumulado = 0;
        series.forEach((serie, indice) => {
          const color = serie.color || COLORES[indice % COLORES.length];
          const valor = Number(serie.valores[i]) || 0;
          const altura = (valor / techo) * alto;
          const posY = pad.t + alto - ((acumulado + valor) / techo) * alto;
          acumulado += valor;
          if (altura <= 0) return;
          cuerpo += `<rect class="bar" x="${(centro + anchoGrupo * 0.18).toFixed(1)}" y="${posY.toFixed(1)}" width="${(anchoGrupo * 0.64).toFixed(1)}" height="${altura.toFixed(1)}" rx="3" fill="${color}" data-barra="${i}"><title>${escapeHtml(`${etiqueta} · ${serie.nombre}: ${formatear(valor)}`)}</title></rect>`;
        });
      } else {
        const anchoBarra = (anchoGrupo * 0.68) / series.length;
        series.forEach((serie, indice) => {
          const color = serie.color || COLORES[indice % COLORES.length];
          const valor = Number(serie.valores[i]) || 0;
          const altura = (valor / techo) * alto;
          const posX = centro + anchoGrupo * 0.16 + anchoBarra * indice;
          if (altura <= 0) return;
          cuerpo += `<rect class="bar" x="${posX.toFixed(1)}" y="${(pad.t + alto - altura).toFixed(1)}" width="${Math.max(1, anchoBarra - 2).toFixed(1)}" height="${altura.toFixed(1)}" rx="3" fill="${color}" data-barra="${i}"><title>${escapeHtml(`${etiqueta} · ${serie.nombre}: ${formatear(valor)}`)}</title></rect>`;
        });
      }
    });

    contenedor.innerHTML = `
      <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">
        ${rejilla}
        <line class="axis-line" x1="${pad.l}" y1="${pad.t + alto}" x2="${W - pad.r}" y2="${pad.t + alto}" />
        ${cuerpo}
        ${etiquetasX}
      </svg>`;
  }

  /* ------------------------------------------------------------------ */
  /* Dona                                                                */
  /* ------------------------------------------------------------------ */

  function dona(contenedor, opciones) {
    const { datos = [], formato = 'moneda', centro = null } = opciones;
    const total = datos.reduce((acc, d) => acc + (Number(d.valor) || 0), 0);

    if (!contenedor) return;
    if (!total) {
      contenedor.innerHTML = '<div class="empty" style="padding:34px 12px"><p>Sin datos para graficar.</p></div>';
      return;
    }

    const tam = 190;
    const radio = 74;
    const grosor = 26;
    const cx = tam / 2;
    const cy = tam / 2;
    const radioMedio = radio - grosor / 2;

    let angulo = -Math.PI / 2;
    let arcos = '';
    datos.forEach((d, indice) => {
      const valor = Number(d.valor) || 0;
      if (valor <= 0) return;
      const fraccion = valor / total;
      const inicio = angulo;
      const fin = angulo + fraccion * Math.PI * 2;
      angulo = fin;
      const color = d.color || COLORES[indice % COLORES.length];

      const x1 = cx + radioMedio * Math.cos(inicio);
      const y1 = cy + radioMedio * Math.sin(inicio);
      const x2 = cx + radioMedio * Math.cos(fin);
      const y2 = cy + radioMedio * Math.sin(fin);
      const arcoGrande = fraccion > 0.5 ? 1 : 0;

      // Circulo completo no puede dibujarse con un solo arco.
      const d_ = fraccion >= 0.9999
        ? `M ${cx} ${cy - radioMedio} A ${radioMedio} ${radioMedio} 0 1 1 ${cx - 0.01} ${cy - radioMedio}`
        : `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radioMedio} ${radioMedio} 0 ${arcoGrande} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;

      arcos += `<path d="${d_}" fill="none" stroke="${color}" stroke-width="${grosor}" stroke-linecap="butt" class="bar">
        <title>${escapeHtml(`${d.nombre}: ${formato === 'moneda' ? formatMoneda(valor) : formatNumero(valor)} (${(fraccion * 100).toFixed(1)}%)`)}</title>
      </path>`;
    });

    const etiquetaCentro = centro
      ? `<text x="${cx}" y="${cy - 3}" text-anchor="middle" style="font-size:11px;fill:#7c8798;text-transform:uppercase;letter-spacing:.6px">${escapeHtml(centro.titulo || '')}</text>
         <text x="${cx}" y="${cy + 17}" text-anchor="middle" style="font-size:17px;font-weight:700;fill:#0f172a">${escapeHtml(centro.valor || '')}</text>`
      : '';

    contenedor.innerHTML = `
      <div class="donut-wrap">
        <svg class="chart" width="${tam}" height="${tam}" viewBox="0 0 ${tam} ${tam}" style="max-width:${tam}px;flex:none">
          ${arcos}
          ${etiquetaCentro}
        </svg>
        <div class="donut-legend">
          ${datos
            .map((d, indice) => {
              const valor = Number(d.valor) || 0;
              const color = d.color || COLORES[indice % COLORES.length];
              return `<div class="donut-legend__row">
                <span class="swatch" style="background:${color}"></span>
                <span class="name">${escapeHtml(d.nombre)}</span>
                <span class="val">${escapeHtml(formato === 'moneda' ? formatMoneda(valor) : formatNumero(valor))}</span>
                <span class="text-muted" style="min-width:48px;text-align:right">${total ? ((valor / total) * 100).toFixed(1) : '0,0'}%</span>
              </div>`;
            })
            .join('')}
        </div>
      </div>`;
  }

  /* ------------------------------------------------------------------ */
  /* Barras horizontales (CSS)                                           */
  /* ------------------------------------------------------------------ */

  function barrasHorizontales(contenedor, opciones) {
    const { datos = [], formato = 'moneda', color = null } = opciones;
    if (!contenedor) return;
    if (!datos.length) {
      contenedor.innerHTML = '<div class="empty" style="padding:30px 12px"><p>Sin datos.</p></div>';
      return;
    }

    const maximo = Math.max(...datos.map((d) => Number(d.valor) || 0), 1);
    contenedor.innerHTML = `
      <div class="hbar">
        ${datos
          .map((d, indice) => {
            const valor = Number(d.valor) || 0;
            const pct = (valor / maximo) * 100;
            const fondo = color || `linear-gradient(90deg, ${COLORES[indice % COLORES.length]}, ${COLORES[indice % COLORES.length]}bb)`;
            return `
              <div class="hbar__row">
                <div class="hbar__label">${d.avatar ? VP.ui.avatar(d.nombre, 'sm') : ''}<span>${escapeHtml(d.nombre)}</span></div>
                <div class="hbar__value">${escapeHtml(formato === 'moneda' ? formatMoneda(valor) : formatNumero(valor))}</div>
                <div class="hbar__track"><div class="hbar__fill" style="width:${pct.toFixed(1)}%;background:${fondo}"></div></div>
              </div>`;
          })
          .join('')}
      </div>`;
  }

  function leyenda(series) {
    return `<div class="legend">${series
      .map(
        (s, i) =>
          `<span class="chart-legend-item"><span class="chart-legend-swatch" style="background:${s.color || COLORES[i % COLORES.length]}"></span>${escapeHtml(s.nombre)}</span>`,
      )
      .join('')}</div>`;
  }

  VP.charts = { linea, barras, dona, barrasHorizontales, leyenda, COLORES };
})();
