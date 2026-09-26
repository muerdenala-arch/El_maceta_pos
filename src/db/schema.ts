/**
 * Esquema de base de datos (sección 9 del plan de trabajo).
 *
 * Reglas:
 * - Montos siempre en NUMERIC(12,2), nunca float.
 * - Ventas, gastos y cierres no se borran: se anulan con motivo.
 * - La bodega central es una fila de `sucursales` con tipo = 'bodega';
 *   así inventario, lotes y transferencias usan una sola columna de ubicación.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const dinero = (nombre: string) => numeric(nombre, { precision: 12, scale: 2 });
const creadoEn = () => timestamp("creado_en", { withTimezone: true }).notNull().defaultNow();

// ---------- Enums ----------

export const rolEnum = pgEnum("rol", ["admin", "cajero"]);
export const tipoUbicacionEnum = pgEnum("tipo_ubicacion", ["sucursal", "bodega"]);
export const tamanoImpresionEnum = pgEnum("tamano_impresion", ["58mm", "80mm", "carta"]);
export const tipoMovimientoEnum = pgEnum("tipo_movimiento", [
  "ingreso",
  "venta",
  "transferencia_salida",
  "transferencia_entrada",
  "ajuste",
  "anulacion",
]);
export const estadoTransferenciaEnum = pgEnum("estado_transferencia", [
  "enviada",
  "recibida",
  "cancelada",
]);
export const estadoCajaEnum = pgEnum("estado_caja", ["abierta", "cerrada"]);
export const metodoPagoEnum = pgEnum("metodo_pago", ["efectivo", "qr"]);
export const estadoPagoEnum = pgEnum("estado_pago", ["pagado", "qr_por_confirmar"]);
export const estadoVentaEnum = pgEnum("estado_venta", ["completada", "anulada"]);
export const tipoPromocionEnum = pgEnum("tipo_promocion", ["porcentaje", "monto_fijo", "combo"]);
export const alcancePromocionEnum = pgEnum("alcance_promocion", [
  "todo",
  "producto",
  "categoria",
  "sucursal",
]);
export const tipoAlertaEnum = pgEnum("tipo_alerta", [
  "stock_bajo",
  "agotado",
  "por_vencer",
  "caja_diferencia",
  "stock_negativo",
  "qr_por_confirmar",
  "solicitud_reposicion",
]);

// ---------- Sucursales y usuarios ----------

export const sucursales = pgTable("sucursales", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  tipo: tipoUbicacionEnum("tipo").notNull().default("sucursal"),
  direccion: text("direccion"),
  telefono: varchar("telefono", { length: 30 }),
  encargado: varchar("encargado", { length: 120 }),
  tamanoImpresion: tamanoImpresionEnum("tamano_impresion").notNull().default("80mm"),
  activo: boolean("activo").notNull().default(true),
  creadoEn: creadoEn(),
});

export const usuarios = pgTable(
  "usuarios",
  {
    id: serial("id").primaryKey(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    usuario: varchar("usuario", { length: 50 }).notNull(),
    rol: rolEnum("rol").notNull(),
    pinHash: text("pin_hash").notNull(),
    sucursalId: integer("sucursal_id").references(() => sucursales.id),
    activo: boolean("activo").notNull().default(true),
    intentosFallidos: integer("intentos_fallidos").notNull().default(0),
    bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
    creadoEn: creadoEn(),
  },
  (t) => [uniqueIndex("usuarios_usuario_uq").on(t.usuario)],
);

// ---------- Catálogo ----------

export const categorias = pgTable("categorias", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 80 }).notNull().unique(),
});

export const productos = pgTable(
  "productos",
  {
    id: serial("id").primaryKey(),
    nombre: varchar("nombre", { length: 160 }).notNull(),
    marca: varchar("marca", { length: 80 }),
    categoriaId: integer("categoria_id").references(() => categorias.id),
    sabor: varchar("sabor", { length: 80 }),
    presentacion: varchar("presentacion", { length: 80 }),
    precioVenta: dinero("precio_venta").notNull(),
    precioCosto: dinero("precio_costo").notNull(),
    codigoBarras: varchar("codigo_barras", { length: 64 }),
    fotoUrl: text("foto_url"),
    stockMinimo: integer("stock_minimo").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex("productos_codigo_barras_uq")
      .on(t.codigoBarras)
      .where(sql`${t.codigoBarras} is not null`),
    index("productos_categoria_idx").on(t.categoriaId),
  ],
);

// ---------- Inventario ----------

export const inventario = pgTable(
  "inventario",
  {
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    ubicacionId: integer("ubicacion_id")
      .notNull()
      .references(() => sucursales.id),
    cantidad: integer("cantidad").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.productoId, t.ubicacionId] })],
);

export const lotes = pgTable(
  "lotes",
  {
    id: serial("id").primaryKey(),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    ubicacionId: integer("ubicacion_id")
      .notNull()
      .references(() => sucursales.id),
    cantidad: integer("cantidad").notNull(),
    fechaVencimiento: date("fecha_vencimiento"),
    creadoEn: creadoEn(),
  },
  (t) => [
    index("lotes_vencimiento_idx").on(t.fechaVencimiento),
    index("lotes_producto_ubicacion_idx").on(t.productoId, t.ubicacionId),
  ],
);

/** Parte de un lote que viaja en una transferencia (conserva la fecha de vencimiento). */
export type LoteEnTransito = { vencimiento: string | null; cantidad: number };

