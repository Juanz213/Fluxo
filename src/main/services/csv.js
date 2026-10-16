'use strict';

const fs = require('node:fs');
const { BrowserWindow, dialog, shell } = require('electron');

/** Escapa un valor para CSV delimitado por punto y coma. */
function celda(value) {
  if (value === null || value === undefined) return '';
  const texto = String(value);
  if (/[";\r\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

/**
 * Exporta una tabla a CSV compatible con Excel en espanol
 * (BOM UTF-8 + separador punto y coma).
 */
async function exportar({ nombre = 'exportacion', cabeceras = [], filas = [] }) {
  const sep = ';';
  const lineas = [cabeceras.map(celda).join(sep)];
  for (const fila of filas) lineas.push(fila.map(celda).join(sep));

  const contenido = `\uFEFF${lineas.join('\r\n')}`;
  const parent = BrowserWindow.getFocusedWindow();
  const base = String(nombre).replace(/[\\/:*?"<>|]/g, '-');

  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: 'Exportar a Excel (CSV)',
    defaultPath: `${base}-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'Archivo CSV', extensions: ['csv'] }],
  });

  if (canceled || !filePath) return { cancelado: true };
  fs.writeFileSync(filePath, contenido, 'utf8');
  return { cancelado: false, ruta: filePath, filas: filas.length };
}

function abrirEnExplorador(ruta) {
  if (ruta) shell.showItemInFolder(ruta);
  return true;
}

module.exports = { exportar, abrirEnExplorador };
