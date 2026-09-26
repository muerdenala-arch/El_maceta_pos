import "server-only";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { MAX_INTENTOS_PIN, MINUTOS_BLOQUEO_PIN } from "./constantes";

type Usuario = typeof usuarios.$inferSelect;

export type ResultadoPin =
  | { ok: true }
  | { ok: false; motivo: "incorrecto" }
  | { ok: false; motivo: "bloqueado"; hasta: Date };

/** Hash de relleno: si el usuario no existe se compara igual, para no revelarlo por el tiempo de respuesta. */
const HASH_RELLENO = bcrypt.hashSync("relleno-usuario-inexistente", 10);

export async function compararConRelleno(pin: string) {
  await bcrypt.compare(pin, HASH_RELLENO);
}

/**
 * Verifica el PIN de un usuario aplicando el límite de intentos:
 * tras MAX_INTENTOS_PIN fallos seguidos, queda bloqueado MINUTOS_BLOQUEO_PIN minutos
 * (vale para el login y para la pantalla de bloqueo) y se registra en auditoría.
 */
export async function comprobarPin(
  u: Usuario,
  pin: string,
  contexto: "login" | "desbloqueo",
): Promise<ResultadoPin> {
  if (u.bloqueadoHasta && u.bloqueadoHasta > new Date()) {
    await compararConRelleno(pin);
    return { ok: false, motivo: "bloqueado", hasta: u.bloqueadoHasta };
  }

  if (await bcrypt.compare(pin, u.pinHash)) {
    if (u.intentosFallidos > 0 || u.bloqueadoHasta) {
      await db
        .update(usuarios)
        .set({ intentosFallidos: 0, bloqueadoHasta: null })
        .where(eq(usuarios.id, u.id));
    }
    return { ok: true };
  }

  // Incremento atómico: dos intentos simultáneos no pueden "perder" un fallo.
  const [{ intentos }] = await db
    .update(usuarios)
    .set({ intentosFallidos: sql`${usuarios.intentosFallidos} + 1` })
    .where(eq(usuarios.id, u.id))
    .returning({ intentos: usuarios.intentosFallidos });

  if (intentos >= MAX_INTENTOS_PIN) {
    const hasta = new Date(Date.now() + MINUTOS_BLOQUEO_PIN * 60_000);
    await db
      .update(usuarios)
      .set({ intentosFallidos: 0, bloqueadoHasta: hasta })
      .where(eq(usuarios.id, u.id));
    await registrarAuditoria("bloqueo_por_intentos", {
      usuarioId: u.id,
      detalle: { contexto, hasta: hasta.toISOString() },
    });
    return { ok: false, motivo: "bloqueado", hasta };
  }

  await registrarAuditoria(contexto === "login" ? "login_fallido" : "desbloqueo_fallido", {
    usuarioId: u.id,
    detalle: { intento: intentos },
  });
  return { ok: false, motivo: "incorrecto" };
}

/** "15:42" en hora de Bolivia. */
export function horaLocal(fecha: Date) {
  return fecha.toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}