export const transferencias = pgTable("transferencias", {
  id: serial("id").primaryKey(),
  origenId: integer("origen_id")
    .notNull()
    .references(() => sucursales.id),
  destinoId: integer("destino_id")
    .notNull()
    .references(() => sucursales.id),
  estado: estadoTransferenciaEnum("estado").notNull().default("enviada"),
  usuarioEnviaId: integer("usuario_envia_id")
    .notNull()
    .references(() => usuarios.id),
  usuarioRecibeId: integer("usuario_recibe_id").references(() => usuarios.id),
  nota: text("nota"),
  enviadaEn: timestamp("enviada_en", { withTimezone: true }).notNull().defaultNow(),
  /** Fecha de recepción o de cancelación. */
  recibidaEn: timestamp("recibida_en", { withTimezone: true }),
});

export const detalleTransferencia = pgTable("detalle_transferencia", {
  id: serial("id").primaryKey(),
  transferenciaId: integer("transferencia_id")
    .notNull()
    .references(() => transferencias.id),
  productoId: integer("producto_id")
    .notNull()
    .references(() => productos.id),
  cantidad: integer("cantidad").notNull(),
  /** Lotes descontados del origen al enviar; se recrean en el destino al recibir. */
  lotes: jsonb("lotes").$type<LoteEnTransito[]>().notNull().default([]),
});

