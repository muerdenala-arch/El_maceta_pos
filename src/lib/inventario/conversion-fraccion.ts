import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { detalleTransferencia, inventario, lotes, transferencias } from "@/db/schema";
import { conciliarAlertasStock } from "@/lib/alertas/motor";
import { esFraccionado, factorEnvase, type Fraccionable } from "./fraccion";
import { ErrorStock, type Tx } from "./stock";

/**
 * Al activar o quitar "se vende fraccionado" el stock cambia de unidad: de envases a unidades sueltas
 * (× unidades por envase) o al revés (÷). Se hace en la misma transacción que guarda el producto.
 * Devuelve el factor aplicado (para la auditoría) o null si no hubo conversión.
 */
export async function convertirStockPorFraccion(tx: Tx, productoId: number, antes: Fraccionable, despues: Fraccionable) {
  const eraFraccionado = esFraccionado(antes);
  const esAhora = esFraccionado(despues);
  if (eraFraccionado === esAhora) return null;

  // Lo que está en camino viaja con la unidad anterior: primero hay que recibirlo o cancelarlo.
  const [enCamino] = await tx
    .select({ id: transferencias.id })
    .from(detalleTransferencia)
    .innerJoin(transferencias, eq(transferencias.id, detalleTransferencia.transferenciaId))
    .where(and(eq(detalleTransferencia.productoId, productoId), eq(transferencias.estado, "enviada")))
    .limit(1);
  if (enCamino) throw new ErrorStock(`Este producto tiene una transferencia en camino (T-${enCamino.id}): recíbela o cancélala antes de cambiar la venta fraccionada`);

  const filas = await tx.select({ ubicacionId: inventario.ubicacionId, cantidad: inventario.cantidad }).from(inventario).where(eq(inventario.productoId, productoId)).for("update");

  if (esAhora) {
    const n = factorEnvase(despues);
    await tx.update(inventario).set({ cantidad: sql`${inventario.cantidad} * ${n}` }).where(eq(inventario.productoId, productoId));
    await tx.update(lotes).set({ cantidad: sql`${lotes.cantidad} * ${n}` }).where(eq(lotes.productoId, productoId));
  } else {
    const n = factorEnvase(antes);
    const lotesProducto = await tx.select({ cantidad: lotes.cantidad }).from(lotes).where(eq(lotes.productoId, productoId));
    if ([...filas, ...lotesProducto].some((f) => f.cantidad % n !== 0)) {
      throw new ErrorStock("Quedan unidades sueltas en el stock: ajústalo a envases completos antes de quitar la venta fraccionada");
    }
    await tx.update(inventario).set({ cantidad: sql`${inventario.cantidad} / ${n}` }).where(eq(inventario.productoId, productoId));
    await tx.update(lotes).set({ cantidad: sql`${lotes.cantidad} / ${n}` }).where(eq(lotes.productoId, productoId));
  }
  for (const f of filas) await conciliarAlertasStock(tx, { productoId, sucursalId: f.ubicacionId });
  return { factor: esAhora ? factorEnvase(despues) : factorEnvase(antes), sentido: esAhora ? ("a_unidades" as const) : ("a_envases" as const) };
}
