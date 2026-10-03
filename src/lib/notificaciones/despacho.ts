import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/db";
import { alertas, sucursales, suscripcionesPush, usuarios } from "@/db/schema";
import { destinoAlerta, TITULOS_ALERTA } from "@/lib/alertas/reglas";
import { conciliarAlertasCajas } from "@/lib/caja/alertas";
import { despacharRecordatorios } from "@/lib/recordatorios/despacho";
import { enviarADispositivo, olvidarDispositivos, prepararPush, pushConfigurado, type Notificacion } from "./envio";

export { pushConfigurado, type Notificacion };

/**
 * Notificaciones en el celular o la tablet (Web Push): cada alerta nueva de la campanita se envía una sola vez a los
 * dispositivos donde un administrador o un encargado (reciben lo mismo) activó las notificaciones.
 * Sin claves VAPID configuradas (NEXT_PUBLIC_VAPID_PUBLICA / VAPID_PRIVADA) no hace nada. El envío está en ./envio.ts.
 */

/** Más alertas que esto de una vez (p. ej. al cargar inventario) se resumen en una sola notificación. */
const MAXIMO_SUELTAS = 3;
const LOTE = 40;

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

  prepararPush();
  let enviadas = 0;
  const vencidas: number[] = [];
  for (const d of destinos) {
    // Administrador y encargado reciben las mismas alertas.
    const suyas = tomadas;
    const mensajes: Notificacion[] =
      suyas.length > MAXIMO_SUELTAS
        ? [{ titulo: `${suyas.length} alertas nuevas`, cuerpo: "Abre la campanita para verlas.", url: d.rol === "admin" ? "/admin/dashboard" : "/admin/inicio", etiqueta: "resumen" }]
        : suyas.map((a) => ({
            titulo: TITULOS_ALERTA[a.tipo],
            cuerpo: a.mensaje,
            url: destinoAlerta({ ...a, enBodega: a.sucursalId !== null && esBodega.has(a.sucursalId) }),
            etiqueta: `alerta-${a.id}`,
          }));
    const e = await enviarADispositivo(d, mensajes);
    enviadas += e.enviadas;
    if (e.vencida) vencidas.push(d.id);
  }
  await olvidarDispositivos(vencidas);
  return enviadas;
}

/** Alertas y recordatorios pendientes (lo llaman también /api/recordatorios/despachar y el cron). */
export async function despacharTodo() {
  await conciliarAlertasCajas().catch(() => {});
  const alertasEnviadas = await despacharAlertas().catch(() => 0);
  const recordatoriosEnviados = await despacharRecordatorios().catch(() => 0);
  return { alertas: alertasEnviadas, recordatorios: recordatoriosEnviados };
}

/** Envía lo pendiente después de responder (no demora la acción). Fuera de una petición de Next no hace nada. */
export function programarDespacho() {
  if (!pushConfigurado()) return;
  try {
    after(() => despacharTodo().catch(() => {}));
  } catch {
    // Sin contexto de petición (scripts, pruebas): se enviarán con la siguiente acción.
  }
}
