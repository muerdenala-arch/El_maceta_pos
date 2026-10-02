import "server-only";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { sucursales } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";

/**
 * Para las pantallas del encargado: sesión de encargado y **su** sucursal. Todo lo que ve se consulta con este id
 * (nunca con uno de la URL): así no puede ver otra sucursal ni escribiendo la dirección a mano.
 */
export async function requerirEncargado() {
  const sesion = await requerirSesion("encargado");
  const [sucursal] = sesion.sucursalId
    ? await db
        .select({ id: sucursales.id, nombre: sucursales.nombre })
        .from(sucursales)
        .where(and(eq(sucursales.id, sesion.sucursalId), eq(sucursales.tipo, "sucursal")))
    : [];
  // Sin sucursal no hay nada que supervisar: esa pantalla le explica que avise al administrador.
  if (!sucursal) redirect("/cajero/bodega");
  return { sesion, sucursal };
}
