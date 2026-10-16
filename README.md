# Fluxo

Sistema de gestión comercial de escritorio para Windows: **cotizaciones, facturación,
clientes, asesores, recaudos y panel de crecimiento**.

Aplicación 100 % local (no requiere internet ni servidor): la base de datos vive en el
equipo del usuario y se respalda automáticamente.

---

## 1. Para el usuario final (usar la aplicación)

Hay dos archivos listos en la carpeta `dist\`:

| Archivo | Qué es | Cómo se usa |
|---|---|---|
| `Fluxo-Portable-1.0.0.exe` | Versión portátil | Doble clic y listo. No instala nada. |
| `Fluxo-Setup-1.0.0.exe` | Instalador | Doble clic, elegir carpeta, instalar. Crea accesos en el escritorio y el menú inicio. |

> **Aviso de Windows (SmartScreen).** Al ser una aplicación sin firma digital, la primera
> vez Windows puede mostrar "Windows protegió su PC". Hay que pulsar **Más información →
> Ejecutar de todas formas**. Es normal en programas recién compilados sin certificado de
> firma.

**Primer arranque.** Si la base está vacía aparece una pantalla de bienvenida con dos
opciones:

- **Cargar datos de demostración**: genera 15 meses de operación comercial (6 asesores,
  40 clientes, 30 productos, ~130 cotizaciones, ~57 facturas y sus pagos) para explorar el
  panel de crecimiento y la cartera de inmediato. Se puede borrar en **Ajustes**.
- **Empezar desde cero**: configurar la empresa y registrar datos reales.

### Dónde queda la información

- Base de datos: `%APPDATA%\Fluxo\data\fluxo.db`
- Respaldos automáticos: `%APPDATA%\Fluxo\respaldos` (se conservan los últimos 15)
- Desde el menú **Archivo** se puede respaldar, restaurar y abrir esas carpetas.

### Módulos

| Módulo | Qué permite |
|---|---|
| **Panel de crecimiento** | KPIs del mes y del año, tendencia de ventas (12 meses), cartera por cobrar con antigüedad de saldos, ranking de asesores, embudo de conversión, alertas y exportación a Excel (CSV) o PDF. |
| **Cotizaciones** | Numeración consecutiva `COT-AAAA-0001`, líneas con descuento por ítem e IVA, descuento global, estados (borrador/enviada/aprobada/convertida/rechazada/vencida), duplicar, avisos de cotizaciones estancadas y paso directo a factura. |
| **Facturas** | Consecutivo `FAC-AAAA-0001`, descuento global, retención en la fuente, descuento de inventario al emitir, saldo y estado automáticos (emitida/parcial/pagada/vencida/anulada), anulación con motivo. |
| **Recaudos** | Registro de pagos por factura (total o abono), métodos de pago, referencia y control de saldo. |
| **Clientes** | Ficha completa, cupo y días de crédito, asesor asignado, cartera por cliente e historial de cotizaciones y facturas. |
| **Asesores** | Zona, comisión, meta mensual, ranking e indicadores de cierre. |
| **Productos** | Catálogo de productos y servicios, categorías, precios, IVA, inventario mínimo y movimientos. |
| **Ajustes** | Datos de la empresa, moneda, IVA por defecto, consecutivos, respaldos y datos de demostración. |

Documentos en PDF: cotizaciones, facturas e informes se generan con el motor de impresión
de Electron (guardar como PDF, vista previa o enviar a impresora).

### Alcance tributario

La facturación es **de control interno** (Colombia, COP, IVA 19 % configurable). No incluye
timbrado ni transmisión a la DIAN.

---

## 2. Para el desarrollador

### Tecnología

- **Electron 44** + **Node.js 24** (sin Tauri, sin módulos nativos)
- **sql.js 1.15** (SQLite compilado a WebAssembly) → base SQLite real sin `node-gyp`
- Interfaz en HTML/CSS/JS sin frameworks y sin CDN; gráficas SVG propias
- PDF con el motor de impresión de Electron

### Comandos

```powershell
npm install          # dependencias
npm start            # ejecutar en desarrollo
npm run dist         # generar .exe portátil + instalador en dist\
npm run dist:portable
npm run dist:installer
```

> En este equipo `npm` debe invocarse como `& "C:\Program Files\nodejs\npm.cmd"` porque la
> política de ejecución de PowerShell bloquea `npm.ps1`.

### Estructura

```
src/
  main/                    proceso principal (Node)
    main.js                arranque, ventana, menú, respaldos al cerrar
    preload.js             puente seguro (contextBridge)
    ipc.js                 registro de canales vp:* → { ok, data | error }
    db/
      database.js          capa sql.js (open/flush/all/get/run/transaction/backup)
      schema.js            DDL de las tablas
      demo.js              generador determinista de 15 meses de demostración
    lib/
      money.js             redondeo según decimales configurados, búsqueda, formato
      documento.js         motor de cálculo de totales (IVA, descuentos, retención)
      letras.js            importes en letras ("SON: ... PESOS M/CTE")
    repositories/          una capa por entidad (SQL + reglas de negocio)
      config · asesores · clientes · productos · cotizaciones · facturas ·
      pagos · dashboard
    services/
      documentoHtml.js     plantillas imprimibles de cotización/factura/informe
      pdf.js               guardar / previsualizar / imprimir
      csv.js               exportación a Excel (CSV)
      backup.js            respaldos manuales y automáticos
  renderer/                interfaz (sin Node)
    index.html             CSP estricta y carga de scripts
    styles/app.css
    js/  utils · api · ui · charts · app
    views/  documento · panel · cotizaciones · facturas · recaudos ·
            clientes · asesores · productos · ajustes
build/
  generar-icono.js         genera icon.png/icon.ico (solo zlib, sin dependencias)
  icon.png · icon.ico
```

### Decisiones de diseño

- **Cálculo de dinero en el proceso principal.** El renderer nunca envía totales: manda
  líneas y el `lib/documento.js` calcula. Pantalla, PDF y base de datos siempre coinciden.
- **Sin módulos nativos.** sql.js (WASM) evita recompilar contra Electron y hace que el
  `.exe` sea portable y reproducible.
- **`contextIsolation` activo** y CSP estricta: la interfaz no tiene acceso a Node.
- **Fechas y estados.** Al abrir la aplicación se recalculan los estados que dependen de la
  fecha (facturas vencidas, cotizaciones vencidas).
- **Persistencia diferida.** La base se mantiene en memoria y se vuelca a disco con
  *debounce* + volcado síncrono al cerrar y al respaldar (escritura atómica tmp + rename).

### Pruebas

Los canales IPC son la única puerta al proceso principal, por lo que se pueden probar sin
interfaz. Verificaciones realizadas sobre este proyecto:

- `node --check` sobre todos los archivos de `src/` y `build/` (0 errores).
- Integración headless del proceso principal: datos demo, coherencia de totales
  (factura vs. líneas recalculadas), dashboard, cartera por cliente, flujo
  cotización → factura → pago parcial → pago total (Parcial/Pagada), rechazo de
  sobrepago, anulación, HTML de documento, persistencia tras reabrir.
- Prueba de humo del renderer con Electron real: arranque, 8 vistas montadas sin errores de
  consola, navegación, gráficas SVG y apertura del editor de cotización.
- Comprobación estática: toda llamada `VP.api.*` de las vistas existe en `api.js` y todos
  los canales de `api.js` existen en `ipc.js`.
- Arranque de la versión empaquetada (`dist\win-unpacked\Fluxo.exe`) y del `.exe`
  portátil.
