CREATE TABLE "combo_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"combo_id" integer NOT NULL,
	"producto_id" integer NOT NULL,
	"cantidad" integer NOT NULL,
	"fraccion" boolean DEFAULT false NOT NULL,
	CONSTRAINT "combo_items_cantidad_ck" CHECK ("combo_items"."cantidad" between 1 and 10000)
);
--> statement-breakpoint
CREATE TABLE "combos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"descripcion" text,
	"foto_url" text,
	"tipo_descuento" varchar(12) DEFAULT 'porcentaje' NOT NULL,
	"valor_descuento" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fecha_inicio" date,
	"fecha_fin" date,
	"activo" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "combos_descuento_ck" CHECK ("combos"."tipo_descuento" in ('porcentaje', 'monto') and "combos"."valor_descuento" >= 0),
	CONSTRAINT "combos_vigencia_ck" CHECK ("combos"."fecha_inicio" is null or "combos"."fecha_fin" is null or "combos"."fecha_fin" >= "combos"."fecha_inicio")
);
--> statement-breakpoint
CREATE TABLE "ventas_combos" (
	"id" serial PRIMARY KEY NOT NULL,
	"venta_id" integer NOT NULL,
	"combo_id" integer,
	"nombre" varchar(120) NOT NULL,
	"cantidad" integer NOT NULL,
	"precio_normal" numeric(12, 2) NOT NULL,
	"precio_final" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "detalle_venta" ADD COLUMN "venta_combo_id" integer;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_combo_id_combos_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."combos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_items" ADD CONSTRAINT "combo_items_producto_id_productos_id_fk" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_combos" ADD CONSTRAINT "ventas_combos_venta_id_ventas_id_fk" FOREIGN KEY ("venta_id") REFERENCES "public"."ventas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ventas_combos" ADD CONSTRAINT "ventas_combos_combo_id_combos_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."combos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "combo_items_uq" ON "combo_items" USING btree ("combo_id","producto_id","fraccion");--> statement-breakpoint
CREATE INDEX "ventas_combos_venta_idx" ON "ventas_combos" USING btree ("venta_id");--> statement-breakpoint
ALTER TABLE "detalle_venta" ADD CONSTRAINT "detalle_venta_venta_combo_id_ventas_combos_id_fk" FOREIGN KEY ("venta_combo_id") REFERENCES "public"."ventas_combos"("id") ON DELETE no action ON UPDATE no action;