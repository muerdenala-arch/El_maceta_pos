"use server";

import { and, eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { sucursales, usuarios } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { autorizarModulo, exigirSuSucursal } from "@/lib/auth/modulo-servidor";
import { idPositivo } from "@/lib/validaciones/comunes";
import { esquemaSucursal, type DatosSucursal } from "@/lib/validaciones/admin";

export async function guardarSucursal(entrada: DatosSucursal & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("sucursales");
    const validado = esquemaSucursal.safeParse(entrada);
    if (!validado.success) return falloValidacion(validado.error);
    const datos = validado.data;
    // El encargado solo edita los datos de su sucursal; crear sucursales es del administrador.
    if (sesion.rol !== "admin") exigirSuSucursal(sesion, entrada.id ?? null);

    if (entrada.id === undefined) {
      const [nueva] = await db
        .insert(sucursales)
        .values({ ...datos, tipo: "sucursal" })
        .returning({ id: sucursales.id });
      await registrarAuditoria("sucursal_creada", { usuarioId: sesion.uid, detalle: { id: nueva.id, ...datos } });
    } else {
      const id = idPositivo.parse(entrada.id);
      const [actualizada] = await db
        .update(sucursales)
        .set(datos)
        .where(eq(sucursales.id, id))
        .returning({ id: sucursales.id });
      if (!actualizada) return fallo("La sucursal ya no existe");
      await registrarAuditoria("sucursal_editada", { usuarioId: sesion.uid, detalle: { id, ...datos } });
    }
    refresh();
    return exito();
  });
}

export async function cambiarEstadoSucursal(entrada: { id: number; activo: boolean }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const id = idPositivo.parse(entrada.id);
    const activo = entrada.activo === true;

    const [sucursal] = await db.select().from(sucursales).where(eq(sucursales.id, id));
    if (!sucursal) return fallo("La sucursal ya no existe");
    if (sucursal.tipo === "bodega") return fallo("La bodega central no se puede desactivar");

    if (!activo) {
      const [{ cajeros }] = await db
        .select({ cajeros: sql<number>`count(*)::int` })
        .from(usuarios)
        .where(and(eq(usuarios.sucursalId, id), eq(usuarios.activo, true)));
      if (cajeros > 0) {
        return fallo(
          `Tiene ${cajeros} usuario${cajeros === 1 ? "" : "s"} activo${cajeros === 1 ? "" : "s"} (cajeros o encargados): reasígnalos o desactívalos primero`,
        );
      }
    }

    await db.update(sucursales).set({ activo }).where(eq(sucursales.id, id));
    await registrarAuditoria("sucursal_estado", { usuarioId: sesion.uid, detalle: { id, activo } });
    refresh();
    return exito();
  });
}
