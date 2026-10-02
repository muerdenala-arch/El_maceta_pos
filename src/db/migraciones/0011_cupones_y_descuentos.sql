ALTER TABLE "cupones" ALTER COLUMN "promocion_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion" ADD COLUMN "descuento_manual_maximo" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "descripcion" varchar(160);--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "tipo" varchar(12) DEFAULT 'porcentaje' NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "valor" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "monto_minimo" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "fecha_inicio" date;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "fecha_fin" date;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "activo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "alcance" varchar(12) DEFAULT 'todo' NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "producto_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "categoria_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "sucursal_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "acumula_promociones" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "acumula_combos" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cupones" ADD COLUMN "creado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "detalle_venta" ADD COLUMN "descuento_cupon" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "detalle_venta" ADD COLUMN "descuento_manual" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "descuento_promociones" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "descuento_combos" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "descuento_cupon" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "descuento_manual" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "porcentaje_descuento_manual" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "motivo_descuento_manual" text;--> statement-breakpoint
ALTER TABLE "cupones" ADD CONSTRAINT "cupones_tipo_ck" CHECK ("cupones"."tipo" in ('porcentaje', 'monto') and "cupones"."valor" >= 0 and "cupones"."monto_minimo" >= 0);--> statement-breakpoint
ALTER TABLE "cupones" ADD CONSTRAINT "cupones_alcance_ck" CHECK ("cupones"."alcance" in ('todo', 'productos', 'categorias'));--> statement-breakpoint
-- Los cupones antiguos eran un código de una promoción: ahora llevan su propio descuento y reglas (se copian de su promoción).
-- Los que colgaban de un "combo NxM" no tienen equivalente y quedan inactivos.
UPDATE "cupones" c SET
  "descripcion" = left(p."nombre", 160),
  "tipo" = CASE WHEN p."tipo"::text = 'monto_fijo' THEN 'monto' ELSE 'porcentaje' END,
  "valor" = CASE WHEN p."tipo"::text = 'combo' THEN 0 ELSE p."valor" END,
  "fecha_inicio" = (p."fecha_inicio" AT TIME ZONE 'America/La_Paz')::date,
  "fecha_fin" = ((p."fecha_fin" - interval '1 second') AT TIME ZONE 'America/La_Paz')::date,
  "activo" = p."activo" AND p."tipo"::text <> 'combo',
  "alcance" = CASE WHEN p."producto_id" IS NOT NULL THEN 'productos' WHEN p."categoria_id" IS NOT NULL THEN 'categorias' ELSE 'todo' END,
  "producto_ids" = CASE WHEN p."producto_id" IS NOT NULL THEN ARRAY[p."producto_id"] ELSE '{}'::integer[] END,
  "categoria_ids" = CASE WHEN p."categoria_id" IS NOT NULL THEN ARRAY[p."categoria_id"] ELSE '{}'::integer[] END,
  "sucursal_ids" = CASE WHEN p."sucursal_id" IS NOT NULL THEN ARRAY[p."sucursal_id"] ELSE '{}'::integer[] END
FROM "promociones" p WHERE p."id" = c."promocion_id";--> statement-breakpoint
-- Desglose de los descuentos de las ventas ya hechas: lo de los combos y, el resto, promociones.
UPDATE "ventas" v SET "descuento_combos" = least(v."descuento", coalesce((SELECT sum(vc."cantidad" * (vc."precio_normal" - vc."precio_final")) FROM "ventas_combos" vc WHERE vc."venta_id" = v."id"), 0));--> statement-breakpoint
UPDATE "ventas" SET "descuento_promociones" = "descuento" - "descuento_combos";
