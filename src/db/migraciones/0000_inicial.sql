CREATE TYPE "public"."alcance_promocion" AS ENUM('todo', 'producto', 'categoria', 'sucursal');--> statement-breakpoint
CREATE TYPE "public"."estado_caja" AS ENUM('abierta', 'cerrada');--> statement-breakpoint
CREATE TYPE "public"."estado_pago" AS ENUM('pagado', 'qr_por_confirmar');--> statement-breakpoint
CREATE TYPE "public"."estado_transferencia" AS ENUM('enviada', 'recibida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."estado_venta" AS ENUM('completada', 'anulada');--> statement-breakpoint
CREATE TYPE "public"."metodo_pago" AS ENUM('efectivo', 'qr');--> statement-breakpoint
CREATE TYPE "public"."rol" AS ENUM('admin', 'cajero');--> statement-breakpoint
CREATE TYPE "public"."tamano_impresion" AS ENUM('58mm', '80mm', 'carta');--> statement-breakpoint
CREATE TYPE "public"."tipo_alerta" AS ENUM('stock_bajo', 'agotado', 'por_vencer', 'caja_diferencia', 'stock_negativo', 'qr_por_confirmar', 'solicitud_reposicion');--> statement-breakpoint
CREATE TYPE "public"."tipo_movimiento" AS ENUM('ingreso', 'venta', 'transferencia_salida', 'transferencia_entrada', 'ajuste', 'anulacion');--> statement-breakpoint
CREATE TYPE "public"."tipo_promocion" AS ENUM('porcentaje', 'monto_fijo', 'combo');--> statement-breakpoint
CREATE TYPE "public"."tipo_ubicacion" AS ENUM('sucursal', 'bodega');--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_alerta" NOT NULL,
	"producto_id" integer,
	"caja_id" integer,
	"venta_id" integer,
	"sucursal_id" integer,
	"mensaje" text NOT NULL,
	"leida" boolean DEFAULT false NOT NULL,
	"resuelta" boolean DEFAULT false NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer,
	"accion" varchar(60) NOT NULL,
	"detalle" jsonb,
	"dispositivo" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cajas" (
	"id" serial PRIMARY KEY NOT NULL,
	"sucursal_id" integer NOT NULL,
	"cajero_id" integer NOT NULL,
	"monto_inicial" numeric(12, 2) NOT NULL,
	"apertura" timestamp with time zone DEFAULT now() NOT NULL,
	"cierre" timestamp with time zone,
	"ventas_efectivo" numeric(12, 2),
	"ventas_qr" numeric(12, 2),
	"gastos" numeric(12, 2),
	"esperado" numeric(12, 2),
	"efectivo_contado" numeric(12, 2),
	"diferencia" numeric(12, 2),
	"estado" "estado_caja" DEFAULT 'abierta' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(80) NOT NULL,
	CONSTRAINT "categorias_nombre_unique" UNIQUE("nombre")
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(120),
	"telefono" varchar(30),
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "configuracion" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"logo_url" text,
	"nombre_comercial" varchar(120) DEFAULT 'El Maseta' NOT NULL,
	"nit" varchar(30),
	"mensaje_agradecimiento" text DEFAULT '¡Gracias por tu compra!' NOT NULL,
	"plantilla_whatsapp" text DEFAULT 'Hola {cliente}, aquí está tu comprobante de {negocio}: {enlace}' NOT NULL,
	"codigo_pais" varchar(4) DEFAULT '591' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cupones" (
	"id" serial PRIMARY KEY NOT NULL,
	"codigo" varchar(40) NOT NULL,
	"promocion_id" integer NOT NULL,
	"usos_maximos" integer,
	"usos_actuales" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cupones_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "detalle_transferencia" (
	"id" serial PRIMARY KEY NOT NULL,
	"transferencia_id" integer NOT NULL,
	"producto_id" integer NOT NULL,
	"cantidad" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "detalle_venta" (
	"id" serial PRIMARY KEY NOT NULL,
	"venta_id" integer NOT NULL,
	"producto_id" integer NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_unitario" numeric(12, 2) NOT NULL,
	"descuento" numeric(12, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gastos" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid_dispositivo" uuid NOT NULL,
	"caja_id" integer NOT NULL,
	"sucursal_id" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"categoria" varchar(60) NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"descripcion" text,
	"foto_url" text,
	"anulado" boolean DEFAULT false NOT NULL,
	"motivo_anulacion" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventario" (
	"producto_id" integer NOT NULL,
	"ubicacion_id" integer NOT NULL,
	"cantidad" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "inventario_producto_id_ubicacion_id_pk" PRIMARY KEY("producto_id","ubicacion_id")
);
--> statement-breakpoint
CREATE TABLE "lotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"producto_id" integer NOT NULL,
	"ubicacion_id" integer NOT NULL,
	"cantidad" integer NOT NULL,
	"fecha_vencimiento" date,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movimientos_inventario" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo" "tipo_movimiento" NOT NULL,
	"producto_id" integer NOT NULL,
	"ubicacion_id" integer NOT NULL,
	"cantidad" integer NOT NULL,
	"usuario_id" integer NOT NULL,
	"motivo" text,
	"referencia" varchar(64),
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(160) NOT NULL,
	"marca" varchar(80),
	"categoria_id" integer,
	"sabor" varchar(80),
	"presentacion" varchar(80),
	"precio_venta" numeric(12, 2) NOT NULL,
	"precio_costo" numeric(12, 2) NOT NULL,
	"codigo_barras" varchar(64),
	"foto_url" text,
	"stock_minimo" integer DEFAULT 0 NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promociones" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"tipo" "tipo_promocion" NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"combo_lleva" integer,
	"combo_paga" integer,
	"fecha_inicio" timestamp with time zone NOT NULL,
	"fecha_fin" timestamp with time zone NOT NULL,
	"alcance" "alcance_promocion" DEFAULT 'todo' NOT NULL,
	"producto_id" integer,
	"categoria_id" integer,
	"sucursal_id" integer,
	"requiere_cupon" boolean DEFAULT false NOT NULL,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_pagos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"imagen_url" text NOT NULL,
	"sucursal_id" integer,
	"activo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sucursales" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"tipo" "tipo_ubicacion" DEFAULT 'sucursal' NOT NULL,
	"direccion" text,
	"telefono" varchar(30),
	"encargado" varchar(120),
	"tamano_impresion" "tamano_impresion" DEFAULT '80mm' NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transferencias" (
	"id" serial PRIMARY KEY NOT NULL,
	"origen_id" integer NOT NULL,
	"destino_id" integer NOT NULL,
	"estado" "estado_transferencia" DEFAULT 'enviada' NOT NULL,
	"usuario_envia_id" integer NOT NULL,
	"usuario_recibe_id" integer,
	"enviada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"recibida_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"usuario" varchar(50) NOT NULL,
	"rol" "rol" NOT NULL,
	"pin_hash" text NOT NULL,
	"sucursal_id" integer,
	"activo" boolean DEFAULT true NOT NULL,
	"intentos_fallidos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ventas" (
	"id" serial PRIMARY KEY NOT NULL,
	"uuid_dispositivo" uuid NOT NULL,
	"numero_comprobante" integer NOT NULL,
	"sucursal_id" integer NOT NULL,
	"caja_id" integer NOT NULL,
	"cajero_id" integer NOT NULL,
	"cliente_id" integer,
	"subtotal" numeric(12, 2) NOT NULL,
	"descuento" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"metodo_pago" "metodo_pago" NOT NULL,
	"monto_recibido" numeric(12, 2),
	"cambio" numeric(12, 2),
	"estado_pago" "estado_pago" DEFAULT 'pagado' NOT NULL,
	"cupon_id" integer,
	"pdf_url" text,
	"token_publico" varchar(64) NOT NULL,
	"estado" "estado_venta" DEFAULT 'completada' NOT NULL,
	"motivo_anulacion" text,
	"creado_offline" boolean DEFAULT false NOT NULL,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL,
	"sincronizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_cajero_id_usuarios_id_fk" FOREIGN KEY ("cajero_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cupones" ADD CONSTRAINT "cupones_promocion_id_promociones_id_fk" FOREIGN KEY ("promocion_id") REFERENCES "public"."promociones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_transferencia" ADD CONSTRAINT "detalle_transferencia_transferencia_id_transferencias_id_fk" FOREIGN KEY ("transferencia_id") REFERENCES "public"."transferencias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_transferencia" ADD CONSTRAINT "detalle_transferencia_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario" ADD CONSTRAINT "inventario_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario" ADD CONSTRAINT "inventario_ubicacion_id_sucursales_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_ubicacion_id_sucursales_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_ubicacion_id_sucursales_id_fk" FOREIGN KEY ("ubicacion_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_inventario" ADD CONSTRAINT "movimientos_inventario_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promociones" ADD CONSTRAINT "promociones_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_pagos" ADD CONSTRAINT "qr_pagos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_origen_id_sucursales_id_fk" FOREIGN KEY ("origen_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_destino_id_sucursales_id_fk" FOREIGN KEY ("destino_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_usuario_envia_id_usuarios_id_fk" FOREIGN KEY ("usuario_envia_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_usuario_recibe_id_usuarios_id_fk" FOREIGN KEY ("usuario_recibe_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_caja_id_cajas_id_fk" FOREIGN KEY ("caja_id") REFERENCES "public"."cajas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cajero_id_usuarios_id_fk" FOREIGN KEY ("cajero_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cupon_id_cupones_id_fk" FOREIGN KEY ("cupon_id") REFERENCES "public"."cupones"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alertas_pendientes_idx" ON "alertas" USING btree ("resuelta","leida","fecha");--> statement-breakpoint
CREATE INDEX "auditoria_fecha_idx" ON "auditoria" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "auditoria_accion_idx" ON "auditoria" USING btree ("accion");--> statement-breakpoint
CREATE UNIQUE INDEX "cajas_una_abierta_por_cajero_uq" ON "cajas" USING btree ("cajero_id") WHERE "cajas"."estado" = 'abierta';--> statement-breakpoint
CREATE INDEX "cajas_sucursal_apertura_idx" ON "cajas" USING btree ("sucursal_id","apertura");--> statement-breakpoint
CREATE INDEX "clientes_telefono_idx" ON "clientes" USING btree ("telefono");--> statement-breakpoint
CREATE INDEX "detalle_venta_venta_idx" ON "detalle_venta" USING btree ("venta_id");--> statement-breakpoint
CREATE INDEX "detalle_venta_producto_idx" ON "detalle_venta" USING btree ("producto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gastos_uuid_dispositivo_uq" ON "gastos" USING btree ("uuid_dispositivo");--> statement-breakpoint
CREATE INDEX "gastos_sucursal_fecha_idx" ON "gastos" USING btree ("sucursal_id","fecha");--> statement-breakpoint
CREATE INDEX "lotes_vencimiento_idx" ON "lotes" USING btree ("fecha_vencimiento");--> statement-breakpoint
CREATE INDEX "mov_fecha_idx" ON "movimientos_inventario" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "mov_producto_ubicacion_idx" ON "movimientos_inventario" USING btree ("producto_id","ubicacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "productos_codigo_barras_uq" ON "productos" USING btree ("codigo_barras") WHERE "productos"."codigo_barras" is not null;--> statement-breakpoint
CREATE INDEX "productos_categoria_idx" ON "productos" USING btree ("categoria_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_usuario_uq" ON "usuarios" USING btree ("usuario");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_uuid_dispositivo_uq" ON "ventas" USING btree ("uuid_dispositivo");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_token_publico_uq" ON "ventas" USING btree ("token_publico");--> statement-breakpoint
CREATE UNIQUE INDEX "ventas_sucursal_numero_uq" ON "ventas" USING btree ("sucursal_id","numero_comprobante");--> statement-breakpoint
CREATE INDEX "ventas_fecha_idx" ON "ventas" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "ventas_sucursal_fecha_idx" ON "ventas" USING btree ("sucursal_id","fecha");--> statement-breakpoint
CREATE INDEX "ventas_caja_idx" ON "ventas" USING btree ("caja_id");