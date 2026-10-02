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
  | "revision_offline"
  | "evento_por_finalizar";

/** Nombre corto de cada tipo (título de la notificación en el celular; mismos textos que la campanita). */
export const TITULOS_ALERTA: Record<TipoAlerta, string> = {
  agotado: "Agotado",
  stock_bajo: "Stock bajo",
  stock_negativo: "Stock negativo",
  por_vencer: "Por vencer",
  caja_diferencia: "Diferencia en caja",
  qr_por_confirmar: "QR por confirmar",
  solicitud_reposicion: "Pedido de sucursal",
  revision_offline: "Revisar venta",
  evento_por_finalizar: "Reto terminado",
};

/** Días de anticipación para avisar vencimientos. */
export const DIAS_AVISO_VENCIMIENTO = 30;

/** Alerta de stock que corresponde: agotado (≤ 0), bajo (< mínimo) o ninguna. */
export function alertaDeStock(cantidad: number, minimo: number): "agotado" | "stock_bajo" | null {
  if (cantidad <= 0) return "agotado";
  if (minimo > 0 && cantidad < minimo) return "stock_bajo";
  return null;
}

/** Tipos que se resuelven solos al corregirse la causa (el resto se marca como revisado a mano). */
export const TIPOS_AUTOMATICOS: TipoAlerta[] = ["stock_bajo", "agotado", "por_vencer", "stock_negativo", "evento_por_finalizar"];

/** Alertas que recibe el encargado en su campanita: las de stock de su sucursal. */
export const TIPOS_ENCARGADO: TipoAlerta[] = ["stock_bajo", "agotado", "stock_negativo"];

/** Para el encargado, la alerta de stock lleva al inventario de su sucursal, con el producto resaltado. */
export const destinoAlertaEncargado = (productoId: number | null) => (productoId ? `/cajero/bodega?resaltar=${productoId}` : "/cajero/bodega");

type AlertaDestino = {
  tipo: TipoAlerta;
  productoId: number | null;
  sucursalId: number | null;
  cajaId: number | null;
  ventaId: number | null;
  eventoId?: number | null;
  /** La alerta es de la bodega central (no de una sucursal). */
  enBodega?: boolean;
};

/** Pantalla a la que lleva cada alerta (con el producto, caja o venta resaltados). */
export function destinoAlerta(a: AlertaDestino): string {
  const q = new URLSearchParams();
  switch (a.tipo) {
    case "stock_bajo":
    case "agotado":
    case "stock_negativo":
      if (a.productoId) q.set("resaltar", String(a.productoId));
      // Donde está el problema: la bodega central o el inventario de esa sucursal.
      if (a.enBodega) return `/admin/bodega?${q}`;
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
    case "evento_por_finalizar":
      return a.eventoId ? `/admin/eventos/reto-transformacion/${a.eventoId}?vista=pesajes` : "/admin/eventos";
  }
}

/** Módulo del menú donde se cuenta cada alerta (numerito rojo en la barra lateral). */
export function moduloDeAlerta(tipo: TipoAlerta): string {
  if (tipo === "stock_bajo" || tipo === "agotado" || tipo === "stock_negativo") return "/admin/inventario";
  if (tipo === "por_vencer" || tipo === "solicitud_reposicion") return "/admin/bodega";
  if (tipo === "caja_diferencia") return "/admin/auditoria";
  if (tipo === "evento_por_finalizar") return "/admin/eventos";
  return "/admin/reportes";
}
