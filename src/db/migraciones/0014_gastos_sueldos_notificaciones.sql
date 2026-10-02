CREATE TYPE "public"."tipo_movimiento_sueldo" AS ENUM('adelanto', 'descuento', 'bono', 'pago');--> statement-breakpoint
CREATE TABLE "movimientos_sueldo" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"periodo" varchar(7) NOT NULL,
	"tipo" "tipo_movimiento_sueldo" NOT NULL,
	"monto" numeric(12, 2) NOT NULL,
	"nota" text,
	"registrado_por" integer NOT NULL,
	"anulado" boolean DEFAULT false NOT NULL,
	"motivo_anulacion" text,
	"fecha" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sueldos_mes" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"periodo" varchar(7) NOT NULL,
	"monto" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suscripciones_push" (
	"id" serial PRIMARY KEY NOT NULL,
	"usuario_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gastos" ALTER COLUMN "caja_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "alertas" ADD COLUMN "notificada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "intentos_ingreso" ADD COLUMN "ultima_huella" varchar(80);--> statement-breakpoint
ALTER TABLE "intentos_ingreso" ADD COLUMN "ultimo_largo" integer;--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "sueldo_mensual" numeric(12, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos_sueldo" ADD CONSTRAINT "movimientos_sueldo_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimientos_sueldo" ADD CONSTRAINT "movimientos_sueldo_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sueldos_mes" ADD CONSTRAINT "sueldos_mes_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suscripciones_push" ADD CONSTRAINT "suscripciones_push_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_sueldo_periodo_idx" ON "movimientos_sueldo" USING btree ("periodo","usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sueldos_mes_usuario_periodo_uq" ON "sueldos_mes" USING btree ("usuario_id","periodo");--> statement-breakpoint
CREATE UNIQUE INDEX "suscripciones_push_endpoint_uq" ON "suscripciones_push" USING btree ("endpoint");--> statement-breakpoint
-- Las alertas que ya existían no se envían como notificación al publicar.
UPDATE "alertas" SET "notificada" = true;
