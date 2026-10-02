"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { suscripcionesPush } from "@/db/schema";
import { conPermiso, exito, fallo, type Resultado } from "@/lib/acciones/resultado";
import { autorizar } from "@/lib/auth/sesion";

const esquema = z.object({
  // Solo servicios de notificaciones por https (el navegador entrega esta dirección al suscribirse).
  endpoint: z.url().max(1000).refine((u) => u.startsWith("https://"), "Dirección inválida"),
  p256dh: z.string().min(20).max(300),
  auth: z.string().min(8).max(100),
});

/** Este dispositivo recibirá las alertas del usuario (administrador: todas; encargado: stock de su sucursal). */
export async function guardarSuscripcionPush(entrada: z.input<typeof esquema>): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin", "encargado");
    const v = esquema.safeParse(entrada);
    if (!v.success) return fallo("No se pudieron activar las notificaciones en este dispositivo");
    await db
      .insert(suscripcionesPush)
      .values({ usuarioId: sesion.uid, ...v.data })
      // El mismo dispositivo con otra persona: pasa a ser de quien lo activó ahora.
      .onConflictDoUpdate({ target: suscripcionesPush.endpoint, set: { usuarioId: sesion.uid, p256dh: v.data.p256dh, auth: v.data.auth } });
    return exito();
  });
}

/** Deja de enviar notificaciones a este dispositivo (al desactivarlas o al cerrar sesión). Solo las propias. */
export async function quitarSuscripcionPush(entrada: { endpoint: string }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar();
    const endpoint = String(entrada?.endpoint ?? "").slice(0, 1000);
    await db.delete(suscripcionesPush).where(and(eq(suscripcionesPush.endpoint, endpoint), eq(suscripcionesPush.usuarioId, sesion.uid)));
    return exito();
  });
}
