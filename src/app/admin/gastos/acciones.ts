"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { cajas, gastos, sucursales } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarModulo } from "@/lib/auth/modulo-servidor";
import { esquemaAnulacion, esquemaGastoSucursal, type DatosAnulacion, type DatosGastoSucursal } from "@/lib/validaciones/caja";

/**
 * Los gastos no se borran: se anulan con motivo (queda en auditoría).
 * Solo mientras su caja siga abierta: una caja cerrada no se modifica (su cierre ya quedó registrado).
 */
export async function anularGasto(entrada: DatosAnulacion): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("gastos");
    const v = esquemaAnulacion.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);

    const [gasto] = await db
      .select({ id: gastos.id, monto: gastos.monto, categoria: gastos.categoria, anulado: gastos.anulado, estadoCaja: cajas.estado })
      .from(gastos)
      .leftJoin(cajas, eq(cajas.id, gastos.cajaId))
      .where(eq(gastos.id, v.data.id));
    if (!gasto || gasto.anulado) return fallo("El gasto no existe o ya estaba anulado");
    // Un gasto sin caja (del administrador o del encargado) no afecta ningún cierre: se puede anular siempre.
    if (gasto.estadoCaja !== null && gasto.estadoCaja !== "abierta") return fallo("La caja de este gasto ya fue cerrada: no se puede anular");

    await db.update(gastos).set({ anulado: true, motivoAnulacion: v.data.motivo }).where(eq(gastos.id, v.data.id));
    await registrarAuditoria("gasto_anulado", {
      usuarioId: sesion.uid,
      detalle: { id: gasto.id, monto: gasto.monto, categoria: gasto.categoria, motivo: v.data.motivo },
    });
    refresh();
    return exito();
  });
}

/**
 * Gasto de la sucursal registrado por el administrador (en la ubicación que elija) o por el encargado (siempre en la
 * suya). No sale de ninguna caja: cuenta en los reportes, pero no cambia el efectivo esperado de los cajeros.
 */
export async function agregarGasto(entrada: DatosGastoSucursal): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("gastos");
    const v = esquemaGastoSucursal.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;
    const [ubicacion] = await db.select({ id: sucursales.id }).from(sucursales).where(and(eq(sucursales.id, d.sucursalId), eq(sucursales.activo, true)));
    if (!ubicacion) return fallo("Revisa los datos marcados", { sucursalId: "Sucursal inválida o inactiva" });

    const [nuevo] = await db
      .insert(gastos)
      .values({ uuidDispositivo: randomUUID(), cajaId: null, sucursalId: d.sucursalId, usuarioId: sesion.uid, categoria: d.categoria, monto: d.monto, descripcion: d.descripcion, fotoUrl: d.fotoUrl })
      .returning({ id: gastos.id });
    await registrarAuditoria("gasto_registrado", {
      usuarioId: sesion.uid,
      detalle: { id: nuevo.id, sucursalId: d.sucursalId, categoria: d.categoria, monto: d.monto, descripcion: d.descripcion, rol: sesion.rol },
    });
    refresh();
    return exito();
  });
}