export const movimientosInventario = pgTable(
  "movimientos_inventario",
  {
    id: serial("id").primaryKey(),
    tipo: tipoMovimientoEnum("tipo").notNull(),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    ubicacionId: integer("ubicacion_id")
      .notNull()
      .references(() => sucursales.id),
    /** Positivo = entra stock, negativo = sale stock. */
    cantidad: integer("cantidad").notNull(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    motivo: text("motivo"),
    referencia: varchar("referencia", { length: 64 }),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("mov_fecha_idx").on(t.fecha),
    index("mov_producto_ubicacion_idx").on(t.productoId, t.ubicacionId),
  ],
);

// ---------- Caja, clientes y ventas ----------

export const cajas = pgTable(
  "cajas",
  {
    id: serial("id").primaryKey(),
    sucursalId: integer("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    cajeroId: integer("cajero_id")
      .notNull()
      .references(() => usuarios.id),
    montoInicial: dinero("monto_inicial").notNull(),
    apertura: timestamp("apertura", { withTimezone: true }).notNull().defaultNow(),
    cierre: timestamp("cierre", { withTimezone: true }),
    ventasEfectivo: dinero("ventas_efectivo"),
    ventasQr: dinero("ventas_qr"),
    gastos: dinero("gastos"),
    esperado: dinero("esperado"),
    efectivoContado: dinero("efectivo_contado"),
    diferencia: dinero("diferencia"),
    estado: estadoCajaEnum("estado").notNull().default("abierta"),
  },
  (t) => [
    // Solo una caja abierta por cajero.
    uniqueIndex("cajas_una_abierta_por_cajero_uq")
      .on(t.cajeroId)
      .where(sql`${t.estado} = 'abierta'`),
    index("cajas_sucursal_apertura_idx").on(t.sucursalId, t.apertura),
  ],
);

export const clientes = pgTable(
  "clientes",
  {
    id: serial("id").primaryKey(),
    nombre: varchar("nombre", { length: 120 }),
    telefono: varchar("telefono", { length: 30 }),
    fechaRegistro: creadoEn(),
  },
  (t) => [index("clientes_telefono_idx").on(t.telefono)],
);

export const ventas = pgTable(
  "ventas",
  {
    id: serial("id").primaryKey(),
    /** UUID generado en el dispositivo: clave de idempotencia para la sincronización offline. */
    uuidDispositivo: uuid("uuid_dispositivo").notNull(),
    numeroComprobante: integer("numero_comprobante").notNull(),
    sucursalId: integer("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    cajaId: integer("caja_id")
      .notNull()
      .references(() => cajas.id),
    cajeroId: integer("cajero_id")
      .notNull()
      .references(() => usuarios.id),
    clienteId: integer("cliente_id").references(() => clientes.id),
    subtotal: dinero("subtotal").notNull(),
    descuento: dinero("descuento").notNull().default("0"),
    total: dinero("total").notNull(),
    metodoPago: metodoPagoEnum("metodo_pago").notNull(),
    montoRecibido: dinero("monto_recibido"),
    cambio: dinero("cambio"),
    estadoPago: estadoPagoEnum("estado_pago").notNull().default("pagado"),
    cuponId: integer("cupon_id").references(() => cupones.id),
    pdfUrl: text("pdf_url"),
    /** Identificador aleatorio no adivinable para el enlace público del comprobante. */
    tokenPublico: varchar("token_publico", { length: 64 }).notNull(),
    estado: estadoVentaEnum("estado").notNull().default("completada"),
    motivoAnulacion: text("motivo_anulacion"),
    creadoOffline: boolean("creado_offline").notNull().default(false),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
    sincronizadoEn: timestamp("sincronizado_en", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ventas_uuid_dispositivo_uq").on(t.uuidDispositivo),
    uniqueIndex("ventas_token_publico_uq").on(t.tokenPublico),
    uniqueIndex("ventas_sucursal_numero_uq").on(t.sucursalId, t.numeroComprobante),
    index("ventas_fecha_idx").on(t.fecha),
    index("ventas_sucursal_fecha_idx").on(t.sucursalId, t.fecha),
    index("ventas_caja_idx").on(t.cajaId),
  ],
);

export const detalleVenta = pgTable(
  "detalle_venta",
  {
    id: serial("id").primaryKey(),
    ventaId: integer("venta_id")
      .notNull()
      .references(() => ventas.id),
    productoId: integer("producto_id")
      .notNull()
      .references(() => productos.id),
    cantidad: integer("cantidad").notNull(),
    precioUnitario: dinero("precio_unitario").notNull(),
    descuento: dinero("descuento").notNull().default("0"),
  },
  (t) => [
    index("detalle_venta_venta_idx").on(t.ventaId),
    index("detalle_venta_producto_idx").on(t.productoId),
  ],
);

export const gastos = pgTable(
  "gastos",
  {
    id: serial("id").primaryKey(),
    uuidDispositivo: uuid("uuid_dispositivo").notNull(),
    cajaId: integer("caja_id")
      .notNull()
      .references(() => cajas.id),
    sucursalId: integer("sucursal_id")
      .notNull()
      .references(() => sucursales.id),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuarios.id),
    categoria: varchar("categoria", { length: 60 }).notNull(),
    monto: dinero("monto").notNull(),
    descripcion: text("descripcion"),
    fotoUrl: text("foto_url"),
    anulado: boolean("anulado").notNull().default(false),
    motivoAnulacion: text("motivo_anulacion"),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("gastos_uuid_dispositivo_uq").on(t.uuidDispositivo),
    index("gastos_sucursal_fecha_idx").on(t.sucursalId, t.fecha),
  ],
);

// ---------- Promociones ----------

export const promociones = pgTable("promociones", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  tipo: tipoPromocionEnum("tipo").notNull(),
  /** Porcentaje (0-100) o monto fijo según `tipo`. */
  valor: dinero("valor").notNull(),
  /** Para combos: lleva X ... */
  comboLleva: integer("combo_lleva"),
  /** ... paga Y (ej. 2x1 → lleva 2, paga 1). */
  comboPaga: integer("combo_paga"),
  fechaInicio: timestamp("fecha_inicio", { withTimezone: true }).notNull(),
  fechaFin: timestamp("fecha_fin", { withTimezone: true }).notNull(),
  alcance: alcancePromocionEnum("alcance").notNull().default("todo"),
  productoId: integer("producto_id").references(() => productos.id),
  categoriaId: integer("categoria_id").references(() => categorias.id),
  sucursalId: integer("sucursal_id").references(() => sucursales.id),
  /** true = requiere cupón; false = se aplica automáticamente. */
  requiereCupon: boolean("requiere_cupon").notNull().default(false),
  activo: boolean("activo").notNull().default(true),
});

export const cupones = pgTable("cupones", {
  id: serial("id").primaryKey(),
  codigo: varchar("codigo", { length: 40 }).notNull().unique(),
  promocionId: integer("promocion_id")
    .notNull()
    .references(() => promociones.id),
  usosMaximos: integer("usos_maximos"),
  usosActuales: integer("usos_actuales").notNull().default(0),
});

// ---------- Configuración ----------

export const qrPagos = pgTable("qr_pagos", {
  id: serial("id").primaryKey(),
  nombre: varchar("nombre", { length: 120 }).notNull(),
  imagenUrl: text("imagen_url").notNull(),
  sucursalId: integer("sucursal_id").references(() => sucursales.id),
  activo: boolean("activo").notNull().default(true),
});

/** Tabla de una sola fila (id = 1). */
export const configuracion = pgTable("configuracion", {
  id: integer("id").primaryKey().default(1),
  logoUrl: text("logo_url"),
  nombreComercial: varchar("nombre_comercial", { length: 120 }).notNull().default("El Maseta"),
  nit: varchar("nit", { length: 30 }),
  mensajeAgradecimiento: text("mensaje_agradecimiento")
    .notNull()
    .default("¡Gracias por tu compra!"),
  plantillaWhatsapp: text("plantilla_whatsapp")
    .notNull()
    .default("Hola {cliente}, aquí está tu comprobante de {negocio}: {enlace}"),
  codigoPais: varchar("codigo_pais", { length: 4 }).notNull().default("591"),
});

// ---------- Alertas y auditoría ----------

export const alertas = pgTable(
  "alertas",
  {
    id: serial("id").primaryKey(),
    tipo: tipoAlertaEnum("tipo").notNull(),
    productoId: integer("producto_id").references(() => productos.id),
    cajaId: integer("caja_id").references(() => cajas.id),
    ventaId: integer("venta_id").references(() => ventas.id),
    sucursalId: integer("sucursal_id").references(() => sucursales.id),
    mensaje: text("mensaje").notNull(),
    leida: boolean("leida").notNull().default(false),
    resuelta: boolean("resuelta").notNull().default(false),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("alertas_pendientes_idx").on(t.resuelta, t.leida, t.fecha)],
);

export const auditoria = pgTable(
  "auditoria",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id").references(() => usuarios.id),
    accion: varchar("accion", { length: 60 }).notNull(),
    detalle: jsonb("detalle"),
    dispositivo: text("dispositivo"),
    fecha: timestamp("fecha", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auditoria_fecha_idx").on(t.fecha), index("auditoria_accion_idx").on(t.accion)],
);
