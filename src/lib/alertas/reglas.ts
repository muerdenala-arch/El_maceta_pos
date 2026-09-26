/**
 * Reglas puras de alertas (probadas en reglas.test.ts): qué alerta corresponde a una cantidad
 * y a dónde lleva cada alerta al tocarla en la campanita.
 */

export type TipoAlerta =
  | "stock_bajo"
  | "agotado"
  | "por_vencer"
  | "caja_diferencia"
  | "stock_negativo"
  | "qr_por_confirmar"
  | "solicitud_reposicion"
  | "revision_offline";

/** Días de anticipación para avisar vencimientos. */
export const DIAS_AVISO_VENCIMIENTO = 30;

/** Alerta de stock que corresponde: agotado (≤ 0), bajo (< mínimo) o ninguna. */
export function alertaDeStock(cantidad: number, minimo: number): "agotado" | "stock_bajo" | null {
  if (cantidad <= 0) return "agotado";
  if (minimo > 0 && cantidad < minimo) return "stock_bajo";
  return null;
}

/** Tipos que se resuelven solos al corregirse la causa (el resto se marca como revisado a mano). */
export const TIPOS_AUTOMATICOS: TipoAlerta[] = ["stock_bajo", "agotado", "por_vencer", "stock_negativo"];

type AlertaDestino = {
  tipo: TipoAlerta;
  productoId: number | null;
  sucursalId: number | null;
  cajaId: number | null;
  ventaId: number | null;
};

/** Pantalla a la que lleva cada alerta (con el producto, caja o venta resaltados). */
export function destinoAlerta(a: AlertaDestino): string {
  const q = new URLSearchParams();
  switch (a.tipo) {
    case "stock_bajo":
    case "agotado":
    case "stock_negativo":
      if (a.productoId) q.set("resaltar", String(a.productoId));
      if (a.sucursalId) q.set("sucursal", String(a.sucursalId));
      return `/admin/inventario?${q}`;
    case "por_vencer":
      q.set("vista", "vencimientos");
      if (a.productoId) q.set("resaltar", String(a.productoId));
      return `/admin/bodega?${q}`;
    case "solicitud_reposicion":
      return "/admin/bodega";
    case "caja_diferencia":
      q.set("vista", "cajas");
      if (a.cajaId) q.set("caja", String(a.cajaId));
      return `/admin/auditoria?${q}`;
    case "qr_por_confirmar":
    case "revision_offline":
      return a.ventaId ? `/admin/reportes?venta=${a.ventaId}` : "/admin/reportes";
  }
}

/** Módulo del menú donde se cuenta cada alerta (numerito rojo en la barra lateral). */
export function moduloDeAlerta(tipo: TipoAlerta): string {
  if (tipo === "stock_bajo" || tipo === "agotado" || tipo === "stock_negativo") return "/admin/inventario";
  if (tipo === "por_vencer" || tipo === "solicitud_reposicion") return "/admin/bodega";
  if (tipo === "caja_diferencia") return "/admin/auditoria";
  return "/admin/reportes";
}
