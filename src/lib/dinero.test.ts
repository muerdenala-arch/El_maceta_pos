import { describe, expect, it } from "vitest";
import { aCentavos, deCentavos, restar, sumar } from "./dinero";

describe("dinero en centavos", () => {
  it("convierte strings de NUMERIC sin errores de redondeo", () => {
    expect(aCentavos("0.10")).toBe(10n);
    expect(aCentavos("123.4")).toBe(12340n);
    expect(aCentavos("-5.05")).toBe(-505n);
    expect(deCentavos(12340n)).toBe("123.40");
    expect(deCentavos(-5n)).toBe("-0.05");
  });

  it("suma exacta donde el flotante falla (0.1 + 0.2)", () => {
    expect(sumar("0.10", "0.20")).toBe("0.30");
    expect(sumar(...Array(1000).fill("0.01"))).toBe("10.00");
  });

  it("resta para ventas netas", () => {
    expect(restar("150.00", "200.50")).toBe("-50.50");
  });

  it("rechaza montos inválidos", () => {
    expect(() => aCentavos("12,50")).toThrow();
    expect(() => aCentavos("abc")).toThrow();
  });
});
