import "server-only";
import { inArray } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/db";
import { suscripcionesPush } from "@/db/schema";

/** Sin claves VAPID configuradas (NEXT_PUBLIC_VAPID_PUBLICA / VAPID_PRIVADA) las notificaciones quedan apagadas. */
export function pushConfigurado() {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLICA && !!process.env.VAPID_PRIVADA;
}

export type Notificacion = { titulo: string; cuerpo: string; url: string; etiqueta: string };
export type Dispositivo = { id: number; endpoint: string; p256dh: string; auth: string };

export function prepararPush() {
  webpush.setVapidDetails(process.env.VAPID_CONTACTO || "mailto:soporte@elmaseta.app", process.env.NEXT_PUBLIC_VAPID_PUBLICA!, process.env.VAPID_PRIVADA!);
}

/** Envía los mensajes a un dispositivo. `vencida`: ya no existe o quitó el permiso (404/410) → hay que olvidarlo. */
export async function enviarADispositivo(d: Dispositivo, mensajes: Notificacion[]): Promise<{ enviadas: number; vencida: boolean }> {
  let enviadas = 0;
  for (const m of mensajes) {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, JSON.stringify(m), { TTL: 60 * 60 * 12 });
      enviadas++;
    } catch (e) {
      const codigo = (e as { statusCode?: number }).statusCode;
      return { enviadas, vencida: codigo === 404 || codigo === 410 };
    }
  }
  return { enviadas, vencida: false };
}

export async function olvidarDispositivos(ids: number[]) {
  if (ids.length) await db.delete(suscripcionesPush).where(inArray(suscripcionesPush.id, ids));
}
