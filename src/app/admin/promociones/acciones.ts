"use server";

import { and, eq } from "drizzle-orm";
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
import { autorizar } from "@/lib/auth/sesion";
import { inicioDiaBolivia } from "@/lib/formato";
import { idPositivo } from "@/lib/validaciones/comunes";
import { esquemaCupon, esquemaPromocion, type DatosCupon, type DatosPromocion } from "@/lib/validaciones/promociones";

export async function guardarPromocion(entrada: DatosPromocion & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaPromocion.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { desde, hasta, ...d } = v.data;

    // Las referencias deben existir.
    if (d.productoId && !(await db.select({ id: productos.id }).from(productos).where(eq(productos.id, d.productoId))).length) {
      return fallo("Revisa los datos marcados", { productoId: "El producto ya no existe" });
    }
    if (d.categoriaId && !(await db.select({ id: categorias.id }).from(categorias).where(eq(categorias.id, d.categoriaId))).length) {
      return fallo("Revisa los datos marcados", { categoriaId: "La categoría ya no existe" });
    }
    if (
      d.sucursalId &&
      !(await db.select({ id: sucursales.id }).from(sucursales).where(and(eq(sucursales.id, d.sucursalId), eq(sucursales.tipo, "sucursal")))).length
    ) {
      return fallo("Revisa los datos marcados", { sucursalId: "Sucursal inválida" });
    }

    const datos = {
      ...d,
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

export async function crearCupon(entrada: DatosCupon): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaCupon.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const [promo] = await db.select({ id: promociones.id }).from(promociones).where(eq(promociones.id, v.data.promocionId));
    if (!promo) return fallo("La promoción ya no existe");

    try {
      await db.insert(cupones).values(v.data);
    } catch (e) {
      if (esViolacionUnica(e)) return fallo("Revisa los datos marcados", { codigo: "Ese código ya existe" });
      throw e;
    }
    // Una promoción con cupones deja de aplicarse sola: requiere el código.
    await db.update(promociones).set({ requiereCupon: true }).where(eq(promociones.id, v.data.promocionId));
    await registrarAuditoria("cupon_creado", { usuarioId: sesion.uid, detalle: v.data });
    refresh();
    return exito();
  });
}

/** Solo se eliminan cupones sin usar (los usados quedan como historial de las ventas). */
export async function eliminarCupon(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const id = idPositivo.parse(entrada.id);
    const [c] = await db.select().from(cupones).where(eq(cupones.id, id));
    if (!c) return fallo("El cupón ya no existe");
    if (c.usosActuales > 0) return fallo("Este cupón ya se usó: no se puede eliminar. Desactiva la promoción si quieres que no se use más.");
    await db.delete(cupones).where(eq(cupones.id, id));
    await registrarAuditoria("cupon_eliminado", { usuarioId: sesion.uid, detalle: { id, codigo: c.codigo } });
    refresh();
    return exito();
  });
}
