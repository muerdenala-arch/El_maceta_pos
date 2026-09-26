import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { sucursales } from "@/db/schema";
import { COOKIE_SUCURSAL_VISTA } from "@/lib/auth/constantes";
import type { Sesion } from "@/lib/auth/sesion";

export type OpcionSucursal = { id: number; nombre: string };

export async function listarSucursalesActivas(): Promise<OpcionSucursal[]> {
  return db
    .select({ id: sucursales.id, nombre: sucursales.nombre })
    .from(sucursales)
    .where(and(eq(sucursales.tipo, "sucursal"), eq(sucursales.activo, true)))
    .orderBy(asc(sucursales.id));
}

/**
 * Sucursal que se está viendo: el cajero siempre ve la suya (no se puede cambiar);
 * el admin elige una o "todas" (null) con el selector de la barra lateral.
 */
export async function obtenerSucursalVista(sesion: Sesion): Promise<number | null> {
  if (sesion.rol === "cajero") return sesion.sucursalId;
  const valor = Number((await cookies()).get(COOKIE_SUCURSAL_VISTA)?.value);
  return Number.isInteger(valor) && valor > 0 ? valor : null;
}
