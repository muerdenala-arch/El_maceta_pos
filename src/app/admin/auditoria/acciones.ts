"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { cajas } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarModulo } from "@/lib/auth/modulo-servidor";
import { cerrarCajaAbierta } from "@/lib/caja/cierre";
import { idPositivo, monto, textoRequerido } from "@/lib/validaciones/comunes";

const esquema = z.object({
  id: idPositivo,
  efectivoContado: monto("Monto inválido"),
  motivo: textoRequerido(300, "El motivo es obligatorio").min(4, "Describe el motivo (mínimo 4 caracteres)"),
});
export type DatosCierreAuditoria = z.input<typeof esquema>;

/**
 * Cierra desde Auditoría una caja que quedó abierta (el cajero fue desactivado, cambió de puesto o se olvidó de
 * cerrarla): mismo cálculo que el cierre del cajero, con el efectivo que se contó y un motivo obligatorio.
 */
export async function cerrarCajaPendiente(entrada: DatosCierreAuditoria): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("auditoria");
    const v = esquema.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);

    const hecho = await db.transaction(async (tx) => {
      const [caja] = await tx
        .select()
        .from(cajas)
        .where(and(eq(cajas.id, v.data.id), eq(cajas.estado, "abierta")))
        .for("update");
      return caja ? cerrarCajaAbierta(tx, caja, v.data.efectivoContado) : null;
    });
    if (!hecho) return fallo("Esa caja ya está cerrada");
    await registrarAuditoria("caja_cerrada_admin", { usuarioId: sesion.uid, detalle: { ...hecho, motivo: v.data.motivo } });
    refresh();
    return exito();
  });
}
