CREATE TYPE "public"."tipo_evento_empleado" AS ENUM('ingreso', 'baja', 'reincorporacion');--> statement-breakpoint
CREATE TABLE "empleados" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(120) NOT NULL,
	"cargo" varchar(80),
	"usuario_id" integer,
	"sucursal_id" integer,
	"fecha_ingreso" date,
	"sueldo_mensual" numeric(12, 2) DEFAULT '0' NOT NULL,
	"fecha_baja" date,
	"motivo_baja" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eventos_empleado" (
	"id" serial PRIMARY KEY NOT NULL,
	"empleado_id" integer NOT NULL,
	"tipo" "tipo_evento_empleado" NOT NULL,
	"fecha" date NOT NULL,
	"motivo" text,
	"registrado_por" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movimientos_sueldo" ALTER COLUMN "usuario_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sueldos_mes" ALTER COLUMN "usuario_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "movimientos_sueldo" ADD COLUMN "empleado_id" integer;--> statement-breakpoint
ALTER TABLE "sueldos_mes" ADD COLUMN "empleado_id" integer;--> statement-breakpoint
-- Cada usuario del sistema pasa a ser un trabajador de la planilla (con su sueldo), y sus sueldos y movimientos lo siguen.
INSERT INTO "empleados" ("nombre", "usuario_id", "sucursal_id", "sueldo_mensual")
  SELECT "nombre", "id", "sucursal_id", "sueldo_mensual" FROM "usuarios" ORDER BY "id";--> statement-breakpoint
UPDATE "movimientos_sueldo" m SET "empleado_id" = e."id" FROM "empleados" e WHERE e."usuario_id" = m."usuario_id";--> statement-breakpoint
UPDATE "sueldos_mes" sm SET "empleado_id" = e."id" FROM "empleados" e WHERE e."usuario_id" = sm."usuario_id";--> statement-breakpoint
ALTER TABLE "movimientos_sueldo" ALTER COLUMN "empleado_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sueldos_mes" ALTER COLUMN "empleado_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empleados" ADD CONSTRAINT "empleados_sucursal_id_sucursales_id_fk" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_empleado" ADD CONSTRAINT "eventos_empleado_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_empleado" ADD CONSTRAINT "eventos_empleado_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "empleados_usuario_uq" ON "empleados" USING btree ("usuario_id") WHERE "empleados"."usuario_id" is not null;--> statement-breakpoint
ALTER TABLE "movimientos_sueldo" ADD CONSTRAINT "movimientos_sueldo_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sueldos_mes" ADD CONSTRAINT "sueldos_mes_empleado_id_empleados_id_fk" FOREIGN KEY ("empleado_id") REFERENCES "public"."empleados"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "movimientos_sueldo_periodo_emp_idx" ON "movimientos_sueldo" USING btree ("periodo","empleado_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sueldos_mes_empleado_periodo_uq" ON "sueldos_mes" USING btree ("empleado_id","periodo");