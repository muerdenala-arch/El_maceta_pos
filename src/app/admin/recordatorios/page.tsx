import { desc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { recordatorios } from "@/db/schema";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { obtenerSesion } from "@/lib/auth/sesion";
import { hoyEnBolivia } from "@/lib/formato";
import { pushConfigurado } from "@/lib/notificaciones/envio";
import { ListaRecordatorios } from "./lista-recordatorios";

export const metadata: Metadata = { title: "Recordatorios" };

/** Recordatorios de quien está viendo la pantalla: primero los pendientes (el más próximo arriba), después los ya avisados. */
export default async function PaginaRecordatorios() {
  await requerirModulo("recordatorios");
  const sesion = (await obtenerSesion())!;
  const filas = await db
    .select()
    .from(recordatorios)
    .where(eq(recordatorios.usuarioId, sesion.uid))
    .orderBy(sql`${recordatorios.proximaEn} asc nulls last`, desc(recordatorios.enviadoEn))
    .limit(200);

  return (
    <ListaRecordatorios
      hoy={hoyEnBolivia()}
      avisosDisponibles={pushConfigurado()}
      recordatorios={filas.map((r) => ({
        id: r.id,
        titulo: r.titulo,
        nota: r.nota,
        fecha: r.fecha,
        hora: r.hora,
        repeticion: r.repeticion,
        proximaEn: r.proximaEn?.toISOString() ?? null,
        enviadoEn: r.enviadoEn?.toISOString() ?? null,
        dispositivos: r.dispositivos,
      }))}
    />
  );
}
