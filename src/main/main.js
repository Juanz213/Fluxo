'use strict';

const path = require('node:path');
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');

const db = require('./db/database');
const config = require('./repositories/config');
const ipc = require('./ipc');
const backup = require('./services/backup');

const ES_DEV = process.argv.includes('--dev') || !app.isPackaged;

let ventanaPrincipal = null;

/* -------------------------------------------------------------------- */
/* Ventana                                                               */
/* -------------------------------------------------------------------- */

function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1150,
    minHeight: 700,
    show: false,
    backgroundColor: '#0b1220',
    title: 'Fluxo',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  ventanaPrincipal.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  ventanaPrincipal.once('ready-to-show', () => {
    ventanaPrincipal.show();
    if (ES_DEV && process.argv.includes('--devtools')) {
      ventanaPrincipal.webContents.openDevTools({ mode: 'detach' });
    }
  });

  ventanaPrincipal.on('closed', () => {
    ventanaPrincipal = null;
  });

  // La aplicacion es 100% local: cualquier enlace externo se abre en el
  // navegador del sistema, nunca dentro de la ventana.
  ventanaPrincipal.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  ventanaPrincipal.webContents.on('will-navigate', (evento, url) => {
    if (!url.startsWith('file://')) {
      evento.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
}

/* -------------------------------------------------------------------- */
/* Menu                                                                  */
/* -------------------------------------------------------------------- */

function construirMenu() {
  const enviar = (canal) => () => {
    if (ventanaPrincipal && !ventanaPrincipal.isDestroyed()) {
      ventanaPrincipal.webContents.send('vp:menu', canal);
    }
  };

  const plantilla = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nueva cotizacion', accelerator: 'CmdOrCtrl+N', click: enviar('nueva-cotizacion') },
        { label: 'Nueva factura', accelerator: 'CmdOrCtrl+Shift+N', click: enviar('nueva-factura') },
        { label: 'Nuevo gasto', accelerator: 'CmdOrCtrl+Shift+G', click: enviar('nuevo-gasto') },
        { label: 'Nuevo cliente', accelerator: 'CmdOrCtrl+Shift+C', click: enviar('nuevo-cliente') },
        { type: 'separator' },
        { label: 'Ir al panel', accelerator: 'CmdOrCtrl+1', click: enviar('ir-panel') },
        { label: 'Ir a cotizaciones', accelerator: 'CmdOrCtrl+2', click: enviar('ir-cotizaciones') },
        { label: 'Ir a facturas', accelerator: 'CmdOrCtrl+3', click: enviar('ir-facturas') },
        { label: 'Ir a gastos', click: enviar('ir-gastos') },
        { type: 'separator' },
        { label: 'Respaldar datos...', click: () => backup.crear() },
        { label: 'Restaurar respaldo...', click: () => backup.restaurar() },
        { label: 'Abrir carpeta de respaldos', click: () => backup.abrirCarpetaRespaldos() },
        { type: 'separator' },
        { label: 'Salir', accelerator: 'Alt+F4', role: 'quit' },
      ],
    },
    {
      label: 'Edicion',
      submenu: [
        { label: 'Deshacer', role: 'undo' },
        { label: 'Rehacer', role: 'redo' },
        { type: 'separator' },
        { label: 'Cortar', role: 'cut' },
        { label: 'Copiar', role: 'copy' },
        { label: 'Pegar', role: 'paste' },
        { label: 'Seleccionar todo', role: 'selectAll' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { label: 'Recargar', accelerator: 'CmdOrCtrl+R', role: 'reload' },
        { label: 'Herramientas de desarrollo', accelerator: 'F12', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Acercar', role: 'zoomIn' },
        { label: 'Alejar', role: 'zoomOut' },
        { label: 'Tamano original', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Pantalla completa', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de Fluxo',
          click: () => {
            dialog.showMessageBox(ventanaPrincipal, {
              type: 'info',
              title: 'Acerca de Fluxo',
              message: `Fluxo ${app.getVersion()}`,
              detail: [
                'Sistema de gestion comercial: cotizaciones, facturacion,',
                'clientes, asesores y panel de crecimiento.',
                '',
                `Base de datos: ${db.filePath()}`,
                `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}`,
              ].join('\n'),
              buttons: ['Cerrar'],
            });
          },
        },
        {
          label: 'Abrir carpeta de datos',
          click: () => backup.abrirCarpeta(),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(plantilla));
}

/* -------------------------------------------------------------------- */
/* Arranque                                                              */
/* -------------------------------------------------------------------- */

async function iniciar() {
  try {
    await db.open(app.getPath('userData'));
    config.bootstrap();

    // Al abrir, se ponen al dia los estados que dependen de la fecha de hoy.
    require('./repositories/cotizaciones').marcarVencidas();
    require('./repositories/facturas').refrescarEstados();
    require('./repositories/gastos').refrescarEstados();
  } catch (error) {
    dialog.showErrorBox(
      'No se pudo iniciar Fluxo',
      `Ocurrio un error al abrir la base de datos:\n\n${error.message}`,
    );
    app.exit(1);
    return;
  }

  ipc.registrar();
  construirMenu();
  crearVentana();
}

/* -------------------------------------------------------------------- */
/* Ciclo de vida                                                         */
/* -------------------------------------------------------------------- */

const instanciaUnica = app.requestSingleInstanceLock();

if (!instanciaUnica) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (ventanaPrincipal) {
      if (ventanaPrincipal.isMinimized()) ventanaPrincipal.restore();
      ventanaPrincipal.focus();
    }
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId('com.fluxo.app');
    await iniciar();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    try {
      if (config.get('backup_automatico', '1') === '1') backup.respaldoAutomatico('cierre');
      db.flush();
      db.close();
    } catch {
      /* nunca bloquear el cierre por un fallo de respaldo */
    }
  });
}

module.exports = {};
