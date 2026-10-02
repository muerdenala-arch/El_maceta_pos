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
import { autorizarModulo } from "@/lib/auth/modulo-servidor";
import { aCentavos } from "@/lib/dinero";
import { idPositivo } from "@/lib/validaciones/comunes";
import { esquemaCategoria, esquemaProducto, type DatosProducto } from "@/lib/validaciones/admin";
import { contextoImportacion } from "@/lib/importacion/contexto";
import { leerPlanilla, normalizar } from "@/lib/importacion/productos";
import { aplicarImportacion, unidadesDe } from "@/lib/importacion/aplicar";
import { convertirStockPorFraccion } from "@/lib/inventario/conversion-fraccion";
import { ErrorStock } from "@/lib/inventario/stock";
import * as XLSX from "xlsx";

const ERROR_CODIGO_REPETIDO = { codigoBarras: "Ya hay otro producto con este código de barras" };

async function categoriaExiste(id: number | null) {
  if (id === null) return true;
  const [c] = await db.select({ id: categorias.id }).from(categorias).where(eq(categorias.id, id));
  return !!c;
}

/** Crea o edita un producto. Los productos no se borran (tienen historial de ventas): se desactivan. */
export async function guardarProducto(entrada: DatosProducto & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("catalogo");
    const validado = esquemaProducto.safeParse(entrada);
    if (!validado.success) return falloValidacion(validado.error);
    const datos = validado.data;
    // El encargado no ve ni cambia costos: un producto nuevo queda con costo 0 y al editar se conserva el que tenía.
    const sinCostos = sesion.rol !== "admin";
    if (sinCostos) datos.precioCosto = "0";
    if (!(await categoriaExiste(datos.categoriaId))) {
      return fallo("Revisa los datos marcados", { categoriaId: "La categoría ya no existe" });
    }

    try {
      if (entrada.id === undefined) {
        const [nuevo] = await db.insert(productos).values(datos).returning({ id: productos.id });
        await registrarAuditoria("producto_creado", {
          usuarioId: sesion.uid,
          detalle: { id: nuevo.id, nombre: datos.nombre, precioVenta: datos.precioVenta, precioCosto: datos.precioCosto, rol: sesion.rol },
        });
      } else {
        const id = idPositivo.parse(entrada.id);
        const [antes] = await db.select().from(productos).where(eq(productos.id, id));
        if (!antes) return fallo("El producto ya no existe");
        if (sinCostos) datos.precioCosto = antes.precioCosto;
        // Activar o quitar la venta fraccionada cambia la unidad del stock: todo o nada.
        const conversion = await db.transaction(async (tx) => {
          await tx.update(productos).set(datos).where(eq(productos.id, id));
          return convertirStockPorFraccion(tx, id, antes, datos);
        });
        if (conversion || antes.unidadesPorEnvase !== datos.unidadesPorEnvase || antes.unidadFraccion !== datos.unidadFraccion) {
          await registrarAuditoria("venta_fraccionada_cambiada", {
            usuarioId: sesion.uid,
            detalle: {
              productoId: id,
              producto: datos.nombre,
              fraccionado: datos.fraccionado,
              unidad: datos.unidadFraccion,
              unidadesPorEnvase: datos.unidadesPorEnvase,
              ...(conversion && { stock: conversion.sentido === "a_unidades" ? `× ${conversion.factor}` : `÷ ${conversion.factor}` }),
            },
          });
        }

        // Los cambios de precio son acciones sensibles (sección 4.11 del plan).
        const cambioVenta = aCentavos(antes.precioVenta) !== aCentavos(datos.precioVenta);
        const cambioCosto = aCentavos(antes.precioCosto) !== aCentavos(datos.precioCosto);
        const cambioUnidad = datos.fraccionado && antes.fraccionado && aCentavos(antes.precioUnidad ?? "0") !== aCentavos(datos.precioUnidad ?? "0");
        if (cambioVenta || cambioCosto || cambioUnidad) {
          await registrarAuditoria("cambio_precio", {
            usuarioId: sesion.uid,
            detalle: {
              productoId: id,
              producto: datos.nombre,
              ...(cambioVenta && { precioVenta: { antes: antes.precioVenta, despues: datos.precioVenta } }),
              ...(cambioCosto && { precioCosto: { antes: antes.precioCosto, despues: datos.precioCosto } }),
              ...(cambioUnidad && { precioUnidad: { antes: antes.precioUnidad, despues: datos.precioUnidad } }),
            },
          });
        }
        await registrarAuditoria("producto_editado", { usuarioId: sesion.uid, detalle: { id, nombre: datos.nombre } });
      }
    } catch (e) {
      if (esViolacionUnica(e, "productos_codigo_barras_uq")) return fallo("Revisa los datos marcados", ERROR_CODIGO_REPETIDO);
      if (e instanceof ErrorStock) return fallo(e.message, { fraccionado: e.message });
      throw e;
    }
    refresh();
    return exito();
  });
}

