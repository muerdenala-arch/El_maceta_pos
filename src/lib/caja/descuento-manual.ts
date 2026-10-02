/**
 * Límites del descuento manual (puro; probado en descuento-manual.test.ts). Configuración guarda dos máximos:
 * el del cajero y el del encargado de sucursal.
 * - `propio`: lo que puede dar por su cuenta quien vende (el encargado nunca menos que un cajero).
 * - `encargado`: hasta dónde puede autorizar un encargado con su PIN. Un administrador autoriza cualquier %.
 */
export function limitesDescuento(maximoCajero: string | number, maximoEncargado: string | number, rol: "admin" | "cajero" | "encargado") {
  const cajero = Math.max(Number(maximoCajero) || 0, 0);
  const encargado = Math.max(Number(maximoEncargado) || 0, cajero);
  return { propio: rol === "encargado" ? encargado : cajero, encargado };
}

/**
 * Qué pasa con un porcentaje en la pantalla de cobro:
 * "libre" (dentro de lo propio), "pin" (necesita el PIN del encargado o de un administrador)
 * o "pin_admin" (supera lo que un encargado puede autorizar: solo con el PIN de un administrador).
 */
export function nivelDescuento(porcentaje: number, limites: { propio: number; encargado: number }): "libre" | "pin" | "pin_admin" {
  if (porcentaje <= limites.propio) return "libre";
  return porcentaje <= limites.encargado ? "pin" : "pin_admin";
}
