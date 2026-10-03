import "server-only";
import { eq } from "drizzle-orm";
import { alertas, cajas, sucursales, usuarios } from "@/db/schema";
import { aCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import type { Tx } from "@/lib/inventario/stock";
import { diferenciaCierre } from "./calculos";
import { totalesCaja } from "./consultas";

export type CierreHecho = { cajaId: number; esperado: string; contado: string; diferencia: string };

/**
 * Cierra una caja abierta (ya bloqueada con FOR UPDATE por quien llama): fija los totales, queda inmutable y, si el
 * efectivo contado no cuadra, crea la alerta `caja_diferencia`. Lo comparten el cierre del cajero y el cierre que
 * hace el administrador desde Auditoría cuando una caja quedó abierta (cajero desactivado, olvidada…).
 */
export async function cerrarCajaAbierta(tx: Tx, caja: typeof cajas.$inferSelect, contado: string): Promise<CierreHecho> {
  const t = await totalesCaja(caja.id, caja.montoInicial, tx);
  const diferencia = diferenciaCierre(t.esperado, contado);
  await tx
    .update(cajas)
    .set({
      estado: "cerrada",
      cierre: new Date(),
      ventasEfectivo: t.ventasEfectivo,
      ventasQr: t.ventasQr,
      gastos: t.gastos,
      esperado: t.esperado,
      efectivoContado: contado,
      diferencia,
    })
    .where(eq(cajas.id, caja.id));

  if (aCentavos(diferencia) !== 0n) {
    const [u] = await tx.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, caja.cajeroId));
    const [s] = await tx.select({ nombre: sucursales.nombre }).from(sucursales).where(eq(sucursales.id, caja.sucursalId));
    const tipo = aCentavos(diferencia) < 0n ? "faltante" : "sobrante";
    await tx.insert(alertas).values({
      tipo: "caja_diferencia",
      cajaId: caja.id,
      sucursalId: caja.sucursalId,
      mensaje: `Caja de ${u?.nombre} (${s?.nombre}) cerrada con ${tipo} de ${formatoBs(diferencia.replace("-", ""))}`,
    });
  }
  return { cajaId: caja.id, esperado: t.esperado, contado, diferencia };
}
