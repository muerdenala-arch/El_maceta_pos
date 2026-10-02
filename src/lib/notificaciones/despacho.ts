import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import webpush from "web-push";
import { db } from "@/db";
import { alertas, sucursales, suscripcionesPush, usuarios } from "@/db/schema";
import { destinoAlerta, destinoAlertaEncargado, TIPOS_ENCARGADO, TITULOS_ALERTA } from "@/lib/alertas/reglas";

/**
 * Notificaciones en el celular o la tablet (Web Push): cada alerta nueva de la campanita se envía una sola vez a los
 * dispositivos donde un administrador (todas) o un encargado (las de stock de su sucursal) activó las notificaciones.
 * Sin claves VAPID configuradas (NEXT_PUBLIC_VAPID_PUBLICA / VAPID_PRIVADA) no hace nada.
 */
export function pushConfigurado() {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLICA && !!process.env.VAPID_PRIVADA;
}

/** Más alertas que esto de una vez (p. ej. al cargar inventario) se resumen en una sola notificación. */
const MAXIMO_SUELTAS = 3;
const LOTE = 40;

export type Notificacion = { titulo: string; cuerpo: string; url: string; etiqueta: string };

/**
 * Envía las alertas pendientes de notificar. Primero las marca como notificadas (así dos peticiones a la vez no
 * las envían dos veces) y después las reparte. Devuelve cuántas notificaciones salieron.
 */
export async function despacharAlertas(): Promise<number> {
  if (!pushConfigurado()) return 0;
  const tomadas = await db
    .update(alertas)
    .set({ notificada: true })
    .where(
      inArray(
        alertas.id,
        db.select({ id: alertas.id }).from(alertas).where(and(eq(alertas.notificada, false), eq(alertas.resuelta, false))).orderBy(alertas.id).limit(LOTE),
      ),
    )
    .returning({ id: alertas.id, tipo: alertas.tipo, mensaje: alertas.mensaje, productoId: alertas.productoId, sucursalId: alertas.sucursalId, cajaId: alertas.cajaId, ventaId: alertas.ventaId, eventoId: alertas.eventoId });
  if (tomadas.length === 0) return 0;

  const [destinos, bodegas] = await Promise.all([
    db
      .select({ id: suscripcionesPush.id, endpoint: suscripcionesPush.endpoint, p256dh: suscripcionesPush.p256dh, auth: suscripcionesPush.auth, rol: usuarios.rol, sucursalId: usuarios.sucursalId })
      .from(suscripcionesPush)
      .innerJoin(usuarios, eq(usuarios.id, suscripcionesPush.usuarioId))
      .where(and(eq(usuarios.activo, true), inArray(usuarios.rol, ["admin", "encargado"]))),
    db.select({ id: sucursales.id }).from(sucursales).where(eq(sucursales.tipo, "bodega")),
  ]);
  if (destinos.length === 0) return 0;
  const esBodega = new Set(bodegas.map((b) => b.id));

  webpush.setVapidDetails(process.env.VAPID_CONTACTO || "mailto:soporte@elmaseta.app", process.env.NEXT_PUBLIC_VAPID_PUBLICA!, process.env.VAPID_PRIVADA!);
  let enviadas = 0;
  const vencidas: number[] = [];
  for (const d of destinos) {
    const admin = d.rol === "admin";
    const suyas = admin ? tomadas : tomadas.filter((a) => a.sucursalId === d.sucursalId && TIPOS_ENCARGADO.includes(a.tipo));
    if (suyas.length === 0) continue;
    const mensajes: Notificacion[] =
      suyas.length > MAXIMO_SUELTAS
        ? [{ titulo: `${suyas.length} alertas nuevas`, cuerpo: "Abre la campanita para verlas.", url: admin ? "/admin/dashboard" : "/cajero/bodega", etiqueta: "resumen" }]
        : suyas.map((a) => ({
            titulo: TITULOS_ALERTA[a.tipo],
            cuerpo: a.mensaje,
            url: admin ? destinoAlerta({ ...a, enBodega: a.sucursalId !== null && esBodega.has(a.sucursalId) }) : destinoAlertaEncargado(a.productoId),
            etiqueta: `alerta-${a.id}`,
          }));
    for (const m of mensajes) {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, JSON.stringify(m), { TTL: 60 * 60 * 12 });
        enviadas++;
      } catch (e) {
        // 404/410: el dispositivo ya no existe o quitó el permiso → se olvida la suscripción.
        const codigo = (e as { statusCode?: number }).statusCode;
        if (codigo === 404 || codigo === 410) vencidas.push(d.id);
        break;
      }
    }
  }
  if (vencidas.length) await db.delete(suscripcionesPush).where(inArray(suscripcionesPush.id, vencidas));
  return enviadas;
}

/** Envía lo pendiente después de responder (no demora la acción). Fuera de una petición de Next no hace nada. */
export function programarDespacho() {
  if (!pushConfigurado()) return;
  try {
    after(() => despacharAlertas().catch(() => {}));
  } catch {
    // Sin contexto de petición (scripts, pruebas): se enviarán con la siguiente acción.
  }
}
