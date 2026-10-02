/**
 * Reglas puras del apartado Sueldos (probadas en calculo.test.ts). Cada persona tiene un sueldo mensual; por mes
 * ("2026-10") se registran bonos, descuentos, adelantos y pagos. En centavos exactos.
 *
 *   a pagar   = sueldo + bonos − descuentos
 *   entregado = adelantos + pagos
 *   saldo     = a pagar − entregado   (negativo = se le entregó de más)
 */
import { aCentavos, deCentavos } from "@/lib/dinero";

export const TIPOS_MOVIMIENTO = ["adelanto", "descuento", "bono", "pago"] as const;
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];

export const NOMBRES_MOVIMIENTO: Record<TipoMovimiento, string> = { adelanto: "Adelanto", descuento: "Descuento", bono: "Bono", pago: "Pago de sueldo" };

export type ResumenSueldo = { sueldo: string; bonos: string; descuentos: string; adelantos: string; pagos: string; aPagar: string; entregado: string; saldo: string };

/** Los movimientos anulados no cuentan. */
export function resumenSueldo(sueldo: string, movimientos: { tipo: TipoMovimiento; monto: string; anulado?: boolean }[]): ResumenSueldo {
  const total = (tipo: TipoMovimiento) => movimientos.filter((m) => m.tipo === tipo && !m.anulado).reduce((s, m) => s + aCentavos(m.monto), 0n);
  const [base, bonos, descuentos, adelantos, pagos] = [aCentavos(sueldo || "0"), total("bono"), total("descuento"), total("adelanto"), total("pago")];
  const aPagar = base + bonos - descuentos;
  const entregado = adelantos + pagos;
  return {
    sueldo: deCentavos(base),
    bonos: deCentavos(bonos),
    descuentos: deCentavos(descuentos),
    adelantos: deCentavos(adelantos),
    pagos: deCentavos(pagos),
    aPagar: deCentavos(aPagar),
    entregado: deCentavos(entregado),
    saldo: deCentavos(aPagar - entregado),
  };
}

/** Suma de varios resúmenes (totales del mes). */
export function totalesPlanilla(filas: ResumenSueldo[]): ResumenSueldo {
  const claves = ["sueldo", "bonos", "descuentos", "adelantos", "pagos", "aPagar", "entregado", "saldo"] as const;
  return Object.fromEntries(claves.map((k) => [k, deCentavos(filas.reduce((s, f) => s + aCentavos(f[k]), 0n))])) as ResumenSueldo;
}

export const periodoValido = (p: unknown): p is string => typeof p === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

/** Mes de un día "AAAA-MM-DD" → "AAAA-MM". */
export const periodoDe = (dia: string) => dia.slice(0, 7);

/** Mes anterior (−1) o siguiente (+1). */
export function periodoVecino(periodo: string, delta: number) {
  const [a, m] = periodo.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "octubre de 2026" */
export function nombrePeriodo(periodo: string) {
  const [a, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("es-BO", { timeZone: "UTC", month: "long", year: "numeric" });
}
