"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { alertas, productos } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { autorizar } from "@/lib/auth/sesion";
import { esFraccionado, nombreEnvase, type Fraccionable } from "@/lib/inventario/fraccion";
import { esquemaSolicitudReposicion, type DatosSolicitudReposicion } from "@/lib/validaciones/inventario";

/** Formato fijo: el panel de bodega lee la cantidad del inicio del mensaje. No se exporta (sería una acción pública). */
const mensajeSolicitud = (cantidad: number, nota: string | null, producto: Fraccionable) =>
  `Solicita ${cantidad} ${esFraccionado(producto) ? nombreEnvase(producto, cantidad) : `unidad${cantidad === 1 ? "" : "es"}`}${nota ? ` — ${nota}` : ""}`;

/**
 * El cajero pide mercadería para su sucursal: genera una alerta para el administrador.
 * Si ya hay una solicitud pendiente del mismo producto, se actualiza en vez de duplicarla.
 */
export async function solicitarReposicion(entrada: DatosSolicitudReposicion): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("cajero");
    if (!sesion.sucursalId) return fallo("No tienes una sucursal asignada");
    const v = esquemaSolicitudReposicion.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;

    const [producto] = await db
      .select({ id: productos.id, fraccionado: productos.fraccionado, unidadFraccion: productos.unidadFraccion, unidadesPorEnvase: productos.unidadesPorEnvase })
      .from(productos)
      .where(and(eq(productos.id, d.productoId), eq(productos.activo, true)));
    if (!producto) return fallo("El producto ya no está disponible");

    const mensaje = mensajeSolicitud(d.cantidad, d.nota, producto);
    const pendiente = and(
      eq(alertas.tipo, "solicitud_reposicion"),
      eq(alertas.productoId, d.productoId),
      eq(alertas.sucursalId, sesion.sucursalId),
      eq(alertas.resuelta, false),
    );
    const [actualizada] = await db
      .update(alertas)
      .set({ mensaje, leida: false, fecha: new Date() })
      .where(pendiente)
      .returning({ id: alertas.id });
    if (!actualizada) {
      await db.insert(alertas).values({
        tipo: "solicitud_reposicion",
        productoId: d.productoId,
        sucursalId: sesion.sucursalId,
        mensaje,
      });
    }
    refresh();
    return exito();
  });
}
