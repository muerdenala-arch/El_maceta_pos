import { describe, expect, it } from "vitest";
import { cambio, diferenciaCierre, montosSugeridos, normalizarTelefono, resumenCierre, totalesVenta } from "./calculos";

describe("totales de venta", () => {
  it("suma exacta en centavos", () => {
    expect(totalesVenta([{ precioUnitario: "0.10", cantidad: 3 }, { precioUnitario: "350.00", cantidad: 2 }])).toEqual({
      subtotal: "700.30",
      descuento: "0.00",
      total: "700.30",
    });
  });

  it("el descuento nunca deja el total negativo", () => {
    expect(totalesVenta([{ precioUnitario: "10", cantidad: 1 }], "25").total).toBe("0.00");
  });
});

describe("cobro en efectivo", () => {
  it("calcula el cambio o avisa si no alcanza", () => {
    expect(cambio("350.50", "400")).toBe("49.50");
    expect(cambio("350.50", "350.50")).toBe("0.00");
    expect(cambio("350.50", "300")).toBeNull();
  });

  it("sugiere billetes redondeando hacia arriba", () => {
    expect(montosSugeridos("350.50")).toEqual(["350.50", "360.00", "400.00"]);
    expect(montosSugeridos("87.00")).toEqual(["87.00", "90.00", "100.00", "200.00"]);
    expect(montosSugeridos("200.00")).toEqual(["200.00"]);
    expect(montosSugeridos("0")).toEqual([]);
  });
});

describe("cierre de caja", () => {
  const r = resumenCierre("200.00", "1500.50", "800.00", "45.50");

  it("esperado = inicial + efectivo − gastos (el QR no entra en el efectivo)", () => {
    expect(r.esperado).toBe("1655.00");
  });

  it("diferencia: sobrante positivo, faltante negativo", () => {
    expect(diferenciaCierre(r.esperado, "1655")).toBe("0.00");
    expect(diferenciaCierre(r.esperado, "1650.00")).toBe("-5.00");
    expect(diferenciaCierre(r.esperado, "1660.00")).toBe("5.00");
  });
});

it("normaliza teléfonos bolivianos", () => {
  expect(normalizarTelefono("+591 712-34567")).toBe("71234567");
  expect(normalizarTelefono("71234567")).toBe("71234567");
  expect(normalizarTelefono("(591) 7 123 4567")).toBe("71234567");
});
