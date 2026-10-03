"use server";

import { and, eq, inArray } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { categorias, cupones, productos, promociones, sucursales } from "@/db/schema";
import {
  conPermiso,
  esViolacionUnica,
  exito,
  fallo,
  falloValidacion,
  type Resultado,
} from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarModulo } from "@/lib/auth/modulo-servidor";
import { inicioDiaBolivia } from "@/lib/formato";
import { idPositivo } from "@/lib/validaciones/comunes";
import { esquemaCupon, esquemaPromocion, type DatosCupon, type DatosPromocion } from "@/lib/validaciones/promociones";

export async function guardarPromocion(entrada: DatosPromocion & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("promociones");
    const v = esquemaPromocion.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { desde, hasta, ...d } = v.data;

    // Las referencias deben existir.
    if (d.productoIds.length && (await db.select({ id: productos.id }).from(productos).where(inArray(productos.id, d.productoIds))).length !== d.productoIds.length) {
      return fallo("Revisa los datos marcados", { productoIds: "Algún producto ya no existe" });
    }
    if (d.categoriaIds.length && (await db.select({ id: categorias.id }).from(categorias).where(inArray(categorias.id, d.categoriaIds))).length !== d.categoriaIds.length) {
      return fallo("Revisa los datos marcados", { categoriaIds: "Alguna categoría ya no existe" });
    }
    if (
      d.sucursalId &&
      !(await db.select({ id: sucursales.id }).from(sucursales).where(and(eq(sucursales.id, d.sucursalId), eq(sucursales.tipo, "sucursal")))).length
    ) {
      return fallo("Revisa los datos marcados", { sucursalId: "Sucursal inválida" });
    }

    const datos = {
      ...d,
      // Las columnas antiguas (uno solo) ya no se usan.
      productoId: null,
      categoriaId: null,
      // "todo" limitado a una sucursal se guarda como alcance "sucursal" (compatibilidad con el esquema).
      alcance: d.alcance === "todo" && d.sucursalId ? ("sucursal" as const) : d.alcance,
      fechaInicio: inicioDiaBolivia(desde),
      fechaFin: inicioDiaBolivia(hasta, true),
    };

    if (entrada.id === undefined) {
      const [nueva] = await db.insert(promociones).values(datos).returning({ id: promociones.id });
      await registrarAuditoria("promocion_creada", { usuarioId: sesion.uid, detalle: { id: nueva.id, ...d, desde, hasta } });
    } else {
      const id = idPositivo.parse(entrada.id);
      const [editada] = await db.update(promociones).set(datos).where(eq(promociones.id, id)).returning({ id: promociones.id });
      if (!editada) return fallo("La promoción ya no existe");
      await registrarAuditoria("promocion_editada", { usuarioId: sesion.uid, detalle: { id, ...d, desde, hasta } });
    }
    refresh();
    return exito();
  });
}

/** Crea o edita un cupón (código único). Solo administrador. */
export async function guardarCupon(entrada: DatosCupon & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("promociones");
    const v = esquemaCupon.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;

    // Las referencias deben existir.
    const existen = async (tabla: typeof productos | typeof categorias | typeof sucursales, ids: number[]) =>
      ids.length === 0 || (await db.select({ id: tabla.id }).from(tabla).where(inArray(tabla.id, ids))).length === ids.length;
    if (!(await existen(productos, d.productoIds))) return fallo("Revisa los datos marcados", { productoIds: "Algún producto ya no existe" });
    if (!(await existen(categorias, d.categoriaIds))) return fallo("Revisa los datos marcados", { categoriaIds: "Alguna categoría ya no existe" });
    if (!(await existen(sucursales, d.sucursalIds))) return fallo("Revisa los datos marcados", { sucursalIds: "Alguna sucursal ya no existe" });

    try {
      if (entrada.id === undefined) {
        const [nuevo] = await db.insert(cupones).values(d).returning({ id: cupones.id });
        await registrarAuditoria("cupon_creado", { usuarioId: sesion.uid, detalle: { id: nuevo.id, ...d } });
      } else {
        const id = idPositivo.parse(entrada.id);
        const [editado] = await db.update(cupones).set(d).where(eq(cupones.id, id)).returning({ id: cupones.id });
        if (!editado) return fallo("El cupón ya no existe");
        await registrarAuditoria("cupon_editado", { usuarioId: sesion.uid, detalle: { id, ...d } });
      }
    } catch (e) {
      if (esViolacionUnica(e)) return fallo("Revisa los datos marcados", { codigo: "Ese código ya existe" });
      throw e;
    }
    refresh();
    return exito();
  });
}

/** Activa o desactiva un cupón sin tocar el resto. */
export async function cambiarEstadoCupon(entrada: { id: number; activo: boolean }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("promociones");
    const id = idPositivo.parse(entrada.id);
    const activo = entrada.activo === true;
    const [c] = await db.update(cupones).set({ activo }).where(eq(cupones.id, id)).returning({ codigo: cupones.codigo });
    if (!c) return fallo("El cupón ya no existe");
    await registrarAuditoria("cupon_editado", { usuarioId: sesion.uid, detalle: { id, codigo: c.codigo, activo } });
    refresh();
    return exito();
  });
}

/** Solo se eliminan cupones sin usar (los usados quedan como historial de las ventas). */
export async function eliminarCupon(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("promociones");
    const id = idPositivo.parse(entrada.id);
    const [c] = await db.select().from(cupones).where(eq(cupones.id, id));
    if (!c) return fallo("El cupón ya no existe");
    if (c.usosActuales > 0) return fallo("Este cupón ya se usó: no se puede eliminar. Desactívalo si quieres que no se use más.");
    await db.delete(cupones).where(eq(cupones.id, id));
    await registrarAuditoria("cupon_eliminado", { usuarioId: sesion.uid, detalle: { id, codigo: c.codigo } });
    refresh();
    return exito();
  });
}