export async function guardarCategoria(entrada: { id?: number; nombre: string }): Promise<Resultado<{ id: number }>> {
  return conPermiso(async () => {
    await autorizarModulo("catalogo");
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
    await autorizarModulo("catalogo");
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

// ---------------------------------------------------------------- Importación desde Excel (Fase 10)

export type ResumenImportacion = {
  aplicado: boolean;
  productos: number;
  unidades: number;
  categoriasNuevas: string[];
  errores: { fila: number; mensajes: string[] }[];
  /** Primeros productos, para revisar antes de confirmar. */
  muestra: { fila: number; nombre: string; detalle: string; precioVenta: string; stock: number }[];
};

const TAMANO_MAXIMO_PLANILLA = 5 * 1024 * 1024;

/**
 * Carga del catálogo desde la planilla modelo. Con `aplicar` = "1" y sin errores, crea las categorías nuevas,
 * los productos y su stock inicial (ingreso con lote y vencimiento) en una sola transacción: o entra todo o nada.
 * Sin `aplicar`, solo revisa y devuelve el resumen y los errores por fila.
 */
export async function importarProductos(formulario: FormData): Promise<Resultado<ResumenImportacion>> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const archivo = formulario.get("archivo");
    const aplicar = formulario.get("aplicar") === "1";
    if (!(archivo instanceof File) || archivo.size === 0) return fallo("Elige la planilla de Excel");
    if (archivo.size > TAMANO_MAXIMO_PLANILLA) return fallo("La planilla supera los 5 MB");

    let filas: Record<string, unknown>[];
    try {
      const libro = XLSX.read(new Uint8Array(await archivo.arrayBuffer()), { cellDates: true });
      const hoja = libro.Sheets[libro.SheetNames.find((n) => normalizar(n) === "productos") ?? libro.SheetNames[0]];
      filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: null, raw: true });
    } catch {
      return fallo("No se pudo leer el archivo. Usa la planilla modelo en formato .xlsx");
    }
    if (filas.length === 0) return fallo("La planilla no tiene productos");

    const ctx = await contextoImportacion();
    const r = leerPlanilla(filas, ctx);
    const unidades = unidadesDe(r);
    const resumen: ResumenImportacion = {
      aplicado: false,
      productos: r.productos.length,
      unidades,
      categoriasNuevas: r.categoriasNuevas,
      errores: r.errores,
      muestra: r.productos.slice(0, 30).map((p) => ({
        fila: p.fila,
        nombre: p.nombre,
        detalle: [p.marca, p.sabor, p.presentacion].filter(Boolean).join(" · "),
        precioVenta: p.precioVenta,
        stock: p.stock.reduce((t, x) => t + x.cantidad, 0),
      })),
    };
    if (!aplicar || r.errores.length > 0 || r.productos.length === 0) return exito(resumen);

    try {
      await aplicarImportacion(r, ctx, sesion.uid);
    } catch (e) {
      // Otro usuario creó el mismo código mientras tanto: se vuelve a revisar la planilla.
      if (esViolacionUnica(e, "productos_codigo_barras_uq")) return fallo("Un código de barras ya existe: vuelve a revisar la planilla");
      throw e;
    }
    await registrarAuditoria("productos_importados", {
      usuarioId: sesion.uid,
      detalle: { productos: r.productos.length, unidades, categoriasNuevas: r.categoriasNuevas, archivo: archivo.name.slice(0, 120) },
    });
    refresh();
    return exito({ ...resumen, aplicado: true });
  });
}
