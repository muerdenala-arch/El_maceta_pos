import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { inventario, lotes, movimientosInventario, productos, sucursales, type LoteEnTransito } from "@/db/schema";
import { agruparPorVencimiento, planificarConsumo } from "./lotes";

/** Transacción de Drizzle (todo cambio de stock ocurre dentro de una). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type TipoMovimiento = (typeof movimientosInventario.$inferInsert)["tipo"];

/** Error de negocio (stock insuficiente, etc.): se muestra al usuario y deshace la transacción. */
export class ErrorStock extends Error {}

type CambioStock = {
  productoId: number;
  ubicacionId: number;
  /** Positivo = entra, negativo = sale. */
  delta: number;
  tipo: TipoMovimiento;
  usuarioId: number;
  motivo?: string | null;
  referencia?: string | null;
  /** Solo las ventas sincronizadas offline pueden dejar stock negativo (sección 8 del plan). */
  permitirNegativo?: boolean;
  /** Para entradas: lotes con su vencimiento. Si no se indica, entra como un lote sin fecha. */
  lotesEntrada?: LoteEnTransito[];
};

async function nombres(tx: Tx, productoId: number, ubicacionId: number) {
  const [p] = await tx.select({ n: productos.nombre }).from(productos).where(eq(productos.id, productoId));
  const [u] = await tx.select({ n: sucursales.nombre }).from(sucursales).where(eq(sucursales.id, ubicacionId));
  return { producto: p?.n ?? `#${productoId}`, ubicacion: u?.n ?? `#${ubicacionId}` };
}

/**
 * Único punto para cambiar stock: actualiza `inventario` de forma atómica, mueve los lotes (FEFO)
 * y registra el movimiento. Devuelve la cantidad final y los lotes que salieron.
 */
export async function cambiarStock(tx: Tx, c: CambioStock): Promise<{ cantidadFinal: number; lotesSalida: LoteEnTransito[] }> {
  if (!Number.isInteger(c.delta) || c.delta === 0) throw new Error("Cantidad inválida");

  // Suma atómica: dos operaciones simultáneas no pueden pisarse.
  const [{ cantidadFinal }] = await tx
    .insert(inventario)
    .values({ productoId: c.productoId, ubicacionId: c.ubicacionId, cantidad: c.delta })
    .onConflictDoUpdate({
      target: [inventario.productoId, inventario.ubicacionId],
      set: { cantidad: sql`${inventario.cantidad} + ${c.delta}` },
    })
    .returning({ cantidadFinal: inventario.cantidad });

  if (cantidadFinal < 0 && !c.permitirNegativo) {
    const n = await nombres(tx, c.productoId, c.ubicacionId);
    const disponible = cantidadFinal - c.delta;
    throw new ErrorStock(`Stock insuficiente de "${n.producto}" en ${n.ubicacion}: hay ${disponible}, se piden ${-c.delta}`);
  }

  let lotesSalida: LoteEnTransito[] = [];
  if (c.delta > 0) {
    for (const lote of agruparPorVencimiento(c.lotesEntrada ?? [{ vencimiento: null, cantidad: c.delta }])) {
      // Mismo producto, lugar y fecha → se suma al lote existente.
      const mismaFecha = lote.vencimiento === null ? isNull(lotes.fechaVencimiento) : eq(lotes.fechaVencimiento, lote.vencimiento);
      const [existente] = await tx
        .update(lotes)
        .set({ cantidad: sql`${lotes.cantidad} + ${lote.cantidad}` })
        .where(and(eq(lotes.productoId, c.productoId), eq(lotes.ubicacionId, c.ubicacionId), mismaFecha))
        .returning({ id: lotes.id });
      if (!existente) {
        await tx.insert(lotes).values({
          productoId: c.productoId,
          ubicacionId: c.ubicacionId,
          cantidad: lote.cantidad,
          fechaVencimiento: lote.vencimiento,
        });
      }
    }
  } else {
    const disponibles = await tx
      .select({ id: lotes.id, vencimiento: lotes.fechaVencimiento, cantidad: lotes.cantidad })
      .from(lotes)
      .where(and(eq(lotes.productoId, c.productoId), eq(lotes.ubicacionId, c.ubicacionId), gt(lotes.cantidad, 0)))
      .for("update");
    const { usos } = planificarConsumo(disponibles, -c.delta);
    for (const uso of usos) {
      await tx.update(lotes).set({ cantidad: sql`${lotes.cantidad} - ${uso.cantidad}` }).where(eq(lotes.id, uso.id));
    }
    await tx.delete(lotes).where(and(eq(lotes.productoId, c.productoId), eq(lotes.ubicacionId, c.ubicacionId), sql`${lotes.cantidad} <= 0`));
    lotesSalida = agruparPorVencimiento(usos);
  }

  await tx.insert(movimientosInventario).values({
    tipo: c.tipo,
    productoId: c.productoId,
    ubicacionId: c.ubicacionId,
    cantidad: c.delta,
    usuarioId: c.usuarioId,
    motivo: c.motivo ?? null,
    referencia: c.referencia ?? null,
  });

  // Fase 7: aquí se generarán/resolverán las alertas de stock bajo y agotado.
  return { cantidadFinal, lotesSalida };
}
