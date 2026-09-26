/** Formatos para Bolivia: montos "Bs 1.234,50" y fechas en hora de La Paz. */

export const ZONA_HORARIA = "America/La_Paz";

const numeroBs = new Intl.NumberFormat("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Acepta el string que devuelve PostgreSQL para NUMERIC o un número. */
export function formatoBs(monto: string | number) {
  const n = typeof monto === "string" ? Number(monto) : monto;
  const texto = numeroBs.format(Math.abs(n));
  return `${n < 0 ? "-" : ""}Bs ${texto}`;
}

/** Fecha de hoy en Bolivia como "AAAA-MM-DD". */
export function hoyEnBolivia(ahora = new Date()) {
  return ahora.toLocaleDateString("en-CA", { timeZone: ZONA_HORARIA });
}

/** Valida un parámetro "AAAA-MM-DD"; si no es una fecha real, devuelve null. */
export function fechaValida(valor: unknown): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const fecha = new Date(`${valor}T12:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().startsWith(valor) ? valor : null;
}

/** "sábado, 26 de septiembre de 2026" */
export function fechaLarga(isoDia: string) {
  return new Date(`${isoDia}T12:00:00Z`).toLocaleDateString("es-BO", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Inicio del día (00:00) en Bolivia como instante. Bolivia no tiene horario de verano: siempre UTC−4.
 * `diaSiguiente` sirve para guardar fechas finales exclusivas ("vigente hasta el 30" → < 31 00:00).
 */
export function inicioDiaBolivia(isoDia: string, diaSiguiente = false) {
  const d = new Date(`${isoDia}T00:00:00-04:00`);
  if (diaSiguiente) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/** Instante → "AAAA-MM-DD" en Bolivia; con `diaAnterior` deshace una fecha final exclusiva. */
export function diaBolivia(instante: Date, diaAnterior = false) {
  return hoyEnBolivia(diaAnterior ? new Date(instante.getTime() - 1) : instante);
}
