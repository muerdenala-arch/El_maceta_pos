import { describe, expect, it } from "vitest";
import { limitesDescuento, nivelDescuento } from "./descuento-manual";

describe("límites del descuento manual", () => {
  it("el cajero da hasta su máximo; el encargado, hasta el suyo", () => {
    expect(limitesDescuento("5.00", "15.00", "cajero")).toEqual({ propio: 5, encargado: 15 });
    expect(limitesDescuento("5.00", "15.00", "encargado")).toEqual({ propio: 15, encargado: 15 });
  });

  it("el encargado nunca puede menos que un cajero", () => {
    expect(limitesDescuento("10", "0", "encargado")).toEqual({ propio: 10, encargado: 10 });
    expect(limitesDescuento("10", "4", "cajero")).toEqual({ propio: 10, encargado: 10 });
  });

  it("con todo en 0 nadie da descuentos por su cuenta", () => {
    expect(limitesDescuento("0", "0", "cajero")).toEqual({ propio: 0, encargado: 0 });
    expect(limitesDescuento("", "x", "encargado")).toEqual({ propio: 0, encargado: 0 });
  });

  it("nivel de un porcentaje: libre, con PIN o solo con PIN de administrador", () => {
    const l = limitesDescuento("5", "15", "cajero");
    expect(nivelDescuento(5, l)).toBe("libre");
    expect(nivelDescuento(5.01, l)).toBe("pin");
    expect(nivelDescuento(15, l)).toBe("pin");
    expect(nivelDescuento(20, l)).toBe("pin_admin");
    expect(nivelDescuento(20, limitesDescuento("5", "15", "encargado"))).toBe("pin_admin");
  });
});
