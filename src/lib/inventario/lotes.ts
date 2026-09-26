/**
 * Reglas de lotes (funciones puras, probadas en lotes.test.ts).
 * FEFO: sale primero lo que vence primero; los lotes sin fecha salen al final.
 */
import type { LoteEnTransito } from "@/db/schema";

export type LoteDisponible = { id: number; vencimiento: string | null; cantidad: number };
export type UsoLote = { id: number; vencimiento: string | null; cantidad: number };

export function ordenarFefo<T extends { vencimiento: string | null; id: number }>(lotes: T[]): T[] {
  return [...lotes].sort((a, b) => {
    if (a.vencimiento !== b.vencimiento) {
      if (a.vencimiento === null) return 1;
      if (b.vencimiento === null) return -1;
      return a.vencimiento < b.vencimiento ? -1 : 1;
    }
    return a.id - b.id;
  });
}

/**
 * Qué cantidad sacar de cada lote para descontar `cantidad` unidades.
 * `faltante` > 0 cuando los lotes registrados no alcanzan (p. ej. stock cargado antes de usar lotes).
 */
export function planificarConsumo(lotes: LoteDisponible[], cantidad: number): { usos: UsoLote[]; faltante: number } {
  const usos: UsoLote[] = [];
  let resta = cantidad;
  for (const lote of ordenarFefo(lotes.filter((l) => l.cantidad > 0))) {
    if (resta <= 0) break;
    const toma = Math.min(lote.cantidad, resta);
    usos.push({ id: lote.id, vencimiento: lote.vencimiento, cantidad: toma });
    resta -= toma;
  }
  return { usos, faltante: resta };
}

/** Agrupa por fecha de vencimiento (para guardar en tránsito o mostrar). */
export function agruparPorVencimiento(partes: { vencimiento: string | null; cantidad: number }[]): LoteEnTransito[] {
  const mapa = new Map<string | null, number>();
  for (const p of partes) if (p.cantidad > 0) mapa.set(p.vencimiento, (mapa.get(p.vencimiento) ?? 0) + p.cantidad);
  return ordenarFefo([...mapa].map(([vencimiento, cantidad], id) => ({ id, vencimiento, cantidad }))).map(
    ({ vencimiento, cantidad }) => ({ vencimiento, cantidad }),
  );
}

/**
 * Ajusta la lista de lotes a exactamente `cantidad` unidades: si faltan, completa con un lote sin fecha;
 * si sobran, recorta desde los que vencen más tarde.
 */
export function completarLotes(lotes: LoteEnTransito[], cantidad: number): LoteEnTransito[] {
  const resultado: LoteEnTransito[] = [];
  let resta = cantidad;
  for (const l of agruparPorVencimiento(lotes)) {
    if (resta <= 0) break;
    const toma = Math.min(l.cantidad, resta);
    resultado.push({ vencimiento: l.vencimiento, cantidad: toma });
    resta -= toma;
  }
  if (resta > 0) return agruparPorVencimiento([...resultado, { vencimiento: null, cantidad: resta }]);
  return resultado;
}

/** Días hasta el vencimiento (negativo = vencido) respecto de `hoy` (AAAA-MM-DD). */
export function diasParaVencer(vencimiento: string, hoy: string) {
  return Math.round((Date.parse(`${vencimiento}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}
