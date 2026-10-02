import { describe, expect, it } from "vitest";
import { estadoCupon, generarCodigo, motivoNoUsable, textoDescuentoCupon } from "./cupones";

const base = { activo: true, fechaInicio: "2026-10-05", fechaFin: "2026-10-10", usosMaximos: 3, usosActuales: 1 };

describe("estado del cupón", () => {
  it("activo dentro de sus fechas (inclusivas) y con usos disponibles", () => {
    expect(estadoCupon(base, "2026-10-05")).toBe("activo");
    expect(estadoCupon(base, "2026-10-10")).toBe("activo");
    expect(estadoCupon({ ...base, fechaInicio: null, fechaFin: null, usosMaximos: null }, "2030-01-01")).toBe("activo");
    expect(motivoNoUsable(base, "2026-10-06")).toBeNull();
  });

  it("programado, vencido, agotado e inactivo, con su mensaje para el cajero", () => {
    expect(estadoCupon(base, "2026-10-04")).toBe("programado");
    expect(motivoNoUsable(base, "2026-10-04")).toBe("Este cupón vale desde el 05/10/2026");
    expect(estadoCupon(base, "2026-10-11")).toBe("vencido");
    expect(motivoNoUsable(base, "2026-10-11")).toBe("Cupón vencido: valía hasta el 10/10/2026");
    expect(estadoCupon({ ...base, usosActuales: 3 }, "2026-10-06")).toBe("agotado");
    expect(motivoNoUsable({ ...base, usosActuales: 3 }, "2026-10-06")).toMatch(/agotado/);
    expect(estadoCupon({ ...base, activo: false }, "2026-10-06")).toBe("inactivo");
    // Vencido pesa más que agotado; inactivo, más que todo.
    expect(estadoCupon({ ...base, usosActuales: 3 }, "2026-10-20")).toBe("vencido");
    expect(estadoCupon({ ...base, activo: false, usosActuales: 3 }, "2026-10-20")).toBe("inactivo");
  });
});

it("genera códigos válidos y sin caracteres confusos", () => {
  let i = 0;
  const codigo = generarCodigo((n) => i++ % n);
  expect(codigo).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  expect(generarCodigo(() => 0, 5)).toBe("AAAAA");
});

it("texto del descuento", () => {
  const bs = (m: string) => `Bs ${m}`;
  expect(textoDescuentoCupon({ tipo: "porcentaje", valor: "12.50" }, bs)).toBe("12,5 %");
  expect(textoDescuentoCupon({ tipo: "monto", valor: "20.00" }, bs)).toBe("Bs 20.00");
});
