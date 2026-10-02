import "server-only";
import { and, eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { claveJwt } from "./jwt";

/**
 * Autorización con PIN en la pantalla del cajero: el encargado de esa sucursal (o un administrador) escribe su PIN
 * y el servidor entrega un permiso firmado, de pocos minutos, atado a quién lo pidió, para qué y sobre qué
 * (el cobro en curso o la venta a anular). No sirve como sesión ni para otra operación.
 */
export type Proposito = "descuento" | "anulacion";

const AUDIENCIA = "maseta:autorizacion";
const MINUTOS = 10;

const esquema = z.object({
  /** Quién autorizó. */
  por: z.number().int().positive(),
  /** Quién lo pidió (el usuario con la sesión abierta). */
  para: z.number().int().positive(),
  sucursalId: z.number().int().positive(),
  proposito: z.enum(["descuento", "anulacion"]),
  /** UUID del cobro (descuento) o id de la venta (anulación). */
  ref: z.string().min(1).max(64),
  /** Descuento autorizado, en % (solo para descuentos). */
  porcentaje: z.string().nullable(),
});
export type Autorizacion = z.infer<typeof esquema>;

export async function firmarAutorizacion(a: Autorizacion) {
  return new SignJWT(a).setProtectedHeader({ alg: "HS256" }).setAudience(AUDIENCIA).setIssuedAt().setExpirationTime(`${MINUTOS}m`).sign(claveJwt());
}

export type Autorizador = { id: number; nombre: string; rol: "admin" | "encargado" };

/**
 * Comprueba el permiso (firma, vencimiento, que sea para este usuario, propósito y referencia) y que quien lo dio
 * siga pudiendo autorizar: activo, y administrador o encargado de esa misma sucursal. Devuelve null si no vale.
 */
export async function verificarAutorizacion(
  token: string | null | undefined,
  esperado: { para: number; sucursalId: number; proposito: Proposito; ref: string },
  tx: Pick<typeof db, "select"> = db,
): Promise<(Autorizador & { porcentaje: string | null }) | null> {
  if (!token) return null;
  let a: Autorizacion;
  try {
    const { payload } = await jwtVerify(token, claveJwt(), { algorithms: ["HS256"], audience: AUDIENCIA });
    const leido = esquema.safeParse(payload);
    if (!leido.success) return null;
    a = leido.data;
  } catch {
    return null;
  }
  if (a.para !== esperado.para || a.sucursalId !== esperado.sucursalId || a.proposito !== esperado.proposito || a.ref !== esperado.ref) return null;
  const [u] = await tx
    .select({ id: usuarios.id, nombre: usuarios.nombre, rol: usuarios.rol, sucursalId: usuarios.sucursalId })
    .from(usuarios)
    .where(and(eq(usuarios.id, a.por), eq(usuarios.activo, true)));
  if (!u || !puedeAutorizar(u, esperado.sucursalId)) return null;
  return { id: u.id, nombre: u.nombre, rol: u.rol as "admin" | "encargado", porcentaje: a.porcentaje };
}

/** Autoriza un administrador, o el encargado de esa misma sucursal. */
export function puedeAutorizar(u: { rol: string; sucursalId: number | null }, sucursalId: number) {
  return u.rol === "admin" || (u.rol === "encargado" && u.sucursalId === sucursalId);
}
