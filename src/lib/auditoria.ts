import "server-only";
import { headers } from "next/headers";
import { db } from "@/db";
import { auditoria } from "@/db/schema";

/** Acciones sensibles que quedan registradas (se amplía en fases siguientes). */
export type AccionAuditoria =
  | "login"
  | "login_fallido"
  | "bloqueo_por_intentos"
  | "logout"
  | "desbloqueo"
  | "desbloqueo_fallido";

export async function registrarAuditoria(
  accion: AccionAuditoria,
  { usuarioId, detalle }: { usuarioId?: number | null; detalle?: Record<string, unknown> } = {},
) {
  const dispositivo = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  await db.insert(auditoria).values({ accion, usuarioId: usuarioId ?? null, detalle, dispositivo });
}
