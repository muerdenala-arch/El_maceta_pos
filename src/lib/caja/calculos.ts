/**
 * Cálculos de venta y de cierre de caja (puros, en centavos exactos; probados en calculos.test.ts).
 * Los mismos se usan en la pantalla y en el servidor: el servidor siempre recalcula con los
 * precios de la BD, nunca confía en los del dispositivo.
 */
import { aCentavos, deCentavos } from "@/lib/dinero";

export type LineaPrecio = { precioUnitario: string; cantidad: number };

export function totalesVenta(lineas: LineaPrecio[], descuento = "0") {
  const subtotal = lineas.reduce((s, l) => s + aCentavos(l.precioUnitario) * BigInt(l.cantidad), 0n);
  const desc = aCentavos(descuento);
  const total = subtotal - desc > 0n ? subtotal - desc : 0n;
  return { subtotal: deCentavos(subtotal), descuento: deCentavos(desc), total: deCentavos(total) };
}

/** Cambio a devolver; null si lo recibido no alcanza. */
export function cambio(total: string, recibido: string): string | null {
  const diferencia = aCentavos(recibido) - aCentavos(total);
  return diferencia >= 0n ? deCentavos(diferencia) : null;
}

/** Billetes sugeridos para cobrar rápido: exacto y los redondeos hacia arriba más comunes en Bolivia. */
export function montosSugeridos(total: string): string[] {
  const t = aCentavos(total);
  if (t <= 0n) return [];
  // Billetes bolivianos: 10, 20, 50, 100 y 200 Bs.
  const redondeos = [1000n, 2000n, 5000n, 10000n, 20000n].map((b) => ((t + b - 1n) / b) * b);
  return [...new Set([t, ...redondeos].filter((m) => m >= t))]
    .sort((a, b) => (a < b ? -1 : 1))
    .slice(0, 4)
    .map(deCentavos);
}

export type ResumenCierre = {
  montoInicial: string;
  ventasEfectivo: string;
  ventasQr: string;
  gastos: string;
  /** Efectivo que debería haber en caja: inicial + ventas en efectivo − gastos. */
  esperado: string;
};

export function resumenCierre(montoInicial: string, ventasEfectivo: string, ventasQr: string, gastos: string): ResumenCierre {
  const esperado = aCentavos(montoInicial) + aCentavos(ventasEfectivo) - aCentavos(gastos);
  return { montoInicial, ventasEfectivo, ventasQr, gastos, esperado: deCentavos(esperado) };
}

/** Contado − esperado: positivo = sobrante, negativo = faltante. */
export function diferenciaCierre(esperado: string, contado: string): string {
  return deCentavos(aCentavos(contado) - aCentavos(esperado));
}

/** Teléfono solo con dígitos (sin código de país ni espacios) para buscar y guardar clientes. */
export function normalizarTelefono(telefono: string, codigoPais = "591"): string {
  let digitos = telefono.replace(/\D/g, "");
  if (digitos.startsWith(codigoPais) && digitos.length > 8) digitos = digitos.slice(codigoPais.length);
  return digitos;
}
