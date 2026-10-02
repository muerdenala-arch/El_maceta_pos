/**
 * Apartados del administrador a los que también entra el encargado de sucursal (puro; probado en modulos.test.ts).
 * Cada uno tiene un **candado** que maneja el administrador: cerrado (por defecto) = el encargado lo ve pero no puede
 * cambiar nada; abierto = puede trabajar en él, siempre dentro de su sucursal y sin ver costos.
 */
export const MODULOS_ENCARGADO = ["catalogo", "inventario", "bodega", "promociones", "combos", "eventos", "qr", "sucursales", "auditoria", "configuracion"] as const;
export type ModuloEncargado = (typeof MODULOS_ENCARGADO)[number];

/** Auditoría es solo consulta: no tiene candado. */
export const MODULOS_CON_CANDADO: readonly ModuloEncargado[] = MODULOS_ENCARGADO.filter((m) => m !== "auditoria");

export const NOMBRES_MODULO: Record<ModuloEncargado, string> = {
  catalogo: "Catálogo",
  inventario: "Inventario de sucursales",
  bodega: "Bodega central",
  promociones: "Promociones y cupones",
  combos: "Combos",
  eventos: "Eventos",
  qr: "QR de cobro",
  sucursales: "Sucursales",
  auditoria: "Auditoría de caja",
  configuracion: "Configuración",
};

/** Apartado al que pertenece una ruta del administrador ("/admin/catalogo/…" → "catalogo"), o null si no es uno del encargado. */
export function moduloDeRuta(ruta: string): ModuloEncargado | null {
  const partes = ruta.split("?")[0].split("/").filter(Boolean);
  if (partes[0] !== "admin") return null;
  return MODULOS_ENCARGADO.find((m) => m === partes[1]) ?? null;
}

export const esModuloEncargado = (v: unknown): v is ModuloEncargado => MODULOS_ENCARGADO.includes(v as ModuloEncargado);

/** Limpia la lista guardada: solo apartados con candado, sin repetidos. */
export function modulosValidos(lista: readonly string[] | null | undefined): ModuloEncargado[] {
  return MODULOS_CON_CANDADO.filter((m) => lista?.includes(m));
}
