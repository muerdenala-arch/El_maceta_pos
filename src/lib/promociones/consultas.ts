import "server-only";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import { cupones, promociones } from "@/db/schema";
import type { Tx } from "@/lib/inventario/stock";
import type { Promocion } from "./motor";

const columnas = {
  id: promociones.id,
  nombre: promociones.nombre,
  tipo: promociones.tipo,
  valor: promociones.valor,
  comboLleva: promociones.comboLleva,
  comboPaga: promociones.comboPaga,
  alcance: promociones.alcance,
  productoId: promociones.productoId,
  categoriaId: promociones.categoriaId,
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

export type ResultadoCupon = { ok: true; promocion: Promocion } | { ok: false; error: string };

/**
 * Valida un cupón para la sucursal: existe, su promoción está vigente y le quedan usos.
 * Con `consumir` (dentro de la transacción de la venta) descuenta un uso de forma atómica.
 */
export async function validarCuponEn(
  codigo: string,
  sucursalId: number,
  ejecutor: Db | Tx = db,
  opciones: { consumir?: boolean; ahora?: Date } = {},
): Promise<ResultadoCupon> {
  const ahora = opciones.ahora ?? new Date();
  const [c] = await ejecutor
    .select({ cuponId: cupones.id, usosMaximos: cupones.usosMaximos, usosActuales: cupones.usosActuales, ...columnas })
    .from(cupones)
    .innerJoin(promociones, eq(promociones.id, cupones.promocionId))
    .where(and(eq(cupones.codigo, codigo), vigenteEn(sucursalId, ahora)));
  if (!c) return { ok: false, error: "Cupón inválido o vencido" };
  if (c.usosMaximos !== null && c.usosActuales >= c.usosMaximos) return { ok: false, error: "Este cupón ya alcanzó su límite de usos" };

  if (opciones.consumir) {
    // Suma condicionada: dos ventas simultáneas no pueden pasar el límite.
    const [usado] = await ejecutor
      .update(cupones)
      .set({ usosActuales: sql`${cupones.usosActuales} + 1` })
      .where(and(eq(cupones.id, c.cuponId), or(isNull(cupones.usosMaximos), sql`${cupones.usosActuales} < ${cupones.usosMaximos}`)))
      .returning({ id: cupones.id });
    if (!usado) return { ok: false, error: "Este cupón ya alcanzó su límite de usos" };
  }

  return {
    ok: true,
    promocion: {
      id: c.id,
      nombre: c.nombre,
      tipo: c.tipo,
      valor: c.valor,
      comboLleva: c.comboLleva,
      comboPaga: c.comboPaga,
      alcance: c.alcance,
      productoId: c.productoId,
      categoriaId: c.categoriaId,
      cuponId: c.cuponId,
    },
  };
}
