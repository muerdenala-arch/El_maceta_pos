/**
 * Firma y verificación del JWT de sesión (jose, HS256).
 * Sin "server-only" porque también lo usa proxy.ts; nunca importarlo desde un componente cliente.
 */
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";

const esquemaCarga = z.object({
  uid: z.number().int().positive(),
  rol: z.enum(["admin", "cajero", "encargado"]),
  sucursalId: z.number().int().positive().nullable(),
});

export type CargaSesion = z.infer<typeof esquemaCarga>;

function clave() {
  const secreto = process.env.JWT_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new Error("JWT_SECRET no está configurado o tiene menos de 32 caracteres.");
  }
  return new TextEncoder().encode(secreto);
}

/** La misma clave firma las autorizaciones con PIN (lib/auth/autorizacion.ts), con otra audiencia. */
export const claveJwt = clave;

/** Duración máxima de la sesión en horas (SESION_HORAS, por defecto 12, máximo 7 días). */
export function horasSesion() {
  const horas = Number(process.env.SESION_HORAS ?? 12);
  return Number.isFinite(horas) && horas > 0 && horas <= 24 * 7 ? horas : 12;
}

export async function firmarSesion(carga: CargaSesion) {
  return new SignJWT(carga)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${horasSesion()}h`)
    .sign(clave());
}

/** Devuelve la carga si el token es válido y no expiró; si no, null. */
export async function verificarSesion(token: string | undefined): Promise<CargaSesion | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, clave(), { algorithms: ["HS256"] });
    const carga = esquemaCarga.safeParse(payload);
    return carga.success ? carga.data : null;
  } catch {
    return null;
  }
}
