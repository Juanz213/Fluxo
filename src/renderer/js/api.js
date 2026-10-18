/* ==========================================================================
   Fluxo · Acceso al proceso principal
   ========================================================================== */
(function () {
  'use strict';

  const VP = window.VP;

  if (!window.Fluxo) {
    document.body.innerHTML =
      '<div style="padding:40px;font-family:Segoe UI,Arial"><h2>Error de arranque</h2>' +
      '<p>No se pudo conectar con el proceso principal de la aplicacion.</p></div>';
    return;
  }

  /**
   * Invoca un canal y lanza un Error con el mensaje de negocio si falla.
   * Los mensajes de la capa de datos ya vienen redactados para el usuario.
   */
  async function invocar(canal, payload) {
    const respuesta = await window.Fluxo.invoke(canal, payload || {});
    if (!respuesta || respuesta.ok !== true) {
      const error = new Error((respuesta && respuesta.error) || 'Ocurrio un error inesperado.');
      error.canal = canal;
      throw error;
    }
    return respuesta.data;
  }

  /** Igual que invocar, pero nunca lanza: devuelve un valor de respaldo. */
  async function intentar(canal, payload, respaldo = null) {
    try {
      return await invocar(canal, payload);
    } catch (error) {
      console.warn(`[api] ${canal}: ${error.message}`);
      return respaldo;
    }
  }

  VP.api = {
    invocar,
    intentar,

    /* Aplicacion */
    info: () => invocar('app.info'),

    /* Configuracion */
    config: () => invocar('config.all'),
    guardarConfig: (patch) => invocar('config.set', patch),
    listas: () => invocar('config.listas'),

    /* Asesores */
    asesores: (filtros) => invocar('asesores.list', filtros),
    asesor: (id) => invocar('asesores.get', { id }),
    guardarAsesor: (payload) => invocar('asesores.save', payload),
    eliminarAsesor: (id) => invocar('asesores.remove', { id }),
    zonas: () => invocar('asesores.zonas'),
    codigoAsesor: () => invocar('asesores.nextCodigo'),

    /* Clientes */
    clientes: (filtros) => invocar('clientes.list', filtros),
    clientesPagina: (filtros) => invocar('clientes.page', filtros),
    cliente: (id) => invocar('clientes.get', { id }),
    guardarCliente: (payload) => invocar('clientes.save', payload),
    eliminarCliente: (id) => invocar('clientes.remove', { id }),
    ciudades: () => invocar('clientes.ciudades'),
    codigoCliente: () => invocar('clientes.nextCodigo'),
    historialCliente: (id) => invocar('clientes.historial', { id }),

    /* Productos */
    productos: (filtros) => invocar('productos.list', filtros),
    producto: (id) => invocar('productos.get', { id }),
    guardarProducto: (payload) => invocar('productos.save', payload),
    eliminarProducto: (id) => invocar('productos.remove', { id }),
    codigoProducto: (tipo) => invocar('productos.nextCodigo', { tipo }),
    movimientosProducto: (id) => invocar('productos.movimientos', { id }),
    alertasStock: () => invocar('productos.alertasStock'),

    categorias: (filtros) => invocar('categorias.list', filtros),
    guardarCategoria: (payload) => invocar('categorias.save', payload),
    eliminarCategoria: (id) => invocar('categorias.remove', { id }),

    /* Cotizaciones */
    cotizaciones: (filtros) => invocar('cotizaciones.list', filtros),
    cotizacion: (id) => invocar('cotizaciones.get', { id }),
    guardarCotizacion: (payload) => invocar('cotizaciones.save', payload),
    eliminarCotizacion: (id) => invocar('cotizaciones.remove', { id }),
    estadoCotizacion: (id, estado, motivo) => invocar('cotizaciones.cambiarEstado', { id, estado, motivo }),
    duplicarCotizacion: (id) => invocar('cotizaciones.duplicar', { id }),
    resumenCotizaciones: (filtros) => invocar('cotizaciones.resumen', filtros),
    numeroCotizacion: (fecha) => invocar('cotizaciones.nextNumero', { fecha }),
    cotizacionesEstancadas: (dias) => invocar('cotizaciones.estancadas', { dias }),

    /* Facturas */
    facturas: (filtros) => invocar('facturas.list', filtros),
    factura: (id) => invocar('facturas.get', { id }),
    guardarFactura: (payload) => invocar('facturas.save', payload),
    eliminarFactura: (id) => invocar('facturas.remove', { id }),
    anularFactura: (id, motivo) => invocar('facturas.anular', { id, motivo }),
    resumenFacturas: (filtros) => invocar('facturas.resumen', filtros),
    numeroFactura: (fecha) => invocar('facturas.nextNumero', { fecha }),
    facturaDesdeCotizacion: (payload) => invocar('facturas.desdeCotizacion', payload),

    /* Pagos */
    pagos: (filtros) => invocar('pagos.list', filtros),
    guardarPago: (payload) => invocar('pagos.save', payload),
    eliminarPago: (id) => invocar('pagos.remove', { id }),

    /* Proveedores */
    proveedores: (filtros) => invocar('proveedores.list', filtros),
    proveedor: (id) => invocar('proveedores.get', { id }),
    guardarProveedor: (payload) => invocar('proveedores.save', payload),
    eliminarProveedor: (id) => invocar('proveedores.remove', { id }),
    ciudadesProveedor: () => invocar('proveedores.ciudades'),
    codigoProveedor: () => invocar('proveedores.nextCodigo'),
    historialProveedor: (id) => invocar('proveedores.historial', { id }),

    /* Gastos (compras a proveedores) */
    gastos: (filtros) => invocar('gastos.list', filtros),
    gasto: (id) => invocar('gastos.get', { id }),
    guardarGasto: (payload) => invocar('gastos.save', payload),
    eliminarGasto: (id) => invocar('gastos.remove', { id }),
    anularGasto: (id, motivo) => invocar('gastos.anular', { id, motivo }),
    resumenGastos: (filtros) => invocar('gastos.resumen', filtros),
    numeroGasto: (fecha) => invocar('gastos.nextNumero', { fecha }),
    pagosGasto: (filtros) => invocar('gastos.pagos', filtros),
    guardarPagoGasto: (payload) => invocar('gastos.pago.save', payload),
    eliminarPagoGasto: (id) => invocar('gastos.pago.remove', { id }),

    /* Panel */
    panel: (opciones) => invocar('dashboard.resumen', opciones),

    /* Documentos */
    documento: (tipo, id, accion) => invocar(`documento.${tipo}`, { id, accion }),
    informe: (payload) => invocar('documento.informe', payload),

    /* Exportacion */
    exportarCsv: (payload) => invocar('csv.exportar', payload),
    abrirCarpeta: (ruta) => invocar('csv.abrirCarpeta', { ruta }),

    /* Respaldos */
    respaldar: () => invocar('backup.crear'),
    restaurar: () => invocar('backup.restaurar'),
    infoRespaldos: () => invocar('backup.info'),
    abrirRespaldos: () => invocar('backup.abrirRespaldos'),

    /* Demostracion */
    estadoDemo: () => invocar('demo.estado'),
    cargarDemo: (opciones) => invocar('demo.cargar', opciones),
    limpiarDemo: () => invocar('demo.limpiar'),
  };
})();
