'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { BrowserWindow, dialog } = require('electron');

const { escapeHtml } = require('./documentoHtml');

/**
 * Motor de documentos PDF.
 *
 * Usa el propio motor de impresion de Chromium (printToPDF / print), asi que
 * no hace falta ninguna libreria externa y el resultado es identico al que
 * se ve en pantalla.
 */

let contador = 0;

function escribirTemporal(html) {
  const dir = path.join(os.tmpdir(), 'fluxo-docs');
  fs.mkdirSync(dir, { recursive: true });
  contador += 1;
  const file = path.join(dir, `doc-${Date.now()}-${contador}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return file;
}

async function conVentanaOculta(html, fn) {
  const file = escribirTemporal(html);
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });

  try {
    await win.loadFile(file);
    return await fn(win);
  } finally {
    if (!win.isDestroyed()) win.destroy();
    fs.unlink(file, () => {});
  }
}

/** Genera el PDF en memoria. */
async function generar(html) {
  return conVentanaOculta(html, (win) =>
    win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
    }),
  );
}

/** Genera el PDF y pide al usuario donde guardarlo. */
async function guardar(html, nombreSugerido) {
  const buffer = await generar(html);
  const parent = BrowserWindow.getFocusedWindow();

  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: 'Guardar documento PDF',
    defaultPath: nombreSugerido,
    filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) return { cancelado: true };
  fs.writeFileSync(filePath, buffer);
  return { cancelado: false, ruta: filePath, bytes: buffer.length };
}

const BARRA_PREVIA = `
  <style id="vp-toolbar-style">
    #vp-toolbar { position: fixed; top: 0; left: 0; right: 0; height: 46px; z-index: 99999;
      background: #111827; color: #fff; display: flex; align-items: center; gap: 10px;
      padding: 0 14px; font: 13px/1 "Segoe UI", Arial, sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,.25); }
    #vp-toolbar strong { font-weight: 600; margin-right: auto; letter-spacing: .3px; }
    #vp-toolbar button { background: #2563eb; color: #fff; border: 0; border-radius: 6px;
      padding: 8px 14px; font-size: 13px; cursor: pointer; }
    #vp-toolbar button.ghost { background: #374151; }
    #vp-toolbar button:hover { filter: brightness(1.12); }
    #vp-spacer { height: 46px; }
    @media print { #vp-toolbar, #vp-spacer { display: none !important; } }
  </style>
  <div id="vp-toolbar">
    <strong>Vista previa</strong>
    <button class="ghost" onclick="window.close()">Cerrar</button>
    <button onclick="window.print()">Imprimir</button>
  </div>
  <div id="vp-spacer"></div>
`;

/** Abre la vista previa imprimible en una ventana. */
async function previsualizar(html, titulo) {
  const contenido = html.replace('</head>', `${BARRA_PREVIA}</head>`);
  const file = escribirTemporal(contenido);

  const win = new BrowserWindow({
    width: 1020,
    height: 1180,
    title: titulo || 'Vista previa',
    parent: BrowserWindow.getFocusedWindow() || undefined,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });

  win.setMenuBarVisibility(false);
  await win.loadFile(file);
  win.on('closed', () => fs.unlink(file, () => {}));
  return { ok: true };
}

/** Envia el documento directamente al dialogo de impresion. */
async function imprimir(html) {
  return conVentanaOculta(html, async (win) => {
    await new Promise((resolve) => setTimeout(resolve, 250));
    return new Promise((resolve) => {
      win.webContents.print({ printBackground: true, silent: false }, (ok, reason) => {
        resolve({ ok, motivo: reason || '' });
      });
    });
  });
}

module.exports = { generar, guardar, previsualizar, imprimir };
