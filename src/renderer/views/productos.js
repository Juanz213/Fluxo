/* ==========================================================================
   Fluxo · Catalogo de productos, servicios y categorias
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;
  const { icon, escapeHtml, formatMoneda, formatNumero, formatPorcentaje, formatFecha, recortar } = VP.utils;
  const { $, $$ } = VP.dom;
  const ui = VP.ui;

  const filtros = { q: '', categoria_id: '', tipo: '', activo: true, bajoStock: false, orden: { clave: 'nombre', dir: 'asc' } };
  let filas = [];
  let categorias = [];
  let pestana = 'catalogo';

  async function recargar(raiz) {
    filas = await VP.api.productos(filtros);
    pintar(raiz);
  }

  async function montar(raiz, acciones) {
    categorias = await VP.api.categorias({});

    acciones.innerHTML = `
      <button class="btn" type="button" data-accion="exportar">${icon('descargar', 16)} Exportar</button>
      <button class="btn" type="button" data-accion="categoria">${icon('caja', 16)} Categorias</button>
      <button class="btn btn--primary" type="button" data-accion="nuevo">${icon('mas', 16)} Nuevo item</button>`;

    raiz.innerHTML = `
      <div class="stack">
        <div class="card">
          <div class="tabs" data-tabs>
            <button type="button" data-pestana="catalogo" class="${pestana === 'catalogo' ? 'is-active' : ''}">Catalogo</button>
            <button type="button" data-pestana="stock" class="${pestana === 'stock' ? 'is-active' : ''}">Inventario</button>
          </div>

          <div class="table-toolbar" data-barra-catalogo>
            <div class="search">
              ${icon('buscar')}
              <label class="hidden" for="pro-buscar">Buscar</label>
              <input class="input" id="pro-buscar" type="search" placeholder="Buscar por codigo o nombre..." value="${escapeHtml(filtros.q)}" />
            </div>
            <select class="select" data-filtro="categoria_id" style="width:190px">
              <option value="">Todas las categorias</option>
              ${categorias.map((c) => `<option value="${c.id}" ${String(filtros.categoria_id) === String(c.id) ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
            </select>
            <select class="select" data-filtro="tipo" style="width:140px">
              <option value="">Todos los tipos</option>
              ${['Producto', 'Servicio'].map((t) => `<option value="${t}" ${filtros.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <label class="switch">
              <input type="checkbox" data-filtro-check="bajoStock" ${filtros.bajoStock ? 'checked' : ''} />
              <span class="switch__track"></span>
              <span class="switch__label">Bajo inventario</span>
            </label>
            <label class="switch">
              <input type="checkbox" data-filtro-check="activo" ${filtros.activo ? 'checked' : ''} />
              <span class="switch__track"></span>
              <span class="switch__label">Solo activos</span>
            </label>
          </div>

          <div data-resumen></div>
          <div data-tabla></div>
        </div>
      </div>`;

    $$('[data-pestana]', raiz).forEach((boton) => {
      boton.addEventListener('click', () => {
        pestana = boton.getAttribute('data-pestana');
        $$('[data-pestana]', raiz).forEach((b) => b.classList.toggle('is-active', b === boton));
        $('[data-barra-catalogo]', raiz).classList.toggle('hidden', pestana !== 'catalogo');
        pintar(raiz);
      });
    });

    $('[data-barra-catalogo]', raiz).classList.toggle('hidden', pestana !== 'catalogo');

    const buscar = $('#pro-buscar', raiz);
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

    $('[data-accion="nuevo"]', acciones).addEventListener('click', () => formulario(null, raiz));
    $('[data-accion="categoria"]', acciones).addEventListener('click', () => gestionCategorias(raiz, acciones));
    $('[data-accion="exportar"]', acciones).addEventListener('click', exportar);

    await recargar(raiz);
  }

  /* ------------------------------------------------------------------ */
  /* Tabla                                                               */
  /* ------------------------------------------------------------------ */

  const COLUMNAS = [
    {
      clave: 'nombre',
      titulo: 'Item',
      ordenable: true,
      render: (p) => `
        <div class="strong">${escapeHtml(recortar(p.nombre, 46))}</div>
        <span class="sub">${escapeHtml(p.codigo)}${p.categoria_nombre ? ` · ${escapeHtml(p.categoria_nombre)}` : ''}${p.activo ? '' : ' · INACTIVO'}</span>`,
    },
    { clave: 'tipo', titulo: 'Tipo', render: (p) => `<span class="chip">${escapeHtml(p.tipo)}</span>` },
    { clave: 'precio', titulo: 'Precio', num: true, ordenable: true, render: (p) => `<strong>${formatMoneda(p.precio)}</strong>` },
    { clave: 'iva_pct', titulo: 'IVA', num: true, render: (p) => `${formatNumero(p.iva_pct)}%` },
    {
      clave: 'margen_pct',
      titulo: 'Margen',
      num: true,
      ordenable: true,
      render: (p) => `<span class="${Number(p.margen_pct) >= 25 ? 'text-success' : 'text-warning'}">${formatPorcentaje(p.margen_pct)}</span><span class="sub">${formatMoneda(p.margen_unitario)}</span>`,
    },
    {
      clave: 'stock',
      titulo: 'Inventario',
      num: true,
      ordenable: true,
      render: (p) => (p.controla_stock
        ? `<span class="${Number(p.stock) <= Number(p.stock_minimo) ? 'text-danger' : ''}">${formatNumero(p.stock, { decimales: 2 })} ${escapeHtml(p.unidad)}</span><span class="sub">minimo ${formatNumero(p.stock_minimo)}</span>`
        : '<span class="text-muted">No aplica</span>'),
    },
    { clave: 'vendidos', titulo: 'Vendidos', num: true, ordenable: true, render: (p) => formatNumero(p.vendidos, { decimales: 2 }) },
    {
      clave: 'acciones',
      titulo: '',
      clase: 'num',
      render: (p) => `
        <div class="table-actions">
          ${p.controla_stock ? `<button class="btn btn--ghost btn--icon" type="button" title="Movimientos" data-accion-fila="movimientos" data-id="${p.id}">${icon('reloj', 15)}</button>` : ''}
          <button class="btn btn--ghost btn--icon" type="button" title="Editar" data-accion-fila="editar" data-id="${p.id}">${icon('editar', 15)}</button>
          <button class="btn btn--ghost btn--icon" type="button" title="Eliminar" data-accion-fila="eliminar" data-id="${p.id}">${icon('borrar', 15)}</button>
        </div>`,
    },
  ];

  function pintar(raiz) {
    const inventarioValor = filas.filter((p) => p.controla_stock).reduce((a, p) => a + Number(p.stock) * Number(p.costo), 0);
    const bajos = filas.filter((p) => p.controla_stock && Number(p.stock) <= Number(p.stock_minimo)).length;

    $('[data-resumen]', raiz).innerHTML = pestana !== 'catalogo'
      ? ''
      : `<div class="table-toolbar" style="border-bottom:0;padding-bottom:6px">
        <span class="chip">${icon('productos', 14)} ${formatNumero(filas.length, { decimales: 0 })} items</span>
        <span class="chip">${icon('caja', 14)} Valor del inventario ${formatMoneda(inventarioValor)}</span>
        ${bajos ? `<span class="chip" style="background:var(--warning-soft);border-color:#fde68a;color:var(--warning)">${icon('alerta', 14)} ${bajos} con inventario bajo</span>` : ''}
      </div>`;

    if (pestana === 'stock') {
      const productos = filas.filter((p) => p.controla_stock);
      const columnasStock = [
        {
          clave: 'nombre',
          titulo: 'Producto',
          render: (p) => `<div class="strong">${escapeHtml(recortar(p.nombre, 44))}</div><span class="sub">${escapeHtml(p.codigo)}</span>`,
        },
        { clave: 'stock', titulo: 'Disponible', num: true, render: (p) => `<strong class="${Number(p.stock) <= Number(p.stock_minimo) ? 'text-danger' : ''}">${formatNumero(p.stock, { decimales: 2 })}</strong>` },
        { clave: 'stock_minimo', titulo: 'Minimo', num: true, render: (p) => formatNumero(p.stock_minimo) },
        {
          clave: 'estado',
          titulo: 'Estado',
          render: (p) => {
            const ratio = Number(p.stock_minimo) > 0 ? Number(p.stock) / Number(p.stock_minimo) : 2;
            if (Number(p.stock) <= 0) return '<span class="badge badge--rechazada">Agotado</span>';
            if (ratio <= 1) return '<span class="badge badge--vencida">Reponer</span>';
            if (ratio <= 1.6) return '<span class="badge badge--parcial">Justo</span>';
            return '<span class="badge badge--aprobada">Disponible</span>';
          },
        },
        { clave: 'costo', titulo: 'Costo unit.', num: true, render: (p) => formatMoneda(p.costo) },
        { clave: 'valor', titulo: 'Valor total', num: true, render: (p) => formatMoneda(Number(p.stock) * Number(p.costo)) },
        {
          clave: 'acciones',
          titulo: '',
          clase: 'num',
          render: (p) => `<div class="table-actions"><button class="btn btn--ghost btn--icon" type="button" data-accion-fila="movimientos" data-id="${p.id}" title="Movimientos">${icon('reloj', 15)}</button><button class="btn btn--ghost btn--icon" type="button" data-accion-fila="editar" data-id="${p.id}" title="Editar">${icon('editar', 15)}</button></div>`,
        },
      ];

      $('[data-tabla]', raiz).innerHTML = ui.tabla(columnasStock, productos, {
        vacioIcono: 'caja',
        vacioTitulo: 'Sin productos con inventario',
        vacioTexto: 'Solo los items de tipo Producto controlan existencias.',
      });
    } else {
      $('[data-tabla]', raiz).innerHTML = ui.tabla(COLUMNAS, filas, {
        vacioIcono: 'productos',
        vacioTitulo: filtros.q ? 'Sin resultados' : 'Catalogo vacio',
        vacioTexto: filtros.q ? 'Prueba con otro codigo o nombre.' : 'Agrega productos y servicios para usarlos en las cotizaciones.',
        orden: filtros.orden,
        filaAtributos: (p) => `data-fila-id="${p.id}"`,
      });
    }

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
        if (accion === 'movimientos') return movimientos(id);
        const producto = filas.find((p) => p.id === id);
        const confirmado = await ui.confirmar({ titulo: 'Eliminar item', mensaje: `Se eliminara ${producto.nombre}.`, detalle: 'Solo es posible si no se ha usado en documentos.', textoOk: 'Eliminar' });
        if (!confirmado) return;
        try {
          await VP.api.eliminarProducto(id);
          ui.aviso.exito('Item eliminado.');
          await recargar(raiz);
        } catch (error) {
          ui.aviso.error(error.message);
        }
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* Formulario                                                          */
  /* ------------------------------------------------------------------ */

  async function formulario(id, raiz) {
    const producto = id
      ? await VP.api.producto(id)
      : { codigo: await VP.api.codigoProducto('Producto'), tipo: 'Producto', unidad: 'UND', iva_pct: Number(VP.state.config.iva_default) || 19, activo: true, stock: 0, stock_minimo: 0, precio: 0, costo: 0 };

    const modal = ui.modal({
      titulo: id ? `Editar ${producto.codigo}` : 'Nuevo producto o servicio',
      tamano: 'lg',
      contenido: `
        <div class="stack" style="gap:16px">
          <div class="form-grid">
            <div class="field">
              <label>Codigo</label>
              <input class="input" name="codigo" value="${escapeHtml(producto.codigo || '')}" readonly />
            </div>
            <div class="field">
              <label>Tipo</label>
              <select class="select" name="tipo">
                ${['Producto', 'Servicio'].map((t) => `<option ${producto.tipo === t ? 'selected' : ''}>${t}</option>`).join('')}
              </select>
            </div>
            <div class="field span-3">
              <label>Nombre <span class="req">*</span></label>
              <input class="input" name="nombre" value="${escapeHtml(producto.nombre || '')}" />
            </div>
            <div class="field">
              <label>Categoria</label>
              <select class="select" name="categoria_id">
                <option value="">Sin categoria</option>
                ${categorias.map((c) => `<option value="${c.id}" ${Number(producto.categoria_id) === c.id ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>Unidad de medida</label>
              <select class="select" name="unidad">
                ${['UND', 'LIC', 'SRV', 'HRS', 'MES', 'PTO', 'KG', 'MTS', 'CAJA', 'PAQ'].map((u) => `<option ${producto.unidad === u ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label>IVA (%)</label>
              <select class="select" name="iva_pct">
                ${[19, 5, 0].map((v) => `<option value="${v}" ${Number(producto.iva_pct) === v ? 'selected' : ''}>${v}%</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="section-title">Precios</div>
          <div class="form-grid">
            <div class="field">
              <label>Precio de venta (sin IVA)</label>
              <input class="input" type="number" name="precio" min="0" step="1000" value="${Number(producto.precio) || 0}" />
            </div>
            <div class="field">
              <label>Costo</label>
              <input class="input" type="number" name="costo" min="0" step="1000" value="${Number(producto.costo) || 0}" />
            </div>
            <div class="field">
              <label>Margen</label>
              <input class="input" data-margen readonly value="" />
              <span class="hint">Calculado sobre el precio de venta.</span>
            </div>
          </div>

          <div class="section-title">Inventario</div>
          <div class="form-grid">
            <div class="field">
              <label>Existencias</label>
              <input class="input" type="number" name="stock" min="0" step="1" value="${Number(producto.stock) || 0}" ${producto.tipo === 'Servicio' ? 'disabled' : ''} />
            </div>
            <div class="field">
              <label>Minimo de reposicion</label>
              <input class="input" type="number" name="stock_minimo" min="0" step="1" value="${Number(producto.stock_minimo) || 0}" ${producto.tipo === 'Servicio' ? 'disabled' : ''} />
            </div>
            <div class="field" style="justify-content:flex-end">
              <label class="switch">
                <input type="checkbox" name="activo" ${producto.activo ? 'checked' : ''} />
                <span class="switch__track"></span>
                <span class="switch__label">Item activo</span>
              </label>
            </div>
            <div class="field span-3">
              <label>Descripcion</label>
              <textarea class="textarea" name="descripcion" rows="2">${escapeHtml(producto.descripcion || '')}</textarea>
            </div>
          </div>
        </div>`,
      acciones: [
        { texto: 'Cancelar' },
        {
          texto: id ? 'Guardar cambios' : 'Crear item',
          tipo: 'primary',
          icono: 'ok',
          cerrar: false,
          accion: async (controlador) => {
            const datos = ui.leerFormulario(controlador.raiz);
            ui.limpiarInvalidos(controlador.raiz);
            if (!String(datos.nombre || '').trim()) return ui.marcarInvalido(controlador.raiz, 'nombre', 'Escribe el nombre del item.');
            try {
              const guardado = await VP.api.guardarProducto({ ...datos, id: producto.id });
              VP.documentoCache.limpiar();
              ui.aviso.exito(`${guardado.nombre} guardado.`);
              controlador.cerrar();
              await recargar(raiz);
            } catch (error) {
              ui.aviso.error(error.message);
            }
          },
        },
      ],
    });

    /* Calculo de margen en vivo */
    const precio = $('[name="precio"]', modal.raiz);
    const costo = $('[name="costo"]', modal.raiz);
    const margen = $('[data-margen]', modal.raiz);
    const tipo = $('[name="tipo"]', modal.raiz);

    const calcularMargen = () => {
      const p = Number(precio.value) || 0;
      const c = Number(costo.value) || 0;
      const pct = p > 0 ? ((p - c) / p) * 100 : 0;
      margen.value = `${formatPorcentaje(pct)} · ${formatMoneda(p - c)} por unidad`;
    };

    precio.addEventListener('input', calcularMargen);
    costo.addEventListener('input', calcularMargen);
    calcularMargen();

    tipo.addEventListener('change', () => {
      const esServicio = tipo.value === 'Servicio';
      $('[name="stock"]', modal.raiz).disabled = esServicio;
      $('[name="stock_minimo"]', modal.raiz).disabled = esServicio;
    });

    return modal;
  }

  async function movimientos(id) {
    const [producto, movimientos] = await Promise.all([VP.api.producto(id), VP.api.movimientosProducto(id)]);

    ui.modal({
      titulo: `Movimientos de ${producto.nombre}`,
      subtitulo: `Existencia actual ${formatNumero(producto.stock, { decimales: 2 })} ${producto.unidad}`,
      tamano: 'lg',
      contenido: movimientos.length
        ? `<div class="table-wrap"><table class="data">
             <thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Saldo</th><th>Motivo</th><th>Referencia</th></tr></thead>
             <tbody>${movimientos
               .map(
                 (m) => `<tr>
                   <td>${escapeHtml(formatFecha(m.fecha))}</td>
                   <td><span class="badge ${m.tipo === 'Salida' ? 'badge--vencida' : m.tipo === 'Entrada' ? 'badge--aprobada' : 'badge--parcial'}">${escapeHtml(m.tipo)}</span></td>
                   <td class="num">${formatNumero(m.cantidad, { decimales: 2 })}</td>
                   <td class="num strong">${formatNumero(m.saldo, { decimales: 2 })}</td>
                   <td>${escapeHtml(m.motivo || '—')}</td>
                   <td class="mono">${escapeHtml(m.referencia || '—')}</td>
                 </tr>`,
               )
               .join('')}</tbody>
           </table></div>`
        : `<div class="empty"><p>Este item no tiene movimientos de inventario.</p></div>`,
      acciones: [{ texto: 'Cerrar' }],
    });
  }

  /* ------------------------------------------------------------------ */
  /* Categorias                                                          */
  /* ------------------------------------------------------------------ */

  async function gestionCategorias(raiz, acciones) {
    const listado = await VP.api.categorias({});

    const modal = ui.modal({
      titulo: 'Categorias del catalogo',
      subtitulo: 'Agrupan los items para encontrarlos mas rapido al cotizar.',
      tamano: 'sm',
      contenido: `
        <div class="stack" style="gap:12px">
          <div class="row" style="gap:8px">
            <input class="input" data-nueva placeholder="Nombre de la nueva categoria" />
            <button class="btn btn--primary" type="button" data-agregar>${icon('mas', 16)} Agregar</button>
          </div>
          <div data-lista>
            ${listado
              .map(
                (c) => `
              <div class="alert-row" data-categoria="${c.id}">
                ${icon('caja', 17, { clase: 'ico' })}
                <div>${escapeHtml(c.nombre)}<div class="text-muted" style="font-size:11.5px">${c.productos} item${c.productos === 1 ? '' : 's'}</div></div>
                <span class="val">
                  <button class="btn btn--ghost btn--icon" type="button" data-borrar-categoria="${c.id}" title="Eliminar">${icon('borrar', 15)}</button>
                </span>
              </div>`,
              )
              .join('') || '<p class="text-muted" style="font-size:13px">Sin categorias registradas.</p>'}
          </div>
        </div>`,
      acciones: [{ texto: 'Cerrar' }],
    });

    const recargarCategorias = async () => {
      categorias = await VP.api.categorias({});
      VP.documentoCache.limpiar();
      modal.cerrar();
      gestionCategorias(raiz, acciones);
    };

    $('[data-agregar]', modal.raiz).addEventListener('click', async () => {
      const campo = $('[data-nueva]', modal.raiz);
      if (!campo.value.trim()) return;
      try {
        await VP.api.guardarCategoria({ nombre: campo.value.trim() });
        ui.aviso.exito('Categoria creada.');
        await recargarCategorias();
      } catch (error) {
        ui.aviso.error(error.message);
      }
    });

    $$('[data-borrar-categoria]', modal.raiz).forEach((boton) => {
      boton.addEventListener('click', async () => {
        try {
          await VP.api.eliminarCategoria(Number(boton.getAttribute('data-borrar-categoria')));
          ui.aviso.exito('Categoria eliminada.');
          await recargarCategorias();
        } catch (error) {
          ui.aviso.error(error.message);
        }
      });
    });
  }

  async function exportar() {
    const cabeceras = [
      { titulo: 'Codigo', valor: (p) => p.codigo },
      { titulo: 'Nombre', valor: (p) => p.nombre },
      { titulo: 'Categoria', valor: (p) => p.categoria_nombre },
      { titulo: 'Tipo', valor: (p) => p.tipo },
      { titulo: 'Unidad', valor: (p) => p.unidad },
      { titulo: 'Precio', valor: (p) => p.precio },
      { titulo: 'Costo', valor: (p) => p.costo },
      { titulo: 'IVA %', valor: (p) => p.iva_pct },
      { titulo: 'Margen %', valor: (p) => p.margen_pct },
      { titulo: 'Stock', valor: (p) => (p.controla_stock ? p.stock : '') },
    ];
    const r = await VP.api.exportarCsv({ nombre: 'catalogo', cabeceras: cabeceras.map((c) => c.titulo), filas: ui.filasParaExportar(cabeceras, filas) });
    if (!r.cancelado) ui.aviso.exito('Exportacion generada.');
  }

  VP.views.productos = {
    titulo: 'Productos y servicios',
    subtitulo: 'Catalogo de precios, margenes e inventario',
    montar,
  };
})();
