"use server";

import { eq, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { categorias, productos } from "@/db/schema";
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
import { aCentavos } from "@/lib/dinero";
import { idPositivo } from "@/lib/validaciones/comunes";
import { esquemaCategoria, esquemaProducto, type DatosProducto } from "@/lib/validaciones/admin";

const ERROR_CODIGO_REPETIDO = { codigoBarras: "Ya hay otro producto con este código de barras" };

async function categoriaExiste(id: number | null) {
  if (id === null) return true;
  const [c] = await db.select({ id: categorias.id }).from(categorias).where(eq(categorias.id, id));
  return !!c;
}

/** Crea o edita un producto. Los productos no se borran (tienen historial de ventas): se desactivan. */
export async function guardarProducto(entrada: DatosProducto & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const validado = esquemaProducto.safeParse(entrada);
    if (!validado.success) return falloValidacion(validado.error);
    const datos = validado.data;
    if (!(await categoriaExiste(datos.categoriaId))) {
      return fallo("Revisa los datos marcados", { categoriaId: "La categoría ya no existe" });
    }

    try {
      if (entrada.id === undefined) {
        const [nuevo] = await db.insert(productos).values(datos).returning({ id: productos.id });
        await registrarAuditoria("producto_creado", {
          usuarioId: sesion.uid,
          detalle: { id: nuevo.id, nombre: datos.nombre, precioVenta: datos.precioVenta, precioCosto: datos.precioCosto },
        });
      } else {
        const id = idPositivo.parse(entrada.id);
        const [antes] = await db.select().from(productos).where(eq(productos.id, id));
        if (!antes) return fallo("El producto ya no existe");
        await db.update(productos).set(datos).where(eq(productos.id, id));

        // Los cambios de precio son acciones sensibles (sección 4.11 del plan).
        const cambioVenta = aCentavos(antes.precioVenta) !== aCentavos(datos.precioVenta);
        const cambioCosto = aCentavos(antes.precioCosto) !== aCentavos(datos.precioCosto);
        if (cambioVenta || cambioCosto) {
          await registrarAuditoria("cambio_precio", {
            usuarioId: sesion.uid,
            detalle: {
              productoId: id,
              producto: datos.nombre,
              ...(cambioVenta && { precioVenta: { antes: antes.precioVenta, despues: datos.precioVenta } }),
              ...(cambioCosto && { precioCosto: { antes: antes.precioCosto, despues: datos.precioCosto } }),
            },
          });
        }
        await registrarAuditoria("producto_editado", { usuarioId: sesion.uid, detalle: { id, nombre: datos.nombre } });
      }
    } catch (e) {
      if (esViolacionUnica(e, "productos_codigo_barras_uq")) return fallo("Revisa los datos marcados", ERROR_CODIGO_REPETIDO);
      throw e;
    }
    refresh();
    return exito();
  });
}

export async function guardarCategoria(entrada: { id?: number; nombre: string }): Promise<Resultado<{ id: number }>> {
  return conPermiso(async () => {
    await autorizar("admin");
    const validado = esquemaCategoria.safeParse(entrada);
    if (!validado.success) return falloValidacion(validado.error);
    try {
      let id: number;
      if (entrada.id === undefined) {
        [{ id }] = await db.insert(categorias).values(validado.data).returning({ id: categorias.id });
      } else {
        id = idPositivo.parse(entrada.id);
        await db.update(categorias).set(validado.data).where(eq(categorias.id, id));
      }
      refresh();
      return exito({ id });
    } catch (e) {
      if (esViolacionUnica(e)) return fallo("Revisa los datos marcados", { nombre: "Ya existe una categoría con ese nombre" });
      throw e;
    }
  });
}

export async function eliminarCategoria(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(async () => {
    await autorizar("admin");
    const id = idPositivo.parse(entrada.id);
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(productos)
      .where(eq(productos.categoriaId, id));
    if (total > 0) {
      return fallo(`Tiene ${total} producto${total === 1 ? "" : "s"}: cámbialos de categoría antes de eliminarla`);
    }
    await db.delete(categorias).where(eq(categorias.id, id));
    refresh();
    return exito();
  });
}
