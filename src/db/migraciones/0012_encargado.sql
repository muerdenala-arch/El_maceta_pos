ALTER TYPE "public"."rol" ADD VALUE 'encargado';--> statement-breakpoint
ALTER TABLE "alertas" ADD COLUMN "leida_encargado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "configuracion" ADD COLUMN "descuento_manual_maximo_encargado" numeric(5, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "ventas" ADD COLUMN "descuento_autorizado_por" integer;--> statement-breakpoint
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_descuento_autorizado_por_usuarios_id_fk" FOREIGN KEY ("descuento_autorizado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;