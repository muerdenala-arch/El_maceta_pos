import "server-only";
import { and, asc, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { recordatorios, suscripcionesPush, usuarios } from "@/db/schema";
import { enviarADispositivo, olvidarDispositivos, prepararPush, pushConfigurado } from "@/lib/notificaciones/envio";
import { proximoAviso, textoAviso } from "./calculo";

const LOTE = 50;
/** Pasado este retraso, el aviso dice para cuándo era. */
const RETRASO_AVISADO = 15 * 60_000;

/**
 * Envía los recordatorios cuya hora ya llegó, cada uno a los dispositivos de su dueño. Se puede llamar las veces
 * que sea y desde varios lugares a la vez: cada recordatorio se "toma" con una actualización condicionada a que
 * nadie más lo haya tomado, así nunca sale dos veces. Los que se repiten quedan programados para la siguiente vez.
 */
export async function despacharRecordatorios(ahora = new Date()): Promise<number> {
  const vencidos = await db
    .select()
    .from(recordatorios)
    .where(and(isNotNull(recordatorios.proximaEn), lte(recordatorios.proximaEn, ahora)))
    .orderBy(asc(recordatorios.proximaEn))
    .limit(LOTE);
  let enviados = 0;
  for (const r of vencidos) {
    const [tomado] = await db
      .update(recordatorios)
      .set({ proximaEn: proximoAviso(r, ahora), enviadoEn: ahora, dispositivos: 0 })
      .where(and(eq(recordatorios.id, r.id), eq(recordatorios.proximaEn, r.proximaEn!)))
      .returning({ id: recordatorios.id });
    if (!tomado || !pushConfigurado()) continue;

    const dispositivos = await db
      .select({ id: suscripcionesPush.id, endpoint: suscripcionesPush.endpoint, p256dh: suscripcionesPush.p256dh, auth: suscripcionesPush.auth })
      .from(suscripcionesPush)
      .innerJoin(usuarios, eq(usuarios.id, suscripcionesPush.usuarioId))
      .where(and(eq(suscripcionesPush.usuarioId, r.usuarioId), eq(usuarios.activo, true)));
    if (dispositivos.length === 0) continue;

    prepararPush();
    const tarde = ahora.getTime() - r.proximaEn!.getTime() > RETRASO_AVISADO;
    const mensaje = {
      titulo: `Recordatorio: ${r.titulo}`,
      cuerpo: [tarde ? `Era para el ${textoAviso(r.proximaEn!)}.` : null, r.nota].filter(Boolean).join(" ") || `Programado para las ${r.hora}`,
      url: "/admin/recordatorios",
      etiqueta: `recordatorio-${r.id}`,
    };
    let llegaron = 0;
    const vencidas: number[] = [];
    for (const d of dispositivos) {
      const e = await enviarADispositivo(d, [mensaje]);
      llegaron += e.enviadas;
      if (e.vencida) vencidas.push(d.id);
    }
    await olvidarDispositivos(vencidas);
    if (llegaron > 0) {
      await db.update(recordatorios).set({ dispositivos: llegaron }).where(eq(recordatorios.id, r.id));
      enviados++;
    }
  }
  return enviados;
}
