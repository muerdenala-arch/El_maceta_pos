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
  check,
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
/** Peso en kilos con 2 decimales (hasta 999,99 kg). Como el dinero, nunca float. */
const peso = (nombre: string) => numeric(nombre, { precision: 5, scale: 2 });

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
  /** Venta hecha sin conexión cuyo precio o descuento no coincide con los de la BD al sincronizar. */
  "revision_offline",
  /** Módulo Eventos: un reto cumplió su duración y falta registrar los pesajes finales y finalizarlo. */
  "evento_por_finalizar",
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
    /**
     * Huella del PIN (HMAC con clave del servidor, `lib/auth/huella.ts`): permite entrar solo con el PIN
     * encontrando al usuario de una vez, y que dos personas no tengan el mismo PIN. null = se calcula al ingresar.
     */
    pinHuella: varchar("pin_huella", { length: 80 }),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex("usuarios_usuario_uq").on(t.usuario),
    uniqueIndex("usuarios_pin_huella_uq").on(t.pinHuella).where(sql`${t.pinHuella} is not null`),
  ],
);

/**
 * Intentos de ingreso fallidos por dispositivo/red (IP). Al entrar solo con el PIN no se sabe a qué usuario
 * se estaba probando: tras varios fallos se bloquea el origen por un tiempo (`lib/auth/pin.ts`).
 */
