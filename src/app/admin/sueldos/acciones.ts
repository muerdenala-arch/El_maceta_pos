"use server";

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { refresh } from "next/cache";
import { cambiarEstadoUsuario } from "@/app/admin/personal/acciones";
import { db } from "@/db";
import { empleados, eventosEmpleado, movimientosSueldo, sucursales, sueldosMes } from "@/db/schema";
import { conPermiso, exito, fallo, falloValidacion, type Resultado } from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizarModulo } from "@/lib/auth/modulo-servidor";
import { hoyEnBolivia } from "@/lib/formato";
import { periodoDe, periodoVecino } from "@/lib/sueldos/calculo";
import {
  esquemaAnularMovimiento,
  esquemaBaja,
  esquemaMovimientoSueldo,
  esquemaReincorporacion,
  esquemaSueldo,
  esquemaTrabajador,
  type DatosAnularMovimiento,
  type DatosBaja,
  type DatosMovimientoSueldo,
  type DatosReincorporacion,
  type DatosSueldo,
  type DatosTrabajador,
} from "@/lib/validaciones/sueldos";

/** No se registran sueldos más allá del mes que viene. */
const periodoPermitido = (periodo: string) => periodo <= periodoVecino(periodoDe(hoyEnBolivia()), 1);

async function sucursalExiste(id: number | null) {
  if (id === null) return true;
  const [s] = await db.select({ id: sucursales.id }).from(sucursales).where(eq(sucursales.id, id));
  return !!s;
}

/**
 * Nuevo trabajador (sin `id`) o sus datos: nombre, cargo, sucursal, desde cuándo trabaja y sueldo mensual.
 * No hace falta que tenga usuario en el sistema (limpieza, reparto…). Al crearlo queda su ingreso en el historial.
 */
export async function guardarTrabajador(entrada: DatosTrabajador & { id?: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("sueldos");
    const v = esquemaTrabajador.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;
    if (!(await sucursalExiste(d.sucursalId))) return fallo("Revisa los datos marcados", { sucursalId: "Sucursal inválida" });

    if (entrada.id === undefined) {
      const id = await db.transaction(async (tx) => {
        const [nuevo] = await tx.insert(empleados).values(d).returning({ id: empleados.id });
        if (d.fechaIngreso) await tx.insert(eventosEmpleado).values({ empleadoId: nuevo.id, tipo: "ingreso", fecha: d.fechaIngreso, registradoPor: sesion.uid });
        return nuevo.id;
      });
      await registrarAuditoria("trabajador_creado", { usuarioId: sesion.uid, detalle: { id, ...d } });
    } else {
      const id = Number(entrada.id);
      const antes = await db.transaction(async (tx) => {
        const [actual] = await tx.select().from(empleados).where(eq(empleados.id, id)).for("update");
        if (!actual) return null;
        await tx.update(empleados).set(d).where(eq(empleados.id, id));
        // La fecha de ingreso del historial sigue a la que se corrige aquí.
        if (d.fechaIngreso && d.fechaIngreso !== actual.fechaIngreso) {
          const [ingreso] = await tx.select({ id: eventosEmpleado.id }).from(eventosEmpleado).where(and(eq(eventosEmpleado.empleadoId, id), eq(eventosEmpleado.tipo, "ingreso")));
          if (ingreso) await tx.update(eventosEmpleado).set({ fecha: d.fechaIngreso }).where(eq(eventosEmpleado.id, ingreso.id));
          else await tx.insert(eventosEmpleado).values({ empleadoId: id, tipo: "ingreso", fecha: d.fechaIngreso, registradoPor: sesion.uid });
        }
        return actual;
      });
      if (!antes) return fallo("El trabajador ya no existe");
      await registrarAuditoria("trabajador_editado", {
        usuarioId: sesion.uid,
        detalle: { id, persona: d.nombre, antes: { fechaIngreso: antes.fechaIngreso, sueldo: antes.sueldoMensual, cargo: antes.cargo }, despues: { fechaIngreso: d.fechaIngreso, sueldo: d.sueldoMensual, cargo: d.cargo } },
      });
    }
    refresh();
    return exito();
  });
}

/**
 * Sueldo mensual de una persona. Queda como su sueldo vigente (meses siguientes) y como el sueldo del mes que se
 * está viendo; los otros meses que ya tenían su sueldo fijado no cambian.
 */
export async function guardarSueldo(entrada: DatosSueldo): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("sueldos");
    const v = esquemaSueldo.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { empleadoId, periodo, monto } = v.data;
    if (!periodoPermitido(periodo)) return fallo("Ese mes todavía no se puede registrar");

    const antes = await db.transaction(async (tx) => {
      const [e] = await tx.select({ nombre: empleados.nombre, sueldo: empleados.sueldoMensual }).from(empleados).where(eq(empleados.id, empleadoId)).for("update");
      if (!e) return null;
      await tx.update(empleados).set({ sueldoMensual: monto }).where(eq(empleados.id, empleadoId));
      await tx
        .insert(sueldosMes)
        .values({ empleadoId, periodo, monto })
        .onConflictDoUpdate({ target: [sueldosMes.empleadoId, sueldosMes.periodo], set: { monto } });
      return e;
    });
    if (!antes) return fallo("El trabajador ya no existe");
    await registrarAuditoria("sueldo_editado", { usuarioId: sesion.uid, detalle: { empleadoId, persona: antes.nombre, periodo, antes: antes.sueldo, despues: monto } });
    refresh();
    return exito();
  });
}

