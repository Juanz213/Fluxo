'use strict';

const { app, ipcMain } = require('electron');

const db = require('./db/database');
const demo = require('./db/demo');

const config = require('./repositories/config');
const asesores = require('./repositories/asesores');
const clientes = require('./repositories/clientes');
const productos = require('./repositories/productos');
const cotizaciones = require('./repositories/cotizaciones');
const facturas = require('./repositories/facturas');
const pagos = require('./repositories/pagos');
const dashboard = require('./repositories/dashboard');

const documentoHtml = require('./services/documentoHtml');
const pdf = require('./services/pdf');
const csv = require('./services/csv');
const backup = require('./services/backup');

/**
 * Puente IPC.
 *
 * Todos los canales responden con la forma { ok, data } o { ok, error }, de
 * modo que el renderer nunca recibe una promesa rechazada y puede mostrar los
 * errores de negocio con un mensaje claro.
 */

const canales = {
  /* ---------------------------------------------------------------- */
  /* Aplicacion                                                       */
  /* ---------------------------------------------------------------- */
  'app.info': () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    plataforma: `${process.platform} ${process.arch}`,
    datos: db.filePath(),
    memoria: process.getSystemMemoryInfo ? Math.round(process.getSystemMemoryInfo().total / 1024) : 0,
  }),

  /* ---------------------------------------------------------------- */
  /* Configuracion                                                    */
  /* ---------------------------------------------------------------- */
  'config.all': () => config.all(),
  'config.set': (patch) => config.setMany(patch),

  /* ---------------------------------------------------------------- */
  /* Asesores                                                         */
  /* ---------------------------------------------------------------- */
  'asesores.list': (filtros) => asesores.list(filtros),
  'asesores.get': ({ id }) => asesores.get(id),
  'asesores.save': (payload) => asesores.save(payload),
  'asesores.remove': ({ id }) => asesores.remove(id),
  'asesores.zonas': () => asesores.zonas(),
  'asesores.nextCodigo': () => asesores.nextCodigo(),

  /* ---------------------------------------------------------------- */
  /* Clientes                                                         */
  /* ---------------------------------------------------------------- */
  'clientes.list': (filtros) => clientes.list(filtros),
  'clientes.page': (filtros) => clientes.page(filtros),
  'clientes.get': ({ id }) => clientes.get(id),
  'clientes.save': (payload) => clientes.save(payload),
  'clientes.remove': ({ id }) => clientes.remove(id),
  'clientes.ciudades': () => clientes.ciudades(),
  'clientes.nextCodigo': () => clientes.nextCodigo(),
  'clientes.historial': ({ id }) => clientes.historial(id),

  /* ---------------------------------------------------------------- */
  /* Productos y categorias                                           */
  /* ---------------------------------------------------------------- */
  'productos.list': (filtros) => productos.list(filtros),
  'productos.get': ({ id }) => productos.get(id),
  'productos.save': (payload) => productos.save(payload),
  'productos.remove': ({ id }) => productos.remove(id),
  'productos.nextCodigo': ({ tipo }) => productos.nextCodigo(tipo),
  'productos.movimientos': ({ id }) => productos.movimientos(id),
  'productos.alertasStock': () => productos.alertasStock(),
  'categorias.list': (filtros) => productos.categorias.list(filtros),
  'categorias.save': (payload) => productos.categorias.save(payload),
  'categorias.remove': ({ id }) => productos.categorias.remove(id),

  /* ---------------------------------------------------------------- */
  /* Cotizaciones                                                     */
  /* ---------------------------------------------------------------- */
  'cotizaciones.list': (filtros) => cotizaciones.list(filtros),
  'cotizaciones.resumen': (filtros) => cotizaciones.resumenEstados(filtros),
  'cotizaciones.get': ({ id }) => cotizaciones.get(id),
  'cotizaciones.save': (payload) => cotizaciones.save(payload),
  'cotizaciones.remove': ({ id }) => cotizaciones.remove(id),
  'cotizaciones.cambiarEstado': ({ id, estado, motivo }) => cotizaciones.cambiarEstado(id, estado, motivo),
  'cotizaciones.duplicar': ({ id }) => cotizaciones.duplicar(id),
  'cotizaciones.nextNumero': ({ fecha }) => cotizaciones.nextNumero(fecha),
  'cotizaciones.estancadas': ({ dias }) => cotizaciones.estancadas(dias),

  /* ---------------------------------------------------------------- */
  /* Facturas                                                         */
  /* ---------------------------------------------------------------- */
  'facturas.list': (filtros) => facturas.list(filtros),
  'facturas.resumen': (filtros) => facturas.resumen(filtros),
  'facturas.get': ({ id }) => facturas.get(id),
  'facturas.save': (payload) => facturas.save(payload),
  'facturas.remove': ({ id }) => facturas.remove(id),
  'facturas.anular': ({ id, motivo }) => facturas.anular(id, motivo),
  'facturas.nextNumero': ({ fecha }) => facturas.nextNumero(fecha),
  'facturas.desdeCotizacion': (payload) => facturas.crearDesdeCotizacion(payload.cotizacion_id, payload),
  'facturas.recalcular': () => ({ actualizadas: facturas.refrescarEstados() }),

  /* ---------------------------------------------------------------- */
  /* Pagos                                                            */
  /* ---------------------------------------------------------------- */
  'pagos.list': (filtros) => pagos.list(filtros),
  'pagos.save': (payload) => pagos.save(payload),
  'pagos.remove': ({ id }) => pagos.remove(id),

  /* ---------------------------------------------------------------- */
  /* Panel de crecimiento                                             */
  /* ---------------------------------------------------------------- */
  'dashboard.resumen': (opciones) => dashboard.resumen(opciones),

  /* ---------------------------------------------------------------- */
  /* Documentos                                                       */
  /* ---------------------------------------------------------------- */
  'documento.cotizacion': async ({ id, accion }) => {
    const cotizacion = cotizaciones.get(id);
    if (!cotizacion) throw new Error('La cotizacion no existe.');
    return ejecutarDocumento(documentoHtml.cotizacionHtml(cotizacion), `Cotizacion-${cotizacion.numero}`, accion);
  },

  'documento.factura': async ({ id, accion }) => {
    const factura = facturas.get(id);
    if (!factura) throw new Error('La factura no existe.');
    return ejecutarDocumento(documentoHtml.facturaHtml(factura), `Factura-${factura.numero}`, accion);
  },

  'documento.informe': async ({ titulo, subtitulo, cabeceras, filas, accion }) => {
    const html = documentoHtml.tablaHtml({ titulo, subtitulo, columnas: cabeceras, filas });
    return ejecutarDocumento(html, String(titulo || 'Informe').replace(/\s+/g, '-'), accion);
  },

  /* ---------------------------------------------------------------- */
  /* Exportacion                                                      */
  /* ---------------------------------------------------------------- */
  'csv.exportar': (payload) => csv.exportar(payload),
  'csv.abrirCarpeta': ({ ruta }) => csv.abrirEnExplorador(ruta),

  /* ---------------------------------------------------------------- */
  /* Respaldos                                                        */
  /* ---------------------------------------------------------------- */
  'backup.crear': () => backup.crear(),
  'backup.restaurar': () => backup.restaurar(),
  'backup.info': () => backup.info(),
  'backup.abrirCarpeta': () => backup.abrirCarpeta(),
  'backup.abrirRespaldos': () => backup.abrirCarpetaRespaldos(),
  'backup.forzar': () => backup.respaldoAutomatico('manual'),

  /* ---------------------------------------------------------------- */
  /* Datos de demostracion                                            */
  /* ---------------------------------------------------------------- */
  'demo.estado': () => ({ vacia: demo.estaVacia() }),
  'demo.cargar': (opciones) => demo.cargar(opciones),
  'demo.limpiar': () => {
    demo.limpiar();
    config.bootstrap();
    return true;
  },
};

/** Ejecuta la accion solicitada sobre un documento HTML. */
async function ejecutarDocumento(html, nombre, accion = 'guardar') {
  switch (accion) {
    case 'previsualizar':
      return pdf.previsualizar(html, nombre);
    case 'imprimir':
      return pdf.imprimir(html);
    case 'guardar':
    default:
      return pdf.guardar(html, `${nombre}.pdf`);
  }
}

function registrar() {
  for (const [canal, manejador] of Object.entries(canales)) {
    ipcMain.handle(`vp:${canal}`, async (_evento, payload) => {
      try {
        const data = await manejador(payload || {});
        return { ok: true, data: data === undefined ? null : data };
      } catch (error) {
        const mensaje = error && error.message ? error.message : String(error);
        console.error(`[ipc] ${canal}:`, mensaje);
        return { ok: false, error: mensaje };
      }
    });
  }
}

module.exports = { registrar, canales };
