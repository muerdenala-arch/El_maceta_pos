import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { usuarios } from "@/db/schema";
import { COOKIE_SESION, type Rol } from "./constantes";
import { firmarSesion, horasSesion, verificarSesion, type CargaSesion } from "./jwt";
import { inicioSegunRol } from "./rutas";

export type Sesion = CargaSesion & { nombre: string; usuario: string };

/**
 * Sesión actual verificada contra la BD (una vez por petición gracias a `cache`):
 * si el usuario fue desactivado o cambió de rol/sucursal, la sesión deja de valer al instante.
 */
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const carga = await verificarSesion((await cookies()).get(COOKIE_SESION)?.value);
  if (!carga) return null;

  const [u] = await db
    .select({
      nombre: usuarios.nombre,
      usuario: usuarios.usuario,
      rol: usuarios.rol,
      sucursalId: usuarios.sucursalId,
      activo: usuarios.activo,
    })
    .from(usuarios)
    .where(eq(usuarios.id, carga.uid));

  if (!u?.activo || u.rol !== carga.rol || u.sucursalId !== carga.sucursalId) return null;
  return { ...carga, nombre: u.nombre, usuario: u.usuario };
});

/** Para páginas y layouts: redirige al login o al inicio del rol si no corresponde. */
export async function requerirSesion(...roles: Rol[]): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/login");
  if (roles.length > 0 && !roles.includes(sesion.rol)) redirect(inicioSegunRol(sesion.rol));
  return sesion;
}

export class ErrorAutorizacion extends Error {}

/** Para server actions y route handlers: lanza error si no hay sesión o el rol no corresponde. */
export async function autorizar(...roles: Rol[]): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) throw new ErrorAutorizacion("No autenticado");
  if (roles.length > 0 && !roles.includes(sesion.rol)) throw new ErrorAutorizacion("Sin permiso");
  return sesion;
}

export async function guardarCookieSesion(carga: CargaSesion) {
  (await cookies()).set(COOKIE_SESION, await firmarSesion(carga), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: horasSesion() * 60 * 60,
  });
}

export async function borrarCookieSesion() {
  (await cookies()).delete(COOKIE_SESION);
}
