ALTER TABLE "movimientos_sueldo" DROP CONSTRAINT "movimientos_sueldo_usuario_id_usuarios_id_fk";
--> statement-breakpoint
ALTER TABLE "sueldos_mes" DROP CONSTRAINT "sueldos_mes_usuario_id_usuarios_id_fk";
--> statement-breakpoint
DROP INDEX "movimientos_sueldo_periodo_idx";--> statement-breakpoint
DROP INDEX "sueldos_mes_usuario_periodo_uq";--> statement-breakpoint
ALTER TABLE "movimientos_sueldo" DROP COLUMN "usuario_id";--> statement-breakpoint
ALTER TABLE "sueldos_mes" DROP COLUMN "usuario_id";--> statement-breakpoint
ALTER TABLE "usuarios" DROP COLUMN "sueldo_mensual";