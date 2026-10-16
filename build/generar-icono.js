'use strict';

/**
 * Generador del icono de la aplicacion.
 *
 * Dibuja el logotipo (cuadrado redondeado con degradado y tres barras
 * ascendentes) y produce build/icon.png y build/icon.ico sin depender de
 * ninguna libreria externa: PNG hecho a mano con zlib y empaquetado ICO.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

/* -------------------------------------------------------------------- */
/* CRC32 / PNG                                                           */
/* -------------------------------------------------------------------- */

const TABLA_CRC = (() => {
  const tabla = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c;
  }
  return tabla;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = TABLA_CRC[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length, 0);
  const cuerpo = Buffer.concat([Buffer.from(tipo, 'ascii'), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Codifica un buffer RGBA en PNG. */
function aPng(ancho, alto, rgba) {
  const firma = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; // profundidad de bits
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const filas = Buffer.alloc((ancho * 4 + 1) * alto);
  for (let y = 0; y < alto; y += 1) {
    filas[y * (ancho * 4 + 1)] = 0;
    rgba.copy(filas, y * (ancho * 4 + 1) + 1, y * ancho * 4, (y + 1) * ancho * 4);
  }

  return Buffer.concat([
    firma,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(filas, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* -------------------------------------------------------------------- */
/* Dibujo                                                                */
/* -------------------------------------------------------------------- */

const MEZCLA = (a, b, t) => a + (b - a) * t;

// Barra: [x0, x1, y0, y1, opacidad]
const BARRAS = [
  [0.215, 0.360, 0.555, 0.785, 1.0],
  [0.427, 0.572, 0.375, 0.785, 0.88],
  [0.639, 0.784, 0.215, 0.785, 0.74],
];

const RADIO_BARRA = 0.032;

function dentroRectanguloRedondeado(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

/** Renderiza el icono a un tamano dado y devuelve RGBA. */
function renderizar(tamano) {
  const buffer = Buffer.alloc(tamano * tamano * 4);
  const muestras = 4; // supersampling por eje
  const radioFondo = 0.225;

  for (let py = 0; py < tamano; py += 1) {
    for (let px = 0; px < tamano; px += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < muestras; sy += 1) {
        for (let sx = 0; sx < muestras; sx += 1) {
          const x = (px + (sx + 0.5) / muestras) / tamano;
          const y = (py + (sy + 0.5) / muestras) / tamano;

          if (!dentroRectanguloRedondeado(x, y, 0, 0, 1, 1, radioFondo)) continue;

          const t = Math.min(1, Math.max(0, (x * 0.42 + y * 0.72)));
          let cr = MEZCLA(0x3b, 0x1e, t);
          let cg = MEZCLA(0x82, 0x3a, t);
          let cb = MEZCLA(0xf6, 0x8a, t);

          for (const [x0, x1, y0, y1, opacidad] of BARRAS) {
            if (dentroRectanguloRedondeado(x, y, x0, y0, x1, y1, RADIO_BARRA)) {
              cr = cr + (255 - cr) * opacidad;
              cg = cg + (255 - cg) * opacidad;
              cb = cb + (255 - cb) * opacidad;
            }
          }

          r += cr;
          g += cg;
          b += cb;
          a += 255;
        }
      }

      const total = muestras * muestras;
      const indice = (py * tamano + px) * 4;
      const alfa = a / total;
      if (alfa <= 0) continue;

      // Deshacer el premultiplicado implicito del promedio.
      const factor = a / 255;
      buffer[indice] = Math.round(r / factor);
      buffer[indice + 1] = Math.round(g / factor);
      buffer[indice + 2] = Math.round(b / factor);
      buffer[indice + 3] = Math.round(alfa);
    }
  }

  return buffer;
}

/* -------------------------------------------------------------------- */
/* Empaquetado ICO                                                       */
/* -------------------------------------------------------------------- */

function aIco(imagenes) {
  const cabecera = Buffer.alloc(6);
  cabecera.writeUInt16LE(0, 0);
  cabecera.writeUInt16LE(1, 2);
  cabecera.writeUInt16LE(imagenes.length, 4);

  const directorio = Buffer.alloc(16 * imagenes.length);
  let offset = 6 + directorio.length;

  imagenes.forEach((imagen, i) => {
    const base = i * 16;
    directorio[base] = imagen.tamano >= 256 ? 0 : imagen.tamano;
    directorio[base + 1] = imagen.tamano >= 256 ? 0 : imagen.tamano;
    directorio[base + 2] = 0;
    directorio[base + 3] = 0;
    directorio.writeUInt16LE(1, base + 4);
    directorio.writeUInt16LE(32, base + 6);
    directorio.writeUInt32LE(imagen.png.length, base + 8);
    directorio.writeUInt32LE(offset, base + 12);
    offset += imagen.png.length;
  });

  return Buffer.concat([cabecera, directorio, ...imagenes.map((i) => i.png)]);
}

/* -------------------------------------------------------------------- */
/* Ejecucion                                                             */
/* -------------------------------------------------------------------- */

function principal() {
  const destino = path.join(__dirname);
  fs.mkdirSync(destino, { recursive: true });

  const grande = renderizar(512);
  fs.writeFileSync(path.join(destino, 'icon.png'), aPng(512, 512, grande));

  const tamanos = [16, 24, 32, 48, 64, 128, 256];
  const imagenes = tamanos.map((tamano) => ({
    tamano,
    png: aPng(tamano, tamano, renderizar(tamano)),
  }));

  fs.writeFileSync(path.join(destino, 'icon.ico'), aIco(imagenes));

  console.log('Iconos generados:');
  console.log(`  ${path.join(destino, 'icon.png')}`);
  console.log(`  ${path.join(destino, 'icon.ico')} (${tamanos.join(', ')} px)`);
}

principal();
