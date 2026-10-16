'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Superficie expuesta al renderer.
 *
 * contextIsolation esta activo: la interfaz no tiene acceso a Node ni a
 * Electron, solo a esta lista blanca de canales.
 */
contextBridge.exposeInMainWorld('Fluxo', {
  /** Invoca un canal del proceso principal. Siempre resuelve con { ok, data|error }. */
  invoke(canal, payload) {
    return ipcRenderer.invoke(`vp:${canal}`, payload);
  },

  /** Acciones disparadas desde el menu nativo (Ctrl+N, Ctrl+1, ...). */
  alMenu(callback) {
    ipcRenderer.on('vp:menu', (_evento, accion) => callback(accion));
  },

  /** Version del runtime, util para el dialogo "Acerca de". */
  entorno: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
