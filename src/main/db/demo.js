'use strict';

const db = require('./database');
const config = require('../repositories/config');
const asesores = require('../repositories/asesores');
const clientes = require('../repositories/clientes');
const productos = require('../repositories/productos');
const cotizaciones = require('../repositories/cotizaciones');
const facturas = require('../repositories/facturas');
const pagos = require('../repositories/pagos');
const { addDays } = require('../lib/documento');

/*
 * Generador de datos de demostracion.
 *
 * Reproduce 15 meses de operacion comercial (con tendencia creciente) para
 * que el panel de crecimiento y la cartera tengan informacion real con la
 * que trabajar. El generador es determinista: la misma semilla produce
 * siempre los mismos datos.
 */

function crearAleatorio(semilla) {
  let a = semilla >>> 0;
  return function aleatorio() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rnd = crearAleatorio(20260115);

function entero(min, max) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

function elegir(lista) {
  return lista[Math.floor(rnd() * lista.length)];
}

function ponderado(opciones) {
  const total = opciones.reduce((acc, o) => acc + o.peso, 0);
  let marca = rnd() * total;
  for (const o of opciones) {
    marca -= o.peso;
    if (marca <= 0) return o.valor;
  }
  return opciones[opciones.length - 1].valor;
}

function redondear(n, paso = 1000) {
  return Math.round(n / paso) * paso;
}

/* -------------------------------------------------------------------- */
/* Catalogos base                                                        */
/* -------------------------------------------------------------------- */

const ASESORES = [
  { nombre: 'Laura Restrepo', zona: 'Bogota', comision: 3.5, meta: 95_000_000 },
  { nombre: 'Carlos Mendoza', zona: 'Antioquia', comision: 3.0, meta: 85_000_000 },
  { nombre: 'Daniela Ospina', zona: 'Valle', comision: 4.0, meta: 80_000_000 },
  { nombre: 'Andres Villalba', zona: 'Costa Caribe', comision: 3.2, meta: 70_000_000 },
  { nombre: 'Marcela Quintero', zona: 'Santanderes', comision: 3.8, meta: 65_000_000 },
  { nombre: 'Julian Castano', zona: 'Eje Cafetero', comision: 2.8, meta: 55_000_000 },
];

const CATEGORIAS = [
  { nombre: 'Equipos de computo', descripcion: 'Portatiles, equipos de escritorio y servidores' },
  { nombre: 'Redes y conectividad', descripcion: 'Switches, access points y cableado estructurado' },
  { nombre: 'Software y licencias', descripcion: 'Licenciamiento y suscripciones anuales' },
  { nombre: 'Servicios profesionales', descripcion: 'Implementacion, soporte y capacitacion' },
  { nombre: 'Consumibles y accesorios', descripcion: 'Toners, cables, perifericos' },
];

const PRODUCTOS = [
  { nombre: 'Portatil empresarial 14" i5 16GB', cat: 0, tipo: 'Producto', unidad: 'UND', precio: 4_850_000, costo: 3_620_000, stock: 42, minima: 8 },
  { nombre: 'Portatil empresarial 15" i7 32GB', cat: 0, tipo: 'Producto', unidad: 'UND', precio: 7_950_000, costo: 6_100_000, stock: 26, minima: 5 },
  { nombre: 'Estacion de trabajo profesional', cat: 0, tipo: 'Producto', unidad: 'UND', precio: 12_400_000, costo: 9_850_000, stock: 9, minima: 3 },
  { nombre: 'Monitor 27" 4K IPS', cat: 0, tipo: 'Producto', unidad: 'UND', precio: 1_680_000, costo: 1_180_000, stock: 64, minima: 12 },
  { nombre: 'Servidor torre Xeon 32GB', cat: 0, tipo: 'Producto', unidad: 'UND', precio: 18_900_000, costo: 15_200_000, stock: 5, minima: 2 },
  { nombre: 'Impresora multifuncional laser', cat: 0, tipo: 'Producto', unidad: 'UND', precio: 2_350_000, costo: 1_720_000, stock: 18, minima: 4 },
  { nombre: 'Switch administrable 48 puertos', cat: 1, tipo: 'Producto', unidad: 'UND', precio: 6_400_000, costo: 4_800_000, stock: 14, minima: 3 },
  { nombre: 'Access point WiFi 6 empresarial', cat: 1, tipo: 'Producto', unidad: 'UND', precio: 1_250_000, costo: 890_000, stock: 55, minima: 10 },
  { nombre: 'Router perimetral con firewall UTM', cat: 1, tipo: 'Producto', unidad: 'UND', precio: 8_900_000, costo: 6_950_000, stock: 11, minima: 2 },
  { nombre: 'Punto de red cableado categoría 6A', cat: 1, tipo: 'Servicio', unidad: 'PTO', precio: 185_000, costo: 96_000, stock: 0, minima: 0 },
  { nombre: 'Certificacion de red e informe tecnico', cat: 1, tipo: 'Servicio', unidad: 'SRV', precio: 1_450_000, costo: 620_000, stock: 0, minima: 0 },
  { nombre: 'Licencia ofimatica empresarial 3 anos', cat: 2, tipo: 'Producto', unidad: 'LIC', precio: 1_890_000, costo: 1_280_000, stock: 120, minima: 20 },
  { nombre: 'Licencia antivirus corporativo 1 ano', cat: 2, tipo: 'Producto', unidad: 'LIC', precio: 780_000, costo: 430_000, stock: 210, minima: 30 },
  { nombre: 'Suscripcion ERP modulo ventas', cat: 2, tipo: 'Servicio', unidad: 'MES', precio: 3_200_000, costo: 1_400_000, stock: 0, minima: 0 },
  { nombre: 'Backup en nube 1TB empresarial', cat: 2, tipo: 'Servicio', unidad: 'MES', precio: 640_000, costo: 240_000, stock: 0, minima: 0 },
  { nombre: 'Implementacion de infraestructura', cat: 3, tipo: 'Servicio', unidad: 'SRV', precio: 14_500_000, costo: 8_900_000, stock: 0, minima: 0 },
  { nombre: 'Migracion de correo corporativo', cat: 3, tipo: 'Servicio', unidad: 'SRV', precio: 5_600_000, costo: 2_950_000, stock: 0, minima: 0 },
  { nombre: 'Soporte tecnico mensual premium', cat: 3, tipo: 'Servicio', unidad: 'MES', precio: 2_850_000, costo: 1_350_000, stock: 0, minima: 0 },
  { nombre: 'Capacitacion de usuarios finales', cat: 3, tipo: 'Servicio', unidad: 'HRS', precio: 220_000, costo: 110_000, stock: 0, minima: 0 },
  { nombre: 'Auditoria de seguridad informatica', cat: 3, tipo: 'Servicio', unidad: 'SRV', precio: 9_800_000, costo: 5_200_000, stock: 0, minima: 0 },
  { nombre: 'Toners y repuestos originales', cat: 4, tipo: 'Producto', unidad: 'UND', precio: 395_000, costo: 240_000, stock: 180, minima: 40 },
  { nombre: 'Diadema con microfono profesional', cat: 4, tipo: 'Producto', unidad: 'UND', precio: 320_000, costo: 190_000, stock: 96, minima: 20 },
  { nombre: 'Teclado y mouse inalambrico', cat: 4, tipo: 'Producto', unidad: 'UND', precio: 185_000, costo: 98_000, stock: 140, minima: 30 },
  { nombre: 'Disco SSD 1TB NVMe', cat: 4, tipo: 'Producto', unidad: 'UND', precio: 520_000, costo: 340_000, stock: 74, minima: 15 },
  { nombre: 'UPS regulador 1500VA', cat: 4, tipo: 'Producto', unidad: 'UND', precio: 890_000, costo: 610_000, stock: 33, minima: 8 },
  { nombre: 'Camara de videovigilancia IP', cat: 4, tipo: 'Producto', unidad: 'UND', precio: 745_000, costo: 470_000, stock: 48, minima: 10 },
  { nombre: 'Base de datos gestionada 8GB', cat: 2, tipo: 'Servicio', unidad: 'MES', precio: 1_150_000, costo: 520_000, stock: 0, minima: 0 },
  { nombre: 'Consultoria en transformacion digital', cat: 3, tipo: 'Servicio', unidad: 'HRS', precio: 340_000, costo: 165_000, stock: 0, minima: 0 },
  { nombre: 'Telefonia IP central conmutada', cat: 1, tipo: 'Servicio', unidad: 'SRV', precio: 11_200_000, costo: 6_400_000, stock: 0, minima: 0 },
  { nombre: 'Plan de mantenimiento preventivo', cat: 3, tipo: 'Servicio', unidad: 'MES', precio: 1_950_000, costo: 860_000, stock: 0, minima: 0 },
];

const CLIENTES = [
  ['Distribuciones La Montana S.A.S.', 'Bogota', 'Cundinamarca', 'Mariana Gil'],
  ['Transportes del Oriente S.A.', 'Bucaramanga', 'Santander', 'Oscar Prada'],
  ['Clinica San Rafael', 'Medellin', 'Antioquia', 'Paula Arango'],
  ['Constructora Vertice Ltda.', 'Cali', 'Valle del Cauca', 'Jorge Salcedo'],
  ['Alimentos del Caribe S.A.S.', 'Barranquilla', 'Atlantico', 'Yeimy Barrios'],
  ['Ferreteria Central', 'Pereira', 'Risaralda', 'Hugo Marin'],
  ['Colegio Nueva Esperanza', 'Bogota', 'Cundinamarca', 'Rectora Ana Ruiz'],
  ['Hotel Costa Azul', 'Cartagena', 'Bolivar', 'Luis Bettin'],
  ['Agroindustrias del Sur', 'Ibague', 'Tolima', 'Diana Perdomo'],
  ['Estudio Contable Ramirez & Asociados', 'Bogota', 'Cundinamarca', 'Camilo Ramirez'],
  ['Supermercados El Ahorro', 'Manizales', 'Caldas', 'Sandra Ocampo'],
  ['Empresa de Energia Regional', 'Medellin', 'Antioquia', 'Felipe Gaviria'],
  ['Logistica Integral Andina', 'Bogota', 'Cundinamarca', 'Nubia Cardenas'],
  ['Laboratorios Farma Vida', 'Cali', 'Valle del Cauca', 'Ricardo Londono'],
  ['Universidad Tecnologica del Norte', 'Barranquilla', 'Atlantico', 'Carolina Pineda'],
  ['Muebles y Diseno Moderno', 'Bucaramanga', 'Santander', 'Alvaro Estupinan'],
  ['Seguridad Privada Elite', 'Bogota', 'Cundinamarca', 'Tatiana Mora'],
  ['Turismo Aventura Colombia', 'Santa Marta', 'Magdalena', 'Kevin Rojas'],
  ['Metalurgica del Pacifico', 'Buenaventura', 'Valle del Cauca', 'Gloria Mina'],
  ['Textiles Sabaneta', 'Medellin', 'Antioquia', 'Ivan Zapata'],
  ['Comercializadora El Trigal', 'Pereira', 'Risaralda', 'Sonia Vargas'],
  ['Servicios Petroleros Llanos', 'Villavicencio', 'Meta', 'German Cely'],
  ['Farmacia San Jorge', 'Cucuta', 'Norte de Santander', 'Erika Pabon'],
  ['Ingenieria Civil Aplicada', 'Neiva', 'Huila', 'Mauricio Tovar'],
  ['Banca y Finanzas del Sur', 'Popayan', 'Cauca', 'Angela Munoz'],
  ['Panaderia La Espiga Dorada', 'Bogota', 'Cundinamarca', 'Rafael Pena'],
  ['Hospital Infantil del Caribe', 'Cartagena', 'Bolivar', 'Yolanda Diaz'],
  ['Aseguradora Confianza Total', 'Medellin', 'Antioquia', 'Sebastian Arias'],
  ['Molinos del Occidente', 'Cali', 'Valle del Cauca', 'Beatriz Lozano'],
  ['Consultoria Juridica Ortega', 'Bogota', 'Cundinamarca', 'Natalia Ortega'],
  ['Droguerias Vida Sana', 'Bucaramanga', 'Santander', 'Pedro Contreras'],
  ['Autopartes El Motor', 'Barranquilla', 'Atlantico', 'Wendy Aguirre'],
  ['Cementos del Tolima', 'Ibague', 'Tolima', 'Fabian Rueda'],
  ['Cafeterias Juan Valdito Franquicia', 'Manizales', 'Caldas', 'Lina Cardona'],
  ['Red de Servicios Tecnicos SAS', 'Bogota', 'Cundinamarca', 'Diego Fajardo'],
  ['Importadora Pacifico Norte', 'Buenaventura', 'Valle del Cauca', 'Rocio Perlaza'],
  ['Gimnasios Energia Total', 'Pereira', 'Risaralda', 'Cristian Marin'],
  ['Editorial Saberes', 'Medellin', 'Antioquia', 'Monica Restrepo'],
  ['Transportadora Carga Segura', 'Villavicencio', 'Meta', 'Jhon Ariza'],
  ['Industria Lactea del Altiplano', 'Pastor', 'Narino', 'Marco Benavides'],
];

/* -------------------------------------------------------------------- */
/* Generacion                                                            */
/* -------------------------------------------------------------------- */

function limpiar() {
  return db.transaction(() => {
    for (const tabla of [
      'movimientos_inventario',
      'pagos',
      'factura_items',
      'facturas',
      'cotizacion_items',
      'cotizaciones',
      'productos',
      'categorias',
      'clientes',
      'asesores',
      'config',
    ]) {
      db.run(`DELETE FROM ${tabla}`);
    }
    return true;
  });
}

function estaVacia() {
  const row = db.get(
    `SELECT (SELECT COUNT(*) FROM clientes) + (SELECT COUNT(*) FROM productos)
          + (SELECT COUNT(*) FROM cotizaciones) + (SELECT COUNT(*) FROM facturas) AS total`,
  );
  return Number(row?.total || 0) === 0;
}

/**
 * Carga el juego de datos de demostracion.
 * @param {object} opciones { meses, reiniciar }
 */
function cargar({ meses = 15, reiniciar = false } = {}) {
  if (reiniciar) limpiar();

  // 1. Configuracion de la empresa
  config.setMany({
    empresa_nombre: 'Soluciones Integrales Andina S.A.S.',
    empresa_nit: '901.458.732',
    empresa_dv: '4',
    empresa_direccion: 'Calle 93 No. 15-20, Oficina 501',
    empresa_ciudad: 'Bogota D.C.',
    empresa_departamento: 'Cundinamarca',
    empresa_telefono: '+57 601 742 8890',
    empresa_email: 'comercial@andina.com.co',
    empresa_web: 'www.andina.com.co',
    meta_anual: String(1_200_000_000),
    meta_mensual_global: '',
  });

  // 2. Asesores
  const listaAsesores = ASESORES.map((a, i) => {
    const anioIngreso = 2018 + (i % 6);
    return asesores.save({
      nombre: a.nombre,
      codigo: `ASE-${String(i + 1).padStart(3, '0')}`,
      documento: String(1_020_000_000 + i * 135_791),
      email: `${a.nombre.split(' ')[0].toLowerCase()}.${a.nombre.split(' ')[1].toLowerCase()}@andina.com.co`,
      telefono: `+57 31${i} ${entero(300, 899)} ${entero(1000, 9999)}`,
      zona: a.zona,
      comision_pct: a.comision,
      meta_mensual: a.meta,
      fecha_ingreso: `${anioIngreso}-0${entero(1, 9)}-1${entero(0, 9)}`,
      activo: true,
      notas: 'Asesor con cartera asignada.',
    });
  });

  // 3. Categorias y productos
  const listaCategorias = CATEGORIAS.map((c) => productos.categorias.save(c));
  const listaProductos = PRODUCTOS.map((p, i) =>
    productos.save({
      codigo: `${p.tipo === 'Servicio' ? 'SRV' : 'PRD'}-${String(i + 1).padStart(4, '0')}`,
      nombre: p.nombre,
      descripcion: p.nombre,
      categoria_id: listaCategorias[p.cat].id,
      tipo: p.tipo,
      unidad: p.unidad,
      precio: p.precio,
      iva_pct: 19,
      costo: p.costo,
      stock: p.stock,
      stock_minimo: p.minima,
      activo: true,
    }),
  );

  // 4. Clientes
  const listaClientes = CLIENTES.map((c, i) => {
    const [nombre, ciudad, departamento, contacto] = c;
    const asesor = listaAsesores[i % listaAsesores.length];
    const primero = contacto.split(' ')[0].toLowerCase();
    const segundo = (contacto.split(' ')[1] || 'contacto').toLowerCase();
    return clientes.save({
      codigo: `CLI-${String(i + 1).padStart(4, '0')}`,
      tipo_persona: nombre.includes('S.A') || nombre.includes('Ltda') || nombre.includes('SAS') ? 'Juridica' : 'Juridica',
      tipo_documento: 'NIT',
      nit: `9${String(i).padStart(2, '0')}.${entero(100, 999)}.${entero(100, 999)}`,
      dv: String(entero(0, 9)),
      nombre,
      nombre_comercial: nombre,
      contacto,
      email: `${primero}.${segundo}@correo.com.co`,
      telefono: `+57 60${entero(1, 8)} ${entero(300, 699)} ${entero(1000, 9999)}`,
      direccion: `Carrera ${entero(7, 98)} No. ${entero(10, 89)}-${entero(10, 99)}`,
      ciudad,
      departamento,
      regimen: 'Responsable de IVA',
      asesor_id: asesor.id,
      cupo_credito: redondear(entero(20, 250) * 1_000_000, 1_000_000),
      dias_credito: elegir([0, 15, 30, 30, 45, 60]),
      activo: true,
      notas: '',
    });
  });

  // 5. Cotizaciones, facturas y pagos por mes
  const hoy = db.today();
  const [anioHoy, mesHoy] = hoy.split('-').map(Number);
  const mesesLista = [];
  for (let i = meses - 1; i >= 0; i -= 1) {
    const base = new Date(Date.UTC(anioHoy, mesHoy - 1 - i, 1));
    mesesLista.push({
      anio: base.getUTCFullYear(),
      mes: base.getUTCMonth() + 1,
      indice: meses - 1 - i,
    });
  }

  const estados = [
    { peso: 40, valor: 'Convertida' },
    { peso: 10, valor: 'Aprobada' },
    { peso: 8, valor: 'Borrador' },
    { peso: 14, valor: 'Enviada' },
    { peso: 16, valor: 'Rechazada' },
    { peso: 12, valor: 'Vencida' },
  ];

  const resumen = { cotizaciones: 0, facturas: 0, pagos: 0 };

  for (const { anio, mes, indice } of mesesLista) {
    const esMesActual = anio === anioHoy && mes === mesHoy;
    const crecimiento = 0.72 + indice * 0.026;
    const cantidad = Math.max(4, Math.round(entero(7, 13) * crecimiento));

    for (let k = 0; k < cantidad; k += 1) {
      const cliente = elegir(listaClientes);
      const asesor = listaAsesores.find((a) => a.id === cliente.asesor_id) || elegir(listaAsesores);

      const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
      const dia = Math.min(diasMes, entero(1, Math.max(1, diasMes - 1)));
      const fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      if (fecha > hoy) continue;

      const nItems = entero(1, 4);
      const items = [];
      const usados = new Set();
      for (let j = 0; j < nItems; j += 1) {
        const producto = elegir(listaProductos);
        if (usados.has(producto.id)) continue;
        usados.add(producto.id);
        const cantidadItem = producto.tipo === 'Servicio' ? entero(1, 3) : entero(1, 12);
        items.push({
          producto_id: producto.id,
          codigo: producto.codigo,
          descripcion: producto.nombre,
          unidad: producto.unidad,
          cantidad: cantidadItem,
          precio_unitario: producto.precio,
          descuento_pct: ponderado([
            { peso: 55, valor: 0 },
            { peso: 25, valor: 5 },
            { peso: 12, valor: 8 },
            { peso: 8, valor: 10 },
          ]),
          iva_pct: 19,
        });
      }
      if (!items.length) continue;

      let estado = ponderado(estados);
      if (esMesActual && ['Convertida', 'Vencida'].includes(estado)) estado = elegir(['Aprobada', 'Enviada', 'Borrador']);

      const cotizacion = cotizaciones.save({
        cliente_id: cliente.id,
        asesor_id: asesor.id,
        fecha,
        validez_dias: elegir([15, 30, 30, 45]),
        estado,
        descuento_pct: ponderado([{ peso: 70, valor: 0 }, { peso: 22, valor: 3 }, { peso: 8, valor: 5 }]),
        condicion_pago: elegir(['Contado', 'Credito 30 dias', 'Credito 45 dias', 'Credito 60 dias']),
        observaciones: 'Condiciones acordadas con el area de compras del cliente.',
        items,
      });
      resumen.cotizaciones += 1;

      if (estado === 'Rechazada') {
        cotizaciones.cambiarEstado(cotizacion.id, 'Rechazada', elegir([
          'Precio por encima del presupuesto',
          'Seleccionaron otro proveedor',
          'Proyecto aplazado por el cliente',
        ]));
        continue;
      }

      if (!['Convertida', 'Aprobada'].includes(estado)) continue;

      // Facturacion: dias despues de la cotizacion
      const fechaFactura = addDays(fecha, entero(2, 22));
      if (fechaFactura > hoy) continue;

      const diasCredito = elegir([0, 30, 30, 45, 60]);
      const retencion = ponderado([{ peso: 65, valor: 0 }, { peso: 35, valor: 2.5 }]);

      let factura;
      try {
        factura = facturas.save({
          cotizacion_id: cotizacion.id,
          cliente_id: cliente.id,
          asesor_id: asesor.id,
          fecha: fechaFactura,
          fecha_vencimiento: addDays(fechaFactura, diasCredito),
          descuento_pct: cotizacion.descuento_pct,
          retencion_pct: retencion,
          forma_pago: diasCredito === 0 ? 'Contado' : 'Transferencia',
          observaciones: 'Factura generada desde la cotizacion aprobada.',
          items: cotizacion.items,
        });
      } catch {
        continue;
      }
      resumen.facturas += 1;

      // Recaudo
      const perfil = ponderado([
        { peso: 62, valor: 'total' },
        { peso: 15, valor: 'parcial' },
        { peso: 23, valor: 'nada' },
      ]);

      if (perfil === 'total') {
        const restante = Number(factura.total);
        const cuotas = ponderado([{ peso: 70, valor: 1 }, { peso: 30, valor: 2 }]);
        let acumulado = 0;
        for (let c = 0; c < cuotas; c += 1) {
          const esUltima = c === cuotas - 1;
          const monto = esUltima ? restante - acumulado : redondear((restante / cuotas) * (0.5 + rnd() * 0.3));
          if (monto <= 0) continue;
          acumulado += monto;
          pagos.save({
            factura_id: factura.id,
            fecha: addDays(fechaFactura, entero(1, 45)),
            monto,
            metodo: elegir(['Transferencia', 'Transferencia', 'Efectivo', 'Tarjeta', 'Cheque']),
            referencia: `RC-${entero(10000, 99999)}`,
            notas: '',
          });
          resumen.pagos += 1;
        }
        if (acumulado < restante) {
          pagos.save({
            factura_id: factura.id,
            fecha: addDays(fechaFactura, entero(10, 50)),
            monto: restante - acumulado,
            metodo: 'Transferencia',
            referencia: `RC-${entero(10000, 99999)}`,
            notas: 'Pago final',
          });
          resumen.pagos += 1;
        }
      } else if (perfil === 'parcial') {
        const abono = redondear(Number(factura.total) * (0.25 + rnd() * 0.45));
        if (abono > 0 && abono < Number(factura.total)) {
          pagos.save({
            factura_id: factura.id,
            fecha: addDays(fechaFactura, entero(5, 40)),
            monto: abono,
            metodo: elegir(['Transferencia', 'Efectivo']),
            referencia: `RC-${entero(10000, 99999)}`,
            notas: 'Abono parcial',
          });
          resumen.pagos += 1;
        }
      }
    }
  }

  // Cerrar estados coherentes al dia de hoy
  cotizaciones.marcarVencidas();
  facturas.refrescarEstados();

  // Ajustar stock: descontar lo vendido para dejar el inventario en numeros creibles
  for (const producto of listaProductos) {
    const vendido = db.get(
      `SELECT COALESCE(SUM(i.cantidad), 0) AS total FROM factura_items i
         JOIN facturas f ON f.id = i.factura_id
        WHERE i.producto_id = ? AND f.estado <> 'Anulada'`,
      [producto.id],
    );
    if (!vendido || !Number(vendido.total)) continue;
    const actual = db.get('SELECT stock FROM productos WHERE id = ?', [producto.id]);
    const nuevo = Math.max(3, Math.round(Number(actual.stock) * 1.6 - Number(vendido.total) * 0.35));
    db.run('UPDATE productos SET stock = ?, updated_at = ? WHERE id = ?', [nuevo, db.now(), producto.id]);
  }

  db.flush();

  return {
    asesores: listaAsesores.length,
    categorias: listaCategorias.length,
    productos: listaProductos.length,
    clientes: listaClientes.length,
    ...resumen,
  };
}

module.exports = { cargar, limpiar, estaVacia };
