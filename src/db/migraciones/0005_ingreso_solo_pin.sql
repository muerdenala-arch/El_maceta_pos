CREATE TABLE "intentos_ingreso" (
	"origen" varchar(64) PRIMARY KEY NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"bloqueado_hasta" timestamp with time zone,
	"actualizado" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usuarios" ADD COLUMN "pin_huella" varchar(80);--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_pin_huella_uq" ON "usuarios" USING btree ("pin_huella") WHERE "usuarios"."pin_huella" is not null;