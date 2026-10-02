import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertas, cupones, detalleVenta, productos, ventas } from "@/db/schema";
import { esFraccionado, unidadesDeLinea } from "@/lib/inventario/fraccion";
import { cambiarStock } from "@/lib/inventario/stock";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Venta = typeof ventas.$inferSelect;

/**
 * Anula una venta (las ventas no se borran): devuelve el stock, libera el uso del cupón y resuelve sus alertas.
 * `permitir` decide, con la venta bloqueada, si quien anula puede hacerlo (devuelve el motivo si no).
 * La auditoría la registra quien llama.
 */
export async function anularVentaConStock(p: {
  id: number;
  motivo: string;
  usuarioId: number;
  permitir?: (venta: Venta, tx: Tx) => Promise<string | null>;
}): Promise<{ ok: true; venta: Venta } | { ok: false; error: string }> {
  return db.transaction(async (tx) => {
    const [actual] = await tx.select().from(ventas).where(eq(ventas.id, p.id)).for("update");
    if (!actual) return { ok: false as const, error: "La venta no existe o ya estaba anulada" };
    const negado = await p.permitir?.(actual, tx);
    if (negado) return { ok: false as const, error: negado };
    if (actual.estado === "anulada") return { ok: false as const, error: "La venta no existe o ya estaba anulada" };
    await tx.update(ventas).set({ estado: "anulada", motivoAnulacion: p.motivo }).where(eq(ventas.id, p.id));

    const lineas = await tx
      .select({
        productoId: detalleVenta.productoId,
        cantidad: detalleVenta.cantidad,
        fraccion: detalleVenta.fraccion,
        fraccionado: productos.fraccionado,
        unidadFraccion: productos.unidadFraccion,
        unidadesPorEnvase: productos.unidadesPorEnvase,
      })
      .from(detalleVenta)
      .innerJoin(productos, eq(productos.id, detalleVenta.productoId))
      .where(eq(detalleVenta.ventaId, p.id));
    for (const l of lineas) {
      // Unidades sueltas de un producto que ya no es fraccionado: no hay forma de devolverlas como envase.
      if (l.fraccion && !esFraccionado(l)) continue;
      await cambiarStock(tx, {
        productoId: l.productoId,
        ubicacionId: actual.sucursalId,
        delta: unidadesDeLinea(l, l),
        tipo: "anulacion",
        usuarioId: p.usuarioId,
        motivo: p.motivo,
        referencia: `Venta #${actual.numeroComprobante}`,
      });
    }
    if (actual.cuponId) {
      await tx
        .update(cupones)
        .set({ usosActuales: sql`greatest(${cupones.usosActuales} - 1, 0)` })
        .where(eq(cupones.id, actual.cuponId));
    }
    // Sus alertas pendientes (QR por confirmar, revisión) ya no aplican.
    await tx
      .update(alertas)
      .set({ resuelta: true, leida: true })
      .where(and(eq(alertas.ventaId, p.id), inArray(alertas.tipo, ["qr_por_confirmar", "revision_offline"])));
    return { ok: true as const, venta: actual };
  });
}