export const intentosIngreso = pgTable("intentos_ingreso", {
  origen: varchar("origen", { length: 64 }).primaryKey(),
  intentos: integer("intentos").notNull().default(0),
  bloqueadoHasta: timestamp("bloqueado_hasta", { withTimezone: true }),
  actualizado: timestamp("actualizado", { withTimezone: true }).notNull().defaultNow(),
});

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
    descripcion: text("descripcion"),
    precioVenta: dinero("precio_venta").notNull(),
    precioCosto: dinero("precio_costo").notNull(),
    codigoBarras: varchar("codigo_barras", { length: 64 }),
    fotoUrl: text("foto_url"),
    /** En envases (frascos), también para los productos fraccionados. */
    stockMinimo: integer("stock_minimo").notNull().default(0),
    /**
     * Venta fraccionada: además del envase completo se venden unidades sueltas (cápsulas, sobres…).
     * El stock de estos productos se guarda en la unidad suelta (ver lib/inventario/fraccion.ts).
     */
    fraccionado: boolean("fraccionado").notNull().default(false),
    /** capsula | tableta | scoop | sobre */
    unidadFraccion: varchar("unidad_fraccion", { length: 20 }),
    unidadesPorEnvase: integer("unidades_por_envase"),
    /** Precio de venta de una unidad suelta. */
    precioUnidad: dinero("precio_unidad"),
    activo: boolean("activo").notNull().default(true),
    creadoEn: creadoEn(),
  },
  (t) => [
    uniqueIndex("productos_codigo_barras_uq")
      .on(t.codigoBarras)
      .where(sql`${t.codigoBarras} is not null`),
    index("productos_categoria_idx").on(t.categoriaId),
    check(
      "productos_fraccion_ck",
      sql`not ${t.fraccionado} or (${t.unidadFraccion} is not null and ${t.unidadesPorEnvase} between 2 and 10000 and ${t.precioUnidad} is not null)`,
    ),
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
    /** Promoción que generó el descuento de esta línea (para reportes). */
    promocionId: integer("promocion_id").references(() => promociones.id),
    /** Precio de costo del producto al momento de la venta (ganancia en reportes aunque el costo cambie). */
    costoUnitario: dinero("costo_unitario"),
    /** Venta por unidad suelta: `cantidad` y los precios son por cápsula/sobre, no por envase. */
    fraccion: boolean("fraccion").notNull().default(false),
    /** Unidad suelta vendida (capsula, sobre…), tal como era al vender. Nulo si se vendió el envase. */
    unidadFraccion: varchar("unidad_fraccion", { length: 20 }),
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
  /** Exclusiva: inicio del día siguiente al último día de vigencia (hora de Bolivia). */
  fechaFin: timestamp("fecha_fin", { withTimezone: true }).notNull(),
  /**
   * A qué productos aplica: todo, un producto o una categoría. `sucursalId` (opcional) limita además
   * a una sucursal; "sucursal" equivale a "todo" en esa sucursal.
   */
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
    eventoId: integer("evento_id").references(() => eventos.id),
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

// ---------- Eventos (módulo de juegos y retos) ----------

/** Tipos de juego. Para agregar uno: valor aquí + entrada en lib/eventos/tipos.ts. */
export const tipoJuegoEnum = pgEnum("tipo_juego", ["reto_transformacion", "torneo_pulseada"]);
export const criterioGanadorEnum = pgEnum("criterio_ganador", ["porcentaje", "kilos"]);
export const estadoEventoEnum = pgEnum("estado_evento", ["borrador", "en_curso", "finalizado"]);

export const eventos = pgTable(
  "eventos",
  {
    id: serial("id").primaryKey(),
    tipoJuego: tipoJuegoEnum("tipo_juego").notNull(),
    nombre: varchar("nombre", { length: 120 }).notNull(),
    descripcion: text("descripcion"),
    fechaInicio: date("fecha_inicio").notNull(),
    duracionDias: integer("duracion_dias").notNull(),
    /** Último día del reto (inclusive): inicio + duración − 1. Calculada por PostgreSQL. */
    fechaFin: date("fecha_fin").generatedAlwaysAs(sql`fecha_inicio + duracion_dias - 1`),
    criterioGanador: criterioGanadorEnum("criterio_ganador").notNull().default("porcentaje"),
    estado: estadoEventoEnum("estado").notNull().default("borrador"),
    sucursalId: integer("sucursal_id").references(() => sucursales.id),
    premios: text("premios"),
    /** Enlace público de resultados (WhatsApp): aleatorio, nunca el id. */
    tokenPublico: varchar("token_publico", { length: 64 }).notNull(),
    creadoPor: integer("creado_por")
      .notNull()
      .references(() => usuarios.id),
    creadoEn: creadoEn(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }).notNull().defaultNow(),
    iniciadoEn: timestamp("iniciado_en", { withTimezone: true }),
    finalizadoEn: timestamp("finalizado_en", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("eventos_token_publico_uq").on(t.tokenPublico),
    index("eventos_tipo_estado_idx").on(t.tipoJuego, t.estado),
    check("eventos_duracion_ck", sql`${t.duracionDias} between 1 and 365`),
  ],
);

export const participantesEvento = pgTable(
  "participantes_evento",
  {
    id: serial("id").primaryKey(),
    eventoId: integer("evento_id")
      .notNull()
      .references(() => eventos.id),
    nombreCompleto: varchar("nombre_completo", { length: 160 }).notNull(),
    cedulaIdentidad: varchar("cedula_identidad", { length: 20 }).notNull(),
    telefono: varchar("telefono", { length: 30 }).notNull(),
    /** Obligatorio en el Reto Transformación (lo exige su validación); en la pulseada es solo un dato opcional. */
    pesoInicial: peso("peso_inicial"),
    fechaInscripcion: timestamp("fecha_inscripcion", { withTimezone: true }).notNull().defaultNow(),
    aceptaParticipar: boolean("acepta_participar").notNull(),
    activo: boolean("activo").notNull().default(true),
    motivoBaja: text("motivo_baja"),
    /** Cuándo se dio de baja (en torneos, desde ahí pierde por W.O. lo que le quede por jugar). */
    dadoDeBajaEn: timestamp("dado_de_baja_en", { withTimezone: true }),
  },
  (t) => [
    // Regla: la cédula no se repite dentro del mismo evento.
    uniqueIndex("participantes_evento_cedula_uq").on(t.eventoId, t.cedulaIdentidad),
    index("participantes_evento_evento_idx").on(t.eventoId),
    check("participantes_peso_ck", sql`${t.pesoInicial} is null or ${t.pesoInicial} between 30 and 300`),
    check("participantes_acepta_ck", sql`${t.aceptaParticipar}`),
  ],
);

export const pesajes = pgTable(
  "pesajes",
  {
    id: serial("id").primaryKey(),
    participanteId: integer("participante_id")
      .notNull()
      .references(() => participantesEvento.id),
    /** Día de la jornada de pesaje (hora de Bolivia). */
    fecha: date("fecha").notNull(),
    peso: peso("peso").notNull(),
    esPesajeFinal: boolean("es_pesaje_final").notNull().default(false),
    registradoPor: integer("registrado_por")
      .notNull()
      .references(() => usuarios.id),
    nota: text("nota"),
    creadoEn: creadoEn(),
  },
  (t) => [
    index("pesajes_participante_idx").on(t.participanteId, t.fecha),
    // Un solo pesaje final por participante.
    uniqueIndex("pesajes_final_uq").on(t.participanteId).where(sql`${t.esPesajeFinal}`),
    check("pesajes_peso_ck", sql`${t.peso} between 30 and 300`),
  ],
);

// ---------- Torneo de Pulseada ----------

export const formatoTorneoEnum = pgEnum("formato_torneo", ["eliminacion_directa", "doble_eliminacion", "todos_contra_todos"]);
export const faseCombateEnum = pgEnum("fase_combate", ["ganadores", "perdedores", "gran_final", "desempate", "tercer_lugar", "liga"]);

/** Datos propios de un torneo (1 a 1 con `eventos`). El estado de las llaves se reconstruye del sorteo + resultados. */
export const torneos = pgTable(
  "torneos",
  {
    eventoId: integer("evento_id")
      .primaryKey()
      .references(() => eventos.id),
    formato: formatoTorneoEnum("formato").notNull(),
    mejorDe: integer("mejor_de").notNull().default(3),
    puntosVictoria: integer("puntos_victoria").notNull().default(1),
    /** Orden del sorteo (ids de participantes: cabezas de serie 1, 2, 3…). null = todavía sin sortear. */
    sorteo: jsonb("sorteo").$type<number[]>(),
    sorteadoEn: timestamp("sorteado_en", { withTimezone: true }),
  },
  (t) => [check("torneos_mejor_de_ck", sql`${t.mejorDe} in (1, 3, 5)`)],
);

export const combates = pgTable(
  "combates",
  {
    id: serial("id").primaryKey(),
    eventoId: integer("evento_id")
      .notNull()
      .references(() => eventos.id),
    /** Identificador dentro de las llaves: "G2-1" (ganadores), "P3-1" (perdedores), "GF", "GF2", "T3", "L4-2" (liga). */
    clave: varchar("clave", { length: 12 }).notNull(),
    fase: faseCombateEnum("fase").notNull(),
    ronda: integer("ronda").notNull(),
    orden: integer("orden").notNull(),
    competidorA: integer("competidor_a").references(() => participantesEvento.id),
    competidorB: integer("competidor_b").references(() => participantesEvento.id),
    aVacio: boolean("a_vacio").notNull().default(false),
    bVacio: boolean("b_vacio").notNull().default(false),
    asaltosA: integer("asaltos_a").notNull().default(0),
    asaltosB: integer("asaltos_b").notNull().default(0),
    faltasA: integer("faltas_a").notNull().default(0),
    faltasB: integer("faltas_b").notNull().default(0),
    ganadorId: integer("ganador_id").references(() => participantesEvento.id),
    terminado: boolean("terminado").notNull().default(false),
    paseLibre: boolean("pase_libre").notNull().default(false),
    walkover: boolean("walkover").notNull().default(false),
    /** Quién cargó el resultado; null = se resolvió solo (pase libre o W.O. por retiro). */
    registradoPor: integer("registrado_por").references(() => usuarios.id),
    terminadoEn: timestamp("terminado_en", { withTimezone: true }),
  },
  (t) => [uniqueIndex("combates_evento_clave_uq").on(t.eventoId, t.clave), index("combates_evento_idx").on(t.eventoId)],
);
