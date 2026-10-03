import "server-only";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { cupones, promociones } from "@/db/schema";
import type { Tx } from "@/lib/inventario/stock";
import { hoyEnBolivia } from "@/lib/formato";
import { motivoNoUsable } from "./cupones";
import type { Promocion } from "./motor";
import type { CuponVenta } from "./venta";

const columnas = {
  id: promociones.id,
  nombre: promociones.nombre,
  tipo: promociones.tipo,
  valor: promociones.valor,
  comboLleva: promociones.comboLleva,
  comboPaga: promociones.comboPaga,
  alcance: promociones.alcance,
  productoIds: promociones.productoIds,
  categoriaIds: promociones.categoriaIds,
};

/** Activa, dentro de sus fechas y para esta sucursal (o para todas). */
const vigenteEn = (sucursalId: number, ahora: Date) =>
  and(
    eq(promociones.activo, true),
    lte(promociones.fechaInicio, ahora),
    gt(promociones.fechaFin, ahora),
    or(isNull(promociones.sucursalId), eq(promociones.sucursalId, sucursalId)),
  );

/** Promociones automáticas (sin cupón) vigentes en la sucursal. */
export async function promocionesAutomaticas(sucursalId: number, ejecutor: Db | Tx = db, ahora = new Date()): Promise<Promocion[]> {
  return ejecutor
    .select(columnas)
    .from(promociones)
    .where(and(vigenteEn(sucursalId, ahora), eq(promociones.requiereCupon, false)));
}

export type ResultadoCupon = { ok: true; cupon: CuponVenta } | { ok: false; error: string };

/**
 * Busca un cupón por su código y comprueba lo que no depende del carrito: que exista, esté activo, dentro de sus
 * fechas, con usos disponibles y que valga en la sucursal. Lo que depende del carrito (a qué aplica, monto mínimo,
 * acumulación) lo resuelve `calcularVenta`.
 */
export async function buscarCupon(codigo: string, sucursalId: number, ejecutor: Db | Tx = db, hoy = hoyEnBolivia()): Promise<ResultadoCupon> {
  const [c] = await ejecutor.select().from(cupones).where(eq(cupones.codigo, codigo));
  if (!c) return { ok: false, error: "Ese cupón no existe" };
  const motivo = motivoNoUsable(c, hoy);
  if (motivo) return { ok: false, error: motivo };
  if (c.sucursalIds.length > 0 && !c.sucursalIds.includes(sucursalId)) return { ok: false, error: "Este cupón no vale en esta sucursal" };
  return {
    ok: true,
    cupon: {
      id: c.id,
      codigo: c.codigo,
      tipo: c.tipo === "monto" ? "monto" : "porcentaje",
      valor: c.valor,
      montoMinimo: c.montoMinimo,
      alcance: c.alcance === "productos" || c.alcance === "categorias" ? c.alcance : "todo",
      productoIds: c.productoIds,
      categoriaIds: c.categoriaIds,
      acumulaPromociones: c.acumulaPromociones,
      acumulaCombos: c.acumulaCombos,
    },
  };
}

/** Gasta un uso del cupón dentro de la transacción de la venta. Suma condicionada: dos ventas simultáneas no pasan el límite. */
export async function consumirCupon(tx: Tx, id: number) {
  const [usado] = await tx
    .update(cupones)
    .set({ usosActuales: sql`${cupones.usosActuales} + 1` })
    .where(and(eq(cupones.id, id), or(isNull(cupones.usosMaximos), sql`${cupones.usosActuales} < ${cupones.usosMaximos}`)))
    .returning({ id: cupones.id });
  return !!usado;
}
