CREATE TYPE "public"."criterio_ganador" AS ENUM('porcentaje', 'kilos');--> statement-breakpoint
CREATE TYPE "public"."estado_evento" AS ENUM('borrador', 'en_curso', 'finalizado');--> statement-breakpoint
CREATE TYPE "public"."tipo_juego" AS ENUM('reto_transformacion');--> statement-breakpoint
ALTER TYPE "public"."tipo_alerta" ADD VALUE 'evento_por_finalizar';--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" serial PRIMARY KEY NOT NULL,
	"tipo_juego" "tipo_juego" NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"descripcion" text,
	"fecha_inicio" date NOT NULL,
	"duracion_dias" integer NOT NULL,
	"fecha_fin" date GENERATED ALWAYS AS (fecha_inicio + duracion_dias - 1) STORED,
	"criterio_ganador" "criterio_ganador" DEFAULT 'porcentaje' NOT NULL,
	"estado" "estado_evento" DEFAULT 'borrador' NOT NULL,
	"sucursal_id" integer,
	"premios" text,
	"token_publico" varchar(64) NOT NULL,
	"creado_por" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"iniciado_en" timestamp with time zone,
	"finalizado_en" timestamp with time zone,
	CONSTRAINT "eventos_duracion_ck" CHECK ("eventos"."duracion_dias" between 1 and 365)
);
--> statement-breakpoint
CREATE TABLE "participantes_evento" (
	"id" serial PRIMARY KEY NOT NULL,
	"evento_id" integer NOT NULL,
	"nombre_completo" varchar(160) NOT NULL,
	"cedula_identidad" varchar(20) NOT NULL,
	"telefono" varchar(30) NOT NULL,
	"peso_inicial" numeric(5, 2) NOT NULL,
	"fecha_inscripcion" timestamp with time zone DEFAULT now() NOT NULL,
	"acepta_participar" boolean NOT NULL,
	"activo" boolean DEFAULT true NOT NULL,
	"motivo_baja" text,
	CONSTRAINT "participantes_peso_ck" CHECK ("participantes_evento"."peso_inicial" between 30 and 300),
	CONSTRAINT "participantes_acepta_ck" CHECK ("participantes_evento"."acepta_participar")
);
--> statement-breakpoint
CREATE TABLE "pesajes" (
	"id" serial PRIMARY KEY NOT NULL,
	"participante_id" integer NOT NULL,
	"fecha" date NOT NULL,
	"peso" numeric(5, 2) NOT NULL,
	"es_pesaje_final" boolean DEFAULT false NOT NULL,
	"registrado_por" integer NOT NULL,
	"nota" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pesajes_peso_ck" CHECK ("pesajes"."peso" between 30 and 300)
);
--> statement-breakpoint
ALTER TABLE "alertas" ADD COLUMN "evento_id" integer;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_creado_por_usuarios_id_fk" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participantes_evento" ADD CONSTRAINT "participantes_evento_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesajes" ADD CONSTRAINT "pesajes_participante_id_participantes_evento_id_fk" FOREIGN KEY ("participante_id") REFERENCES "public"."participantes_evento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pesajes" ADD CONSTRAINT "pesajes_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_token_publico_uq" ON "eventos" USING btree ("token_publico");--> statement-breakpoint
CREATE INDEX "eventos_tipo_estado_idx" ON "eventos" USING btree ("tipo_juego","estado");--> statement-breakpoint
CREATE UNIQUE INDEX "participantes_evento_cedula_uq" ON "participantes_evento" USING btree ("evento_id","cedula_identidad");--> statement-breakpoint
CREATE INDEX "participantes_evento_evento_idx" ON "participantes_evento" USING btree ("evento_id");--> statement-breakpoint
CREATE INDEX "pesajes_participante_idx" ON "pesajes" USING btree ("participante_id","fecha");--> statement-breakpoint
CREATE UNIQUE INDEX "pesajes_final_uq" ON "pesajes" USING btree ("participante_id") WHERE "pesajes"."es_pesaje_final";--> statement-breakpoint
ALTER TABLE "alertas" ADD CONSTRAINT "alertas_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;