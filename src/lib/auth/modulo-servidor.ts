import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { configuracion, sucursales } from "@/db/schema";
import { redirect } from "next/navigation";
import { modulosValidos, type ModuloEncargado } from "./modulos";
import { inicioSegunRol } from "./rutas";
import { autorizar, ErrorCandado, requerirSesion, type Sesion } from "./sesion";

/** Apartados con el candado abierto para los encargados (una consulta por petición). */
export const modulosAbiertos = cache(async (): Promise<ModuloEncargado[]> => {
  const [c] = await db.select({ abiertos: configuracion.encargadoModulosAbiertos }).from(configuracion).where(eq(configuracion.id, 1));
  return modulosValidos(c?.abiertos);
});

export type AccesoModulo = {
  sesion: Sesion;
  /** Encargado con límites dentro del apartado. Hoy siempre false: con el candado abierto trabaja igual que el administrador. */
  encargado: boolean;
  /** Se ve pero no se cambia nada. Hoy siempre false: con el candado cerrado el encargado ni siquiera entra. */
  soloLectura: boolean;
  /** Sucursal a la que se limita (hoy siempre null: nadie queda limitado dentro de un apartado abierto). */
  sucursalId: number | null;
};

/** Para las páginas de un apartado: administrador, o encargado con el candado abierto (cerrado → a su pantalla de entrada). */
export async function requerirModulo(modulo: ModuloEncargado): Promise<AccesoModulo> {
  const sesion = await requerirSesion("admin", "encargado");
  if (sesion.rol === "admin") return { sesion, encargado: false, soloLectura: false, sucursalId: null };
  if (!(await modulosAbiertos()).includes(modulo)) redirect(inicioSegunRol(sesion.rol));
  // Con el candado abierto, el encargado trabaja igual que el administrador (decisión del dueño).
  return { sesion, encargado: false, soloLectura: false, sucursalId: null };
}

/**
 * Para las acciones de un apartado compartido: el administrador siempre; el encargado solo con el candado abierto.
 * Lo que además se limita a su sucursal lo comprueba cada acción con la sesión que devuelve.
 */
export async function autorizarModulo(modulo: ModuloEncargado): Promise<Sesion> {
  const sesion = await autorizar("admin", "encargado");
  if (sesion.rol === "admin") return sesion;
  if (!(await modulosAbiertos()).includes(modulo)) throw new ErrorCandado("Apartado con candado");
  return sesion;
}

/** Stock de una ubicación: la bodega central es del apartado Bodega; las sucursales, del apartado Inventario. */
export async function autorizarUbicacion(ubicacionId: number): Promise<Sesion> {
  const sesion = await autorizar("admin", "encargado");
  if (sesion.rol === "admin") return sesion;
  const [u] = await db.select({ tipo: sucursales.tipo }).from(sucursales).where(eq(sucursales.id, ubicacionId));
  return autorizarModulo(u?.tipo === "bodega" ? "bodega" : "inventario");
}

/** Cuando aún no se sabe la ubicación (datos inválidos): el encargado necesita al menos uno de los candados abierto. */
export async function autorizarAlguno(...modulos: ModuloEncargado[]): Promise<Sesion> {
  const sesion = await autorizar("admin", "encargado");
  if (sesion.rol === "admin") return sesion;
  const abiertos = await modulosAbiertos();
  if (!modulos.some((m) => abiertos.includes(m))) throw new ErrorCandado("Apartado con candado");
  return sesion;
}
