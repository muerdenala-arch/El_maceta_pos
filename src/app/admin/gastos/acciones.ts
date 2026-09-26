"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { cajas, gastos } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { esquemaAnulacion, type DatosAnulacion } from "@/lib/validaciones/caja";

/**
 * Los gastos no se borran: se anulan con motivo (queda en auditoría).
 * Solo mientras su caja siga abierta: una caja cerrada no se modifica (su cierre ya quedó registrado).
 */
export async function anularGasto(entrada: DatosAnulacion): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaAnulacion.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);

    const [gasto] = await db
      .select({ id: gastos.id, monto: gastos.monto, categoria: gastos.categoria, anulado: gastos.anulado, estadoCaja: cajas.estado })
      .from(gastos)
      .innerJoin(cajas, eq(cajas.id, gastos.cajaId))
      .where(eq(gastos.id, v.data.id));
    if (!gasto || gasto.anulado) return fallo("El gasto no existe o ya estaba anulado");
    if (gasto.estadoCaja !== "abierta") return fallo("La caja de este gasto ya fue cerrada: no se puede anular");

    await db.update(gastos).set({ anulado: true, motivoAnulacion: v.data.motivo }).where(eq(gastos.id, v.data.id));
    await registrarAuditoria("gasto_anulado", {
      usuarioId: sesion.uid,
      detalle: { id: gasto.id, monto: gasto.monto, categoria: gasto.categoria, motivo: v.data.motivo },
    });
    refresh();
    return exito();
  });
}
