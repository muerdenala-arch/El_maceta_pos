import "server-only";
import type { z } from "zod";
import { ErrorAutorizacion, ErrorCandado } from "@/lib/auth/sesion";
import { programarDespacho } from "@/lib/notificaciones/despacho";

/** Respuesta estándar de las server actions de formularios. */
export type Resultado<T = undefined> =
  | { ok: true; datos: T }
  | { ok: false; error: string; campos?: Record<string, string> };

export function exito<T = undefined>(datos?: T): { ok: true; datos: T } {
  return { ok: true, datos: datos as T };
}

export function fallo(error: string, campos?: Record<string, string>): { ok: false; error: string; campos?: Record<string, string> } {
  return { ok: false, error, campos };
}

/** Convierte los errores de Zod en { campo: mensaje } para mostrarlos junto a cada campo. */
export function falloValidacion(error: z.ZodError) {
  const campos: Record<string, string> = {};
  for (const issue of error.issues) {
    const clave = issue.path.join(".") || "_";
    campos[clave] ??= issue.message;
  }
  return fallo("Revisa los datos marcados", campos);
}

/** Detecta la violación de un índice único de PostgreSQL (código 23505), directa o envuelta por Drizzle. */
export function esViolacionUnica(e: unknown, restriccion?: string): boolean {
  for (let actual: unknown = e; actual; actual = (actual as { cause?: unknown }).cause) {
    const err = actual as { code?: string; constraint?: string; message?: string };
    if (err.code === "23505") {
      return !restriccion || err.constraint === restriccion || !!err.message?.includes(restriccion);
    }
  }
  return false;
}

export const MENSAJE_CANDADO = "Este apartado tiene candado: solo el administrador puede hacer cambios";

/** Envuelve una acción: los errores de permiso se devuelven como resultado en vez de romper la pantalla. */
export async function conPermiso<T>(fn: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    const r = await fn();
    // Si la acción generó alertas (stock bajo, diferencia de caja…), salen como notificación al celular.
    programarDespacho();
    return r;
  } catch (e) {
    if (e instanceof ErrorCandado) return fallo(MENSAJE_CANDADO);
    if (e instanceof ErrorAutorizacion) return fallo("No tienes permiso para esta acción");
    throw e;
  }
}