/** Adelanto, descuento, bono o pago de sueldo en un mes. Fija el sueldo de ese mes si aún no lo estaba. */
export async function registrarMovimientoSueldo(entrada: DatosMovimientoSueldo): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("sueldos");
    const v = esquemaMovimientoSueldo.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const d = v.data;
    if (!periodoPermitido(d.periodo)) return fallo("Ese mes todavía no se puede registrar");

    const persona = await db.transaction(async (tx) => {
      const [e] = await tx.select({ nombre: empleados.nombre, sueldo: empleados.sueldoMensual }).from(empleados).where(eq(empleados.id, d.empleadoId));
      if (!e) return null;
      await tx.insert(sueldosMes).values({ empleadoId: d.empleadoId, periodo: d.periodo, monto: e.sueldo }).onConflictDoNothing();
      await tx.insert(movimientosSueldo).values({ ...d, registradoPor: sesion.uid });
      return e;
    });
    if (!persona) return fallo("El trabajador ya no existe");
    await registrarAuditoria("sueldo_movimiento", { usuarioId: sesion.uid, detalle: { empleadoId: d.empleadoId, persona: persona.nombre, periodo: d.periodo, tipo: d.tipo, monto: d.monto, nota: d.nota } });
    refresh();
    return exito();
  });
}

/** Los movimientos de sueldo no se borran: se anulan con motivo (queda en auditoría). */
export async function anularMovimientoSueldo(entrada: DatosAnularMovimiento): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("sueldos");
    const v = esquemaAnularMovimiento.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const [m] = await db
      .update(movimientosSueldo)
      .set({ anulado: true, motivoAnulacion: v.data.motivo })
      .where(and(eq(movimientosSueldo.id, v.data.id), eq(movimientosSueldo.anulado, false)))
      .returning();
    if (!m) return fallo("El movimiento no existe o ya estaba anulado");
    await registrarAuditoria("sueldo_movimiento_anulado", { usuarioId: sesion.uid, detalle: { empleadoId: m.empleadoId, periodo: m.periodo, tipo: m.tipo, monto: m.monto, motivo: v.data.motivo } });
    refresh();
    return exito();
  });
}

/**
 * Baja de un trabajador (despido, renuncia…): queda la fecha y el motivo en su historial y deja de salir en la
 * planilla de los meses siguientes. Si tiene usuario en el sistema, se le desactiva: ya no puede ingresar.
 */
export async function darDeBajaTrabajador(entrada: DatosBaja): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("sueldos");
    const v = esquemaBaja.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { id, motivo } = v.data;
    const fecha = v.data.fecha!;
    if (fecha > hoyEnBolivia()) return fallo("Revisa los datos marcados", { fecha: "La baja no puede ser en el futuro" });

    const [e] = await db.select().from(empleados).where(and(eq(empleados.id, id), isNull(empleados.fechaBaja)));
    if (!e) return fallo("El trabajador no existe o ya estaba dado de baja");
    if (e.fechaIngreso && fecha < e.fechaIngreso) return fallo("Revisa los datos marcados", { fecha: "La baja no puede ser antes de su ingreso" });

    // Primero su acceso al sistema (mismas reglas que en Personal: no a uno mismo ni al último administrador).
    if (e.usuarioId) {
      const acceso = await cambiarEstadoUsuario({ id: e.usuarioId, activo: false });
      if (!acceso.ok) return fallo(`No se pudo quitar su acceso al sistema: ${acceso.error}`);
    }
    await db.transaction(async (tx) => {
      await tx.update(empleados).set({ fechaBaja: fecha, motivoBaja: motivo }).where(eq(empleados.id, id));
      await tx.insert(eventosEmpleado).values({ empleadoId: id, tipo: "baja", fecha, motivo, registradoPor: sesion.uid });
    });
    await registrarAuditoria("trabajador_baja", { usuarioId: sesion.uid, detalle: { id, persona: e.nombre, fecha, motivo } });
    refresh();
    return exito();
  });
}

/** Vuelve a trabajar: se quita la baja y queda la reincorporación en su historial. Su usuario se reactiva en Personal. */
export async function reincorporarTrabajador(entrada: DatosReincorporacion): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizarModulo("sueldos");
    const v = esquemaReincorporacion.safeParse(entrada);
    if (!v.success) return falloValidacion(v.error);
    const { id } = v.data;
    const fecha = v.data.fecha!;
    const persona = await db.transaction(async (tx) => {
      const [e] = await tx.select().from(empleados).where(and(eq(empleados.id, id), isNotNull(empleados.fechaBaja))).for("update");
      if (!e) return null;
      // Su mes vuelve a contarse desde que regresa.
      await tx.update(empleados).set({ fechaBaja: null, motivoBaja: null, fechaIngreso: fecha }).where(eq(empleados.id, id));
      await tx.insert(eventosEmpleado).values({ empleadoId: id, tipo: "reincorporacion", fecha, registradoPor: sesion.uid });
      return e;
    });
    if (!persona) return fallo("El trabajador no existe o no estaba dado de baja");
    await registrarAuditoria("trabajador_reincorporado", { usuarioId: sesion.uid, detalle: { id, persona: persona.nombre, fecha } });
    refresh();
    return exito();
  });
}
