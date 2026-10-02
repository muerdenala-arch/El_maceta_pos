import { describe, expect, it } from "vitest";
import { esInicio, padreDe } from "./niveles";

describe("navegación por niveles", () => {
  it("los inicios no tienen padre (atrás sale de la app)", () => {
    expect(padreDe("/admin/dashboard")).toBeNull();
    expect(padreDe("/cajero/venta")).toBeNull();
    expect(padreDe("/cajero/apertura")).toBeNull();
    expect(esInicio("/admin/dashboard")).toBe(true);
    expect(padreDe("/encargado/panel")).toBeNull();
    expect(esInicio("/encargado/panel")).toBe(true);
  });

  it("los apartados del menú vuelven al inicio de su rol", () => {
    for (const r of ["/admin/eventos", "/admin/reportes", "/admin/inventario/"]) expect(padreDe(r)).toBe("/admin/dashboard");
    for (const r of ["/cajero/gastos", "/cajero/cierre", "/cajero/ventas"]) expect(padreDe(r)).toBe("/cajero/venta");
    for (const r of ["/encargado/reportes", "/encargado/cajas", "/encargado/transferencias"]) expect(padreDe(r)).toBe("/encargado/panel");
  });

  it("las pantallas internas suben un nivel (sin importar pestañas ni filtros)", () => {
    expect(padreDe("/admin/eventos/reto-transformacion/5?vista=pesajes")).toBe("/admin/eventos/reto-transformacion");
    expect(padreDe("/admin/eventos/reto-transformacion")).toBe("/admin/eventos");
  });

  it("fuera del admin y del cajero no se toca el historial", () => {
    expect(padreDe("/login")).toBeNull();
    expect(padreDe("/comprobante/abc")).toBeNull();
  });
});
