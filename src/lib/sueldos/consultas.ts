import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { movimientosSueldo, sucursales, sueldosMes, usuarios } from "@/db/schema";
import type { Rol } from "@/lib/auth/constantes";
import { resumenSueldo, type ResumenSueldo, type TipoMovimiento } from "./calculo";

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

export type FilaPlanilla = {
  usuarioId: number;
  nombre: string;
  rol: Rol;
  sucursal: string | null;
  activo: boolean;
  /** El sueldo de este mes ya quedó fijado (hubo movimientos o se editó): cambiar el sueldo base no lo altera. */
  fijado: boolean;
  resumen: ResumenSueldo;
  movimientos: MovimientoSueldo[];
};

/** Planilla de un mes: todo el personal activo y quien tenga movimientos ese mes, con su sueldo, movimientos y saldo. */
export async function planillaDelMes(periodo: string): Promise<FilaPlanilla[]> {
  const quien = alias(usuarios, "quien");
  const [personas, fijados, movimientos] = await Promise.all([
    db
      .select({ id: usuarios.id, nombre: usuarios.nombre, rol: usuarios.rol, activo: usuarios.activo, sueldo: usuarios.sueldoMensual, sucursal: sucursales.nombre })
      .from(usuarios)
      .leftJoin(sucursales, eq(sucursales.id, usuarios.sucursalId))
      .orderBy(asc(usuarios.nombre)),
    db.select({ usuarioId: sueldosMes.usuarioId, monto: sueldosMes.monto }).from(sueldosMes).where(eq(sueldosMes.periodo, periodo)),
    db
      .select({
        id: movimientosSueldo.id,
        usuarioId: movimientosSueldo.usuarioId,
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
  ]);
  const fijo = new Map(fijados.map((f) => [f.usuarioId, f.monto]));

  return personas
    .map((p) => {
      const suyos = movimientos
        .filter((m) => m.usuarioId === p.id)
        .map((m) => ({ id: m.id, tipo: m.tipo, monto: m.monto, nota: m.nota, fecha: m.fecha.toISOString(), registradoPor: m.registradoPor, anulado: m.anulado, motivoAnulacion: m.motivoAnulacion }));
      return {
        usuarioId: p.id,
        nombre: p.nombre,
        rol: p.rol,
        sucursal: p.sucursal,
        activo: p.activo,
        fijado: fijo.has(p.id),
        resumen: resumenSueldo(fijo.get(p.id) ?? p.sueldo, suyos),
        movimientos: suyos,
      };
    })
    .filter((f) => f.activo || f.movimientos.length > 0);
}
