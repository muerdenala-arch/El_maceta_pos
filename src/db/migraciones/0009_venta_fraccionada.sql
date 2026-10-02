ALTER TABLE "detalle_venta" ADD COLUMN "fraccion" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "detalle_venta" ADD COLUMN "unidad_fraccion" varchar(20);--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "fraccionado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "unidad_fraccion" varchar(20);--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "unidades_por_envase" integer;--> statement-breakpoint
ALTER TABLE "productos" ADD COLUMN "precio_unidad" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "productos" ADD CONSTRAINT "productos_fraccion_ck" CHECK (not "productos"."fraccionado" or ("productos"."unidad_fraccion" is not null and "productos"."unidades_por_envase" between 2 and 10000 and "productos"."precio_unidad" is not null));