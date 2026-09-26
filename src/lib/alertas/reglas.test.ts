import { describe, expect, it } from "vitest";
import { alertaDeStock, destinoAlerta, moduloDeAlerta } from "./reglas";

describe("alertas de stock", () => {
  it("agotado en cero o negativo; bajo por debajo del mínimo; nada si alcanza", () => {
    expect(alertaDeStock(0, 5)).toBe("agotado");
    expect(alertaDeStock(-3, 0)).toBe("agotado");
    expect(alertaDeStock(2, 5)).toBe("stock_bajo");
    expect(alertaDeStock(5, 5)).toBeNull();
    expect(alertaDeStock(1, 0)).toBeNull(); // sin mínimo configurado solo avisa al agotarse
  });
});

describe("destino al tocar una alerta", () => {
  const base = { productoId: 7, sucursalId: 3, cajaId: 12, ventaId: 40 };

  it("stock → inventario de esa sucursal con el producto resaltado", () => {
    expect(destinoAlerta({ ...base, tipo: "stock_bajo" })).toBe("/admin/inventario?resaltar=7&sucursal=3");
  });

  it("vencimientos, cajas y ventas llevan a su pantalla", () => {
    expect(destinoAlerta({ ...base, tipo: "por_vencer" })).toBe("/admin/bodega?vista=vencimientos&resaltar=7");
    expect(destinoAlerta({ ...base, tipo: "caja_diferencia" })).toBe("/admin/auditoria?vista=cajas&caja=12");
    expect(destinoAlerta({ ...base, tipo: "qr_por_confirmar" })).toBe("/admin/reportes?venta=40");
    expect(destinoAlerta({ ...base, tipo: "solicitud_reposicion" })).toBe("/admin/bodega");
  });

  it("agrupa por módulo del menú", () => {
    expect(moduloDeAlerta("agotado")).toBe("/admin/inventario");
    expect(moduloDeAlerta("revision_offline")).toBe("/admin/reportes");
  });
});
