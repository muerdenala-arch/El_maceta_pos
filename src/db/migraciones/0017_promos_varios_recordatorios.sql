CREATE TABLE "recordatorios" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"titulo" varchar(120) NOT NULL,
	"nota" text,
	"fecha" date NOT NULL,
	"hora" varchar(5) NOT NULL,
	"repeticion" varchar(10) DEFAULT 'ninguna' NOT NULL,
	"proxima_en" timestamp with time zone,
	"enviado_en" timestamp with time zone,
	"dispositivos" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "promociones" ADD COLUMN "producto_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "promociones" ADD COLUMN "categoria_ids" integer[] DEFAULT '{}'::integer[] NOT NULL;--> statement-breakpoint
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recordatorios_proxima_idx" ON "recordatorios" USING btree ("proxima_en");--> statement-breakpoint
CREATE INDEX "recordatorios_usuario_idx" ON "recordatorios" USING btree ("usuario_id");--> statement-breakpoint
-- Traspaso: las promociones de un solo producto / categoría pasan a la lista (las columnas antiguas quedan sin uso).
UPDATE "promociones" SET "producto_ids" = ARRAY["producto_id"] WHERE "producto_id" IS NOT NULL AND "producto_ids" = '{}'::integer[];--> statement-breakpoint
UPDATE "promociones" SET "categoria_ids" = ARRAY["categoria_id"] WHERE "categoria_id" IS NOT NULL AND "categoria_ids" = '{}'::integer[];
