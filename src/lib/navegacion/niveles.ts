/**
 * Navegación por niveles (botón atrás del teléfono): cada pantalla tiene un "padre".
 * - Inicio de cada rol (panel del admin, venta del cajero) no tiene padre: atrás sale de la app.
 * - Los apartados del menú (/admin/x, /cajero/x) cuelgan del inicio.
 * - Las pantallas internas cuelgan de la de arriba (/admin/eventos/reto-transformacion/5 → …/reto-transformacion).
 * Pestañas, filtros y fechas cambian solo la URL (?vista=, ?desde=…) sin sumar pasos al historial.
 */

export const INICIO_ADMIN = "/admin/dashboard";
export const INICIO_CAJERO = "/cajero/venta";

/** Pantallas sin padre: los inicios y la apertura de caja (sin caja abierta, la venta vuelve a llevar ahí). */
const RAICES = new Set([INICIO_ADMIN, INICIO_CAJERO, "/cajero/apertura"]);

export const esInicio = (ruta: string) => ruta === INICIO_ADMIN || ruta === INICIO_CAJERO;

export function padreDe(ruta: string): string | null {
  const limpia = ruta.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (RAICES.has(limpia)) return null;
  const partes = limpia.split("/").filter(Boolean);
  if (partes[0] !== "admin" && partes[0] !== "cajero" && partes[0] !== "encargado") return null;
  if (partes.length <= 2) return partes[0] === "admin" ? INICIO_ADMIN : INICIO_CAJERO; // el inicio del encargado es la venta
  return `/${partes.slice(0, -1).join("/")}`;
}
