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

// ---------------------------------------------------------------- Día de pago ("cumple su mes")

const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/**
 * Próxima fecha en que la persona "cumple su mes" (mismo día del mes en que entró), desde `hoy` inclusive.
 * Si entró un 31 y el mes tiene menos días, se toma el último día del mes. Nunca antes de un mes de trabajado.
 * `dias` = cuántos faltan (0 = hoy).
 */
export function proximoPago(fechaIngreso: string, hoy: string): { fecha: string; dias: number } {
  const [ai, mi, di] = fechaIngreso.split("-").map(Number);
  const [ah, mh] = hoy.split("-").map(Number);
  const enMes = (a: number, m: number) => iso(a, m, Math.min(di, diasDelMes(a, m)));
  // Primer cumplemés: un mes después de entrar.
  const primero = mi === 12 ? enMes(ai + 1, 1) : enMes(ai, mi + 1);
  let fecha = enMes(ah, mh);
  if (fecha < hoy) fecha = mh === 12 ? enMes(ah + 1, 1) : enMes(ah, mh + 1);
  if (fecha < primero) fecha = primero;
  const dias = Math.round((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
  return { fecha, dias };
}

/** "15/11/2026" */
export const fechaCortaDia = (dia: string) => dia.split("-").reverse().join("/");

/** Tiempo trabajado en palabras: "3 años y 2 meses", "5 meses", "12 días". */
export function antiguedad(fechaIngreso: string, hasta: string) {
  const [ai, mi, di] = fechaIngreso.split("-").map(Number);
  const [ah, mh, dh] = hasta.split("-").map(Number);
  if (hasta < fechaIngreso) return "aún no empieza";
  let meses = (ah - ai) * 12 + (mh - mi) - (dh < di ? 1 : 0);
  if (meses < 1) {
    const dias = Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${fechaIngreso}T12:00:00Z`)) / 86_400_000);
    return dias === 1 ? "1 día" : `${dias} días`;
  }
  const anios = Math.floor(meses / 12);
  meses %= 12;
  const partes = [anios > 0 && `${anios} año${anios === 1 ? "" : "s"}`, meses > 0 && `${meses} mes${meses === 1 ? "" : "es"}`].filter(Boolean);
  return partes.join(" y ");
}
