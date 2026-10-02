"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { movimientosSueldo, sueldosMes, usuarios } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { hoyEnBolivia } from "@/lib/formato";
import { periodoDe, periodoVecino } from "@/lib/sueldos/calculo";
import {
  esquemaAnularMovimiento,
  esquemaMovimientoSueldo,
  esquemaSueldo,
  type DatosAnularMovimiento,
  type DatosMovimientoSueldo,
  type DatosSueldo,
} from "@/lib/validaciones/sueldos";

/** No se registran sueldos más allá del mes que viene. */
const periodoPermitido = (periodo: string) => periodo <= periodoVecino(periodoDe(hoyEnBolivia()), 1);

/**
 * Sueldo mensual de una persona. Queda como su sueldo vigente (meses siguientes) y como el sueldo del mes que se
 * está viendo; los otros meses que ya tenían su sueldo fijado no cambian.
 */
export async function guardarSueldo(entrada: DatosSueldo): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaSueldo.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { usuarioId, periodo, monto } = v.data;
    if (!periodoPermitido(periodo)) return fallo("Ese mes todavía no se puede registrar");

    const antes = await db.transaction(async (tx) => {
      const [u] = await tx.select({ nombre: usuarios.nombre, sueldo: usuarios.sueldoMensual }).from(usuarios).where(eq(usuarios.id, usuarioId)).for("update");
      if (!u) return null;
      await tx.update(usuarios).set({ sueldoMensual: monto }).where(eq(usuarios.id, usuarioId));
      await tx
        .insert(sueldosMes)
        .values({ usuarioId, periodo, monto })
        .onConflictDoUpdate({ target: [sueldosMes.usuarioId, sueldosMes.periodo], set: { monto } });
      return u;
    });
    if (!antes) return fallo("La persona ya no existe");
    await registrarAuditoria("sueldo_editado", { usuarioId: sesion.uid, detalle: { id: usuarioId, persona: antes.nombre, periodo, antes: antes.sueldo, despues: monto } });
    refresh();
    return exito();
  });
}

/** Adelanto, descuento, bono o pago de sueldo en un mes. Fija el sueldo de ese mes si aún no lo estaba. */
export async function registrarMovimientoSueldo(entrada: DatosMovimientoSueldo): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaMovimientoSueldo.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;
    if (!periodoPermitido(d.periodo)) return fallo("Ese mes todavía no se puede registrar");

    const persona = await db.transaction(async (tx) => {
      const [u] = await tx.select({ nombre: usuarios.nombre, sueldo: usuarios.sueldoMensual }).from(usuarios).where(eq(usuarios.id, d.usuarioId));
      if (!u) return null;
      await tx.insert(sueldosMes).values({ usuarioId: d.usuarioId, periodo: d.periodo, monto: u.sueldo }).onConflictDoNothing();
      await tx.insert(movimientosSueldo).values({ ...d, registradoPor: sesion.uid });
      return u;
    });
    if (!persona) return fallo("La persona ya no existe");
    await registrarAuditoria("sueldo_movimiento", { usuarioId: sesion.uid, detalle: { id: d.usuarioId, persona: persona.nombre, periodo: d.periodo, tipo: d.tipo, monto: d.monto, nota: d.nota } });
    refresh();
    return exito();
  });
}

/** Los movimientos de sueldo no se borran: se anulan con motivo (queda en auditoría). */
export async function anularMovimientoSueldo(entrada: DatosAnularMovimiento): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const v = esquemaAnularMovimiento.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const [m] = await db
      .update(movimientosSueldo)
      .set({ anulado: true, motivoAnulacion: v.data.motivo })
      .where(and(eq(movimientosSueldo.id, v.data.id), eq(movimientosSueldo.anulado, false)))
      .returning();
    if (!m) return fallo("El movimiento no existe o ya estaba anulado");
    await registrarAuditoria("sueldo_movimiento_anulado", { usuarioId: sesion.uid, detalle: { id: m.usuarioId, periodo: m.periodo, tipo: m.tipo, monto: m.monto, motivo: v.data.motivo } });
    refresh();
    return exito();
  });
}
