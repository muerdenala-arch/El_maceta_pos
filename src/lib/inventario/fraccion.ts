/**
 * Venta fraccionada (frasco completo o cápsulas sueltas). Puro y probado en fraccion.test.ts.
 *
 * Regla central: el stock de un producto fraccionado se guarda SIEMPRE en la unidad más pequeña
 * (cápsulas, tabletas, scoops, sobres). Un envase completo equivale a `unidadesPorEnvase` unidades.
 * El stock de los demás productos sigue en unidades normales.
 */

export const UNIDADES_FRACCION = {
  capsula: { uno: "cápsula", varios: "cápsulas", envase: "frasco", envases: "frascos" },
  tableta: { uno: "tableta", varios: "tabletas", envase: "frasco", envases: "frascos" },
  scoop: { uno: "scoop", varios: "scoops", envase: "pote", envases: "potes" },
  sobre: { uno: "sobre", varios: "sobres", envase: "caja", envases: "cajas" },
} as const;

export type UnidadFraccion = keyof typeof UNIDADES_FRACCION;
export const CLAVES_UNIDAD = Object.keys(UNIDADES_FRACCION) as [UnidadFraccion, ...UnidadFraccion[]];

/** Lo que hay que saber de un producto para convertir entre envases y unidades sueltas. */
export type Fraccionable = {
  fraccionado: boolean;
  unidadFraccion: string | null;
  unidadesPorEnvase: number | null;
};

const palabras = (p: Fraccionable) => UNIDADES_FRACCION[(p.unidadFraccion ?? "capsula") as UnidadFraccion] ?? UNIDADES_FRACCION.capsula;
const plural = (n: number, uno: string, varios: string) => `${n} ${Math.abs(n) === 1 ? uno : varios}`;

/** ¿Se controla en unidades sueltas? (fraccionado y con un tamaño de envase válido). */
export const esFraccionado = (p: Fraccionable): p is Fraccionable & { unidadesPorEnvase: number } =>
  p.fraccionado && !!p.unidadesPorEnvase && p.unidadesPorEnvase > 1;

/** Unidades de stock que hay en un envase (1 si no es fraccionado). */
export const factorEnvase = (p: Fraccionable) => (esFraccionado(p) ? p.unidadesPorEnvase : 1);

/** Unidades de stock que salen o entran por `cantidad` envases completos (ingresos, transferencias, ventas por envase). */
export const envasesAUnidades = (cantidad: number, p: Fraccionable) => cantidad * factorEnvase(p);

/** Unidades de stock de una línea de venta: sueltas tal cual, envases multiplicados. */
export const unidadesDeLinea = (l: { cantidad: number; fraccion?: boolean }, p: Fraccionable) => (l.fraccion ? l.cantidad : envasesAUnidades(l.cantidad, p));

/** 405 cápsulas, envase de 120 → { envases: 3, sueltas: 45 } (con signo si el stock es negativo). */
export function desglosar(unidades: number, p: Fraccionable) {
  const n = factorEnvase(p);
  const signo = unidades < 0 ? -1 : 1;
  const abs = Math.abs(unidades);
  return { envases: signo * Math.floor(abs / n), sueltas: signo * (abs % n) };
}

/** "3 frascos + 45 cápsulas (405 cápsulas en total)". Si no es fraccionado: "12". */
export function textoStock(unidades: number, p: Fraccionable) {
  if (!esFraccionado(p)) return String(unidades);
  const u = palabras(p);
  const { envases, sueltas } = desglosar(unidades, p);
  const total = `${plural(unidades, u.uno, u.varios)} en total`;
  if (sueltas === 0) return `${plural(envases, u.envase, u.envases)} (${total})`;
  if (envases === 0) return plural(sueltas, u.uno, u.varios);
  return `${plural(envases, u.envase, u.envases)} + ${plural(Math.abs(sueltas), u.uno, u.varios)} (${total})`;
}

/** Versión corta para celdas de tabla: "3 fr. + 45" → envases y sueltas por separado. */
export function stockCorto(unidades: number, p: Fraccionable) {
  if (!esFraccionado(p)) return { principal: String(unidades), extra: null as string | null };
  const u = palabras(p);
  const { envases, sueltas } = desglosar(unidades, p);
  return { principal: String(envases), extra: sueltas === 0 ? null : `${sueltas > 0 ? "+" : "−"}${Math.abs(sueltas)} ${Math.abs(sueltas) === 1 ? u.uno : u.varios}` };
}

/** "frasco" / "frascos" y "cápsula" / "cápsulas" del producto. */
export const nombreEnvase = (p: Fraccionable, n = 1) => (Math.abs(n) === 1 ? palabras(p).envase : palabras(p).envases);
export const nombreUnidad = (p: Fraccionable | { unidadFraccion: string | null }, n = 2) => {
  const u = palabras({ fraccionado: true, unidadesPorEnvase: 2, ...p });
  return Math.abs(n) === 1 ? u.uno : u.varios;
};

/** Lo vendido, para comprobantes y reportes: "30 cápsulas" (sueltas) o "2" (envases / producto normal). */
export const textoCantidadVendida = (cantidad: number, unidadFraccion: string | null) =>
  unidadFraccion ? plural(cantidad, nombreUnidad({ unidadFraccion }, 1), nombreUnidad({ unidadFraccion })) : String(cantidad);

/** Stock mínimo (definido en envases) expresado en unidades de stock. */
export const minimoEnUnidades = (p: Fraccionable & { stockMinimo: number }) => envasesAUnidades(p.stockMinimo, p);

/**
 * ¿Alcanza el stock para el carrito? Se valida por total de unidades: un envase completo descuenta
 * `unidadesPorEnvase`, sin importar cuántos envases estén cerrados.
 */
export function unidadesPedidas(lineas: { productoId: number; cantidad: number; fraccion?: boolean }[], producto: Fraccionable & { id: number }) {
  return lineas.filter((l) => l.productoId === producto.id).reduce((s, l) => s + unidadesDeLinea(l, producto), 0);
}

/** Costo de una unidad suelta en centavos (redondeado al centavo): costo del envase ÷ unidades. */
export function costoUnidadCentavos(costoEnvaseCentavos: bigint, p: Fraccionable) {
  const n = BigInt(factorEnvase(p));
  return (costoEnvaseCentavos * 2n + n) / (2n * n);
}
