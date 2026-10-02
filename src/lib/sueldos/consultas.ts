import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { empleados, eventosEmpleado, movimientosSueldo, sucursales, sueldosMes, usuarios } from "@/db/schema";
import type { Rol } from "@/lib/auth/constantes";
import { periodoDe, resumenSueldo, type ResumenSueldo, type TipoMovimiento } from "./calculo";

export type MovimientoSueldo = {
  id: number;
  tipo: TipoMovimiento;
  monto: string;
  nota: string | null;
  fecha: string;
  registradoPor: string;
  anulado: boolean;
  motivoAnulacion: string | null;
};

export type EventoTrabajador = { id: number; tipo: "ingreso" | "baja" | "reincorporacion"; fecha: string; motivo: string | null; registradoPor: string };

export type FilaPlanilla = {
  empleadoId: number;
  nombre: string;
  cargo: string | null;
  /** Rol de su usuario en el sistema, si tiene uno. */
  rol: Rol | null;
  sucursalId: number | null;
  sucursal: string | null;
  fechaIngreso: string | null;
  /** Dado de baja: desde cuándo y por qué. */
  fechaBaja: string | null;
  motivoBaja: string | null;
  /** El sueldo de este mes ya quedó fijado (hubo movimientos o se editó): cambiar el sueldo base no lo altera. */
  fijado: boolean;
  resumen: ResumenSueldo;
  movimientos: MovimientoSueldo[];
  historial: EventoTrabajador[];
};

/** Todo usuario del sistema es también un trabajador de la planilla: se agregan los que falten (p. ej. recién creados). */
export async function asegurarEmpleados() {
  await db.execute(sql`
    insert into ${empleados} (nombre, usuario_id, sucursal_id)
    select u.nombre, u.id, u.sucursal_id from ${usuarios} u
    where u.activo and not exists (select 1 from ${empleados} e where e.usuario_id = u.id)
  `);
}

/**
 * Planilla de un mes: los trabajadores activos ese mes (no dados de baja antes) y quien tenga movimientos en él,
 * con su sueldo, movimientos, saldo e historial. Con `conBajas` se incluyen todos los dados de baja.
 */
export async function planillaDelMes(periodo: string, { conBajas = false } = {}): Promise<FilaPlanilla[]> {
  const quien = alias(usuarios, "quien");
  const [personas, fijados, movimientos, eventos] = await Promise.all([
    db
      .select({
        id: empleados.id,
        nombre: empleados.nombre,
        cargo: empleados.cargo,
        rol: usuarios.rol,
        sucursalId: empleados.sucursalId,
        sucursal: sucursales.nombre,
        fechaIngreso: empleados.fechaIngreso,
        fechaBaja: empleados.fechaBaja,
        motivoBaja: empleados.motivoBaja,
        sueldo: empleados.sueldoMensual,
      })
      .from(empleados)
      .leftJoin(usuarios, eq(usuarios.id, empleados.usuarioId))
      .leftJoin(sucursales, eq(sucursales.id, empleados.sucursalId))
      .orderBy(asc(empleados.nombre)),
    db.select({ empleadoId: sueldosMes.empleadoId, monto: sueldosMes.monto }).from(sueldosMes).where(eq(sueldosMes.periodo, periodo)),
    db
      .select({
        id: movimientosSueldo.id,
        empleadoId: movimientosSueldo.empleadoId,
        tipo: movimientosSueldo.tipo,
        monto: movimientosSueldo.monto,
        nota: movimientosSueldo.nota,
        fecha: movimientosSueldo.fecha,
        registradoPor: quien.nombre,
        anulado: movimientosSueldo.anulado,
        motivoAnulacion: movimientosSueldo.motivoAnulacion,
      })
      .from(movimientosSueldo)
      .innerJoin(quien, eq(quien.id, movimientosSueldo.registradoPor))
      .where(eq(movimientosSueldo.periodo, periodo))
      .orderBy(desc(movimientosSueldo.fecha), desc(movimientosSueldo.id)),
    db
      .select({ id: eventosEmpleado.id, empleadoId: eventosEmpleado.empleadoId, tipo: eventosEmpleado.tipo, fecha: eventosEmpleado.fecha, motivo: eventosEmpleado.motivo, registradoPor: quien.nombre })
      .from(eventosEmpleado)
      .innerJoin(quien, eq(quien.id, eventosEmpleado.registradoPor))
      .orderBy(desc(eventosEmpleado.fecha), desc(eventosEmpleado.id)),
  ]);
  const fijo = new Map(fijados.map((f) => [f.empleadoId, f.monto]));

  return personas
    .map((p) => {
      const suyos = movimientos
        .filter((m) => m.empleadoId === p.id)
        .map((m) => ({ id: m.id, tipo: m.tipo, monto: m.monto, nota: m.nota, fecha: m.fecha.toISOString(), registradoPor: m.registradoPor, anulado: m.anulado, motivoAnulacion: m.motivoAnulacion }));
      return {
        empleadoId: p.id,
        nombre: p.nombre,
        cargo: p.cargo,
        rol: p.rol,
        sucursalId: p.sucursalId,
        sucursal: p.sucursal,
        fechaIngreso: p.fechaIngreso,
        fechaBaja: p.fechaBaja,
        motivoBaja: p.motivoBaja,
        fijado: fijo.has(p.id),
        resumen: resumenSueldo(fijo.get(p.id) ?? p.sueldo, suyos),
        movimientos: suyos,
        historial: eventos.filter((e) => e.empleadoId === p.id).map((e) => ({ id: e.id, tipo: e.tipo, fecha: e.fecha, motivo: e.motivo, registradoPor: e.registradoPor })),
      };
    })
    .filter((f) => conBajas || f.fechaBaja === null || periodoDe(f.fechaBaja) >= periodo || f.movimientos.length > 0);
}
