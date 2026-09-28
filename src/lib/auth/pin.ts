import "server-only";
import bcrypt from "bcryptjs";
import { and, eq, isNull, ne, notLike, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db";
import { intentosIngreso, usuarios } from "@/db/schema";
import { registrarAuditoria } from "@/lib/auditoria";
import { MAX_INTENTOS_PIN, MINUTOS_BLOQUEO_PIN } from "./constantes";
import { huellaPin, versionHuella } from "./huella";

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

// ---------------------------------------------------------------- Ingreso solo con PIN

export type BusquedaPin = { tipo: "unico"; usuario: Usuario } | { tipo: "ninguno" } | { tipo: "ambiguo" };

/**
 * Encuentra al usuario activo dueño del PIN. Camino rápido: la huella (una consulta). Camino lento, solo para
 * usuarios sin huella o con huella de una clave anterior: bcrypt uno por uno; al acertar se guarda la huella.
 */
export async function buscarUsuarioPorPin(pin: string): Promise<BusquedaPin> {
  const huella = huellaPin(pin);
  const [directo] = await db.select().from(usuarios).where(and(eq(usuarios.pinHuella, huella), eq(usuarios.activo, true)));
  if (directo) return { tipo: "unico", usuario: directo };

  const candidatos = await db
    .select()
    .from(usuarios)
    .where(and(eq(usuarios.activo, true), or(isNull(usuarios.pinHuella), notLike(usuarios.pinHuella, `${versionHuella()}:%`))));
  const coinciden: Usuario[] = [];
  for (const u of candidatos) if (await bcrypt.compare(pin, u.pinHash)) coinciden.push(u);
  if (coinciden.length > 1) return { tipo: "ambiguo" };
  if (coinciden.length === 0) return { tipo: "ninguno" };
  const u = coinciden[0];
  try {
    await db.update(usuarios).set({ pinHuella: huella }).where(eq(usuarios.id, u.id));
  } catch {
    // Otro usuario ya tiene esa huella (PIN repetido de antes de esta regla): se ingresa igual, sin guardarla.
  }
  return { tipo: "unico", usuario: u };
}

/** ¿Otro usuario (activo o no) ya usa este PIN? Para crear usuarios y restablecer PIN. */
export async function pinEnUso(pin: string, exceptoId?: number): Promise<boolean> {
  const huella = huellaPin(pin);
  const [conHuella] = await db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(eq(usuarios.pinHuella, huella), exceptoId ? ne(usuarios.id, exceptoId) : undefined));
  if (conHuella) return true;
  const sinHuella = await db
    .select({ id: usuarios.id, pinHash: usuarios.pinHash })
    .from(usuarios)
    .where(and(or(isNull(usuarios.pinHuella), notLike(usuarios.pinHuella, `${versionHuella()}:%`)), exceptoId ? ne(usuarios.id, exceptoId) : undefined));
  for (const u of sinHuella) if (await bcrypt.compare(pin, u.pinHash)) return true;
  return false;
}

/** Dispositivo/red que hace la petición (Vercel envía la IP real en x-forwarded-for). */
export async function origenPeticion() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "desconocido").trim().slice(0, 64) || "desconocido";
}

/** Si el origen está bloqueado por demasiados PIN incorrectos, hasta cuándo. */
export async function origenBloqueado(origen: string): Promise<Date | null> {
  const [f] = await db.select({ hasta: intentosIngreso.bloqueadoHasta }).from(intentosIngreso).where(eq(intentosIngreso.origen, origen));
  return f?.hasta && f.hasta > new Date() ? f.hasta : null;
}

/** Suma un fallo al origen (los fallos de más de 15 min atrás no cuentan); al llegar al límite, lo bloquea. */
export async function registrarFalloOrigen(origen: string): Promise<Date | null> {
  const ventana = sql`now() - make_interval(mins => ${MINUTOS_BLOQUEO_PIN})`;
  const [{ intentos }] = await db
    .insert(intentosIngreso)
    .values({ origen, intentos: 1 })
    .onConflictDoUpdate({
      target: intentosIngreso.origen,
      set: {
        intentos: sql`case when ${intentosIngreso.actualizado} < ${ventana} then 1 else ${intentosIngreso.intentos} + 1 end`,
        actualizado: sql`now()`,
      },
    })
    .returning({ intentos: intentosIngreso.intentos });
  if (intentos < MAX_INTENTOS_PIN) return null;
  const hasta = new Date(Date.now() + MINUTOS_BLOQUEO_PIN * 60_000);
  await db.update(intentosIngreso).set({ intentos: 0, bloqueadoHasta: hasta }).where(eq(intentosIngreso.origen, origen));
  await registrarAuditoria("bloqueo_por_intentos", { detalle: { contexto: "login", origen, hasta: hasta.toISOString() } });
  return hasta;
}

export async function limpiarOrigen(origen: string) {
  await db.delete(intentosIngreso).where(eq(intentosIngreso.origen, origen));
}
