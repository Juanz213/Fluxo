'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, shell } = require('electron');

const db = require('../db/database');

function marca() {
  return db.now().replace(/[: ]/g, '-');
}

/** Respaldo manual: pide destino y copia la base de datos. */
async function crear() {
  const parent = BrowserWindow.getFocusedWindow();
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: 'Guardar respaldo de Fluxo',
    defaultPath: `fluxo-respaldo-${marca()}.db`,
    filters: [{ name: 'Respaldo Fluxo', extensions: ['db'] }],
  });

  if (canceled || !filePath) return { cancelado: true };

  db.backupTo(filePath);
  return { cancelado: false, ruta: filePath, bytes: fs.statSync(filePath).size };
}

/** Restauracion: reemplaza la base actual previa confirmacion explicita. */
async function restaurar() {
  const parent = BrowserWindow.getFocusedWindow();
  const { canceled, filePaths } = await dialog.showOpenDialog(parent, {
    title: 'Seleccionar respaldo de Fluxo',
    properties: ['openFile'],
    filters: [
      { name: 'Respaldo Fluxo', extensions: ['db'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
  });

  if (canceled || !filePaths?.length) return { cancelado: true };

  const confirmacion = await dialog.showMessageBox(parent, {
    type: 'warning',
    buttons: ['Cancelar', 'Restaurar y reemplazar'],
    defaultId: 0,
    cancelId: 0,
    title: 'Confirmar restauracion',
    message: 'Se reemplazaran TODOS los datos actuales.',
    detail:
      'Antes de continuar se guardara una copia de seguridad automatica del estado actual. ' +
      'La aplicacion se reiniciara con la informacion del respaldo seleccionado.',
  });

  if (confirmacion.response !== 1) return { cancelado: true };

  respaldoAutomatico('pre-restauracion');
  db.close();
  db.restoreFrom(filePaths[0]);
  db.flush();

  app.relaunch();
  app.exit(0);
  return { cancelado: false };
}

/** Copia de seguridad automatica rotativa (conserva las ultimas 15). */
function respaldoAutomatico(etiqueta = 'auto') {
  try {
    const dir = path.join(app.getPath('userData'), 'respaldos');
    fs.mkdirSync(dir, { recursive: true });

    const destino = path.join(dir, `fluxo-${etiqueta}-${marca()}.db`);
    db.backupTo(destino);

    const archivos = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);

    for (const viejo of archivos.slice(15)) {
      fs.unlink(path.join(dir, viejo.f), () => {});
    }
    return destino;
  } catch {
    return null;
  }
}

function abrirCarpeta() {
  shell.openPath(path.dirname(db.filePath()));
  return true;
}

function abrirCarpetaRespaldos() {
  const dir = path.join(app.getPath('userData'), 'respaldos');
  fs.mkdirSync(dir, { recursive: true });
  shell.openPath(dir);
  return true;
}

function info() {
  let bytes = 0;
  try {
    bytes = fs.statSync(db.filePath()).size;
  } catch {
    bytes = 0;
  }
  const dir = path.join(app.getPath('userData'), 'respaldos');
  let respaldos = [];
  try {
    respaldos = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ archivo: f, fecha: fs.statSync(path.join(dir, f)).mtime.toISOString() }))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
      .slice(0, 15);
  } catch {
    respaldos = [];
  }
  return { ruta: db.filePath(), bytes, respaldos };
}

module.exports = { crear, restaurar, respaldoAutomatico, abrirCarpeta, abrirCarpetaRespaldos, info };
