/**
 * Apartados del administrador (puro; probado en modulos.test.ts). El encargado tiene **los mismos apartados**, cada uno
 * con un **candado** que maneja el administrador: cerrado (por defecto) = al encargado no le aparece (ni abre escribiendo
 * la dirección); abierto = le aparece y trabaja en él igual que el administrador.
 * Lo único que siempre es solo del administrador: abrir y cerrar los candados.
 */
export const MODULOS_ENCARGADO = [
  "dashboard",
  "reportes",
  "gastos",
  "catalogo",
  "inventario",
  "bodega",
  "promociones",
  "eventos",
  "personal",
  "sueldos",
  "recordatorios",
  "qr",
  "sucursales",
  "auditoria",
  "configuracion",
] as const;
export type ModuloEncargado = (typeof MODULOS_ENCARGADO)[number];

/** Todos los apartados tienen candado. */
export const MODULOS_CON_CANDADO: readonly ModuloEncargado[] = MODULOS_ENCARGADO;

export const NOMBRES_MODULO: Record<ModuloEncargado, string> = {
  dashboard: "Inicio",
  reportes: "Reportes de venta",
  gastos: "Gastos diarios",
  catalogo: "Catálogo",
  inventario: "Inventario de sucursales",
  bodega: "Bodega central",
  promociones: "Promociones y cupones", // incluye los combos (una pestaña del mismo apartado)
  eventos: "Eventos",
  personal: "Personal",
  sueldos: "Sueldos",
  recordatorios: "Recordatorios",
  qr: "QR de cobro",
  sucursales: "Sucursales",
  auditoria: "Auditoría de caja",
  configuracion: "Configuración",
};

/** Apartado al que pertenece una ruta del administrador ("/admin/catalogo/…" → "catalogo"), o null si no es un apartado. */
export function moduloDeRuta(ruta: string): ModuloEncargado | null {
  const partes = ruta.split("?")[0].split("/").filter(Boolean);
  if (partes[0] !== "admin") return null;
  return MODULOS_ENCARGADO.find((m) => m === partes[1]) ?? null;
}

export const esModuloEncargado = (v: unknown): v is ModuloEncargado => MODULOS_ENCARGADO.includes(v as ModuloEncargado);

/** Limpia la lista guardada: solo apartados conocidos, sin repetidos y en el orden del menú. */
export function modulosValidos(lista: readonly string[] | null | undefined): ModuloEncargado[] {
  return MODULOS_CON_CANDADO.filter((m) => lista?.includes(m));
}

/** Pantalla de entrada del encargado: el primer apartado abierto (en el orden del menú), o null si no tiene ninguno. */
export function primerApartado(abiertos: readonly ModuloEncargado[]): string | null {
  const m = MODULOS_ENCARGADO.find((x) => abiertos.includes(x));
  return m ? `/admin/${m}` : null;
}
