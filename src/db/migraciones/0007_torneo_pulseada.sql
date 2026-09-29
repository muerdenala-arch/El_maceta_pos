CREATE TYPE "public"."fase_combate" AS ENUM('ganadores', 'perdedores', 'gran_final', 'desempate', 'tercer_lugar', 'liga');--> statement-breakpoint
CREATE TYPE "public"."formato_torneo" AS ENUM('eliminacion_directa', 'doble_eliminacion', 'todos_contra_todos');--> statement-breakpoint
ALTER TYPE "public"."tipo_juego" ADD VALUE 'torneo_pulseada';--> statement-breakpoint
CREATE TABLE "combates" (
	"id" serial PRIMARY KEY NOT NULL,
	"evento_id" integer NOT NULL,
	"clave" varchar(12) NOT NULL,
	"fase" "fase_combate" NOT NULL,
	"ronda" integer NOT NULL,
	"orden" integer NOT NULL,
	"competidor_a" integer,
	"competidor_b" integer,
	"a_vacio" boolean DEFAULT false NOT NULL,
	"b_vacio" boolean DEFAULT false NOT NULL,
	"asaltos_a" integer DEFAULT 0 NOT NULL,
	"asaltos_b" integer DEFAULT 0 NOT NULL,
	"faltas_a" integer DEFAULT 0 NOT NULL,
	"faltas_b" integer DEFAULT 0 NOT NULL,
	"ganador_id" integer,
	"terminado" boolean DEFAULT false NOT NULL,
	"pase_libre" boolean DEFAULT false NOT NULL,
	"walkover" boolean DEFAULT false NOT NULL,
	"registrado_por" integer,
	"terminado_en" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "torneos" (
	"evento_id" integer PRIMARY KEY NOT NULL,
	"formato" "formato_torneo" NOT NULL,
	"mejor_de" integer DEFAULT 3 NOT NULL,
	"puntos_victoria" integer DEFAULT 1 NOT NULL,
	"sorteo" jsonb,
	"sorteado_en" timestamp with time zone,
	CONSTRAINT "torneos_mejor_de_ck" CHECK ("torneos"."mejor_de" in (1, 3, 5))
);
--> statement-breakpoint
ALTER TABLE "participantes_evento" DROP CONSTRAINT "participantes_peso_ck";--> statement-breakpoint
ALTER TABLE "participantes_evento" ALTER COLUMN "peso_inicial" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "participantes_evento" ADD COLUMN "dado_de_baja_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "combates" ADD CONSTRAINT "combates_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combates" ADD CONSTRAINT "combates_competidor_a_participantes_evento_id_fk" FOREIGN KEY ("competidor_a") REFERENCES "public"."participantes_evento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combates" ADD CONSTRAINT "combates_competidor_b_participantes_evento_id_fk" FOREIGN KEY ("competidor_b") REFERENCES "public"."participantes_evento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combates" ADD CONSTRAINT "combates_ganador_id_participantes_evento_id_fk" FOREIGN KEY ("ganador_id") REFERENCES "public"."participantes_evento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combates" ADD CONSTRAINT "combates_registrado_por_usuarios_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "torneos" ADD CONSTRAINT "torneos_evento_id_eventos_id_fk" FOREIGN KEY ("evento_id") REFERENCES "public"."eventos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "combates_evento_clave_uq" ON "combates" USING btree ("evento_id","clave");--> statement-breakpoint
CREATE INDEX "combates_evento_idx" ON "combates" USING btree ("evento_id");--> statement-breakpoint
ALTER TABLE "participantes_evento" ADD CONSTRAINT "participantes_peso_ck" CHECK ("participantes_evento"."peso_inicial" is null or "participantes_evento"."peso_inicial" between 30 and 300);