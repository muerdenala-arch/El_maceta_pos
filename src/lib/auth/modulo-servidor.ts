import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { configuracion, sucursales } from "@/db/schema";
import { modulosValidos, type ModuloEncargado } from "./modulos";
import { autorizar, ErrorAutorizacion, ErrorCandado, requerirSesion, type Sesion } from "./sesion";

/** Apartados con el candado abierto para los encargados (una consulta por petición). */
export const modulosAbiertos = cache(async (): Promise<ModuloEncargado[]> => {
  const [c] = await db.select({ abiertos: configuracion.encargadoModulosAbiertos }).from(configuracion).where(eq(configuracion.id, 1));
  return modulosValidos(c?.abiertos);
});

export type AccesoModulo = {
  sesion: Sesion;
  /** Es el encargado (no ve costos y solo trabaja con su sucursal). */
  encargado: boolean;
  /** Encargado con el candado cerrado: ve, pero no cambia nada. */
  soloLectura: boolean;
  /** Sucursal del encargado (null para el administrador). */
  sucursalId: number | null;
};

/** Para las páginas de un apartado compartido: administrador, o encargado (en solo lectura si el candado está cerrado). */
export async function requerirModulo(modulo: ModuloEncargado): Promise<AccesoModulo> {
  const sesion = await requerirSesion("admin", "encargado");
  if (sesion.rol === "admin") return { sesion, encargado: false, soloLectura: false, sucursalId: null };
  const soloLectura = modulo === "auditoria" || !(await modulosAbiertos()).includes(modulo);
  return { sesion, encargado: true, soloLectura, sucursalId: sesion.sucursalId };
}

/**
 * Para las acciones de un apartado compartido: el administrador siempre; el encargado solo con el candado abierto.
 * Lo que además se limita a su sucursal lo comprueba cada acción con la sesión que devuelve.
 */
export async function autorizarModulo(modulo: ModuloEncargado): Promise<Sesion> {
  const sesion = await autorizar("admin", "encargado");
  if (sesion.rol === "admin") return sesion;
  if (!sesion.sucursalId) throw new ErrorAutorizacion("Sin sucursal");
  if (modulo === "auditoria" || !(await modulosAbiertos()).includes(modulo)) throw new ErrorCandado("Apartado con candado");
  return sesion;
}

/**
 * Stock de una ubicación: el administrador en cualquiera; el encargado en su sucursal (apartado Inventario) o en la
 * bodega central (apartado Bodega), nunca en otra sucursal.
 */
export async function autorizarUbicacion(ubicacionId: number): Promise<Sesion> {
  const sesion = await autorizar("admin", "encargado");
  if (sesion.rol === "admin") return sesion;
  const [u] = await db.select({ tipo: sucursales.tipo }).from(sucursales).where(eq(sucursales.id, ubicacionId));
  if (u?.tipo === "bodega") return autorizarModulo("bodega");
  if (ubicacionId !== sesion.sucursalId) throw new ErrorAutorizacion("Otra sucursal");
  return autorizarModulo("inventario");
}

/** Lanza si el encargado intenta tocar algo de otra sucursal (el administrador pasa siempre). */
export function exigirSuSucursal(sesion: Sesion, sucursalId: number | null) {
  if (sesion.rol !== "admin" && sucursalId !== sesion.sucursalId) throw new ErrorAutorizacion("Otra sucursal");
}

/** Cuando aún no se sabe la ubicación (datos inválidos): el encargado necesita al menos uno de los candados abierto. */
export async function autorizarAlguno(...modulos: ModuloEncargado[]): Promise<Sesion> {
  const sesion = await autorizar("admin", "encargado");
  if (sesion.rol === "admin") return sesion;
  const abiertos = await modulosAbiertos();
  if (!modulos.some((m) => abiertos.includes(m))) throw new ErrorCandado("Apartado con candado");
  return sesion;
}
