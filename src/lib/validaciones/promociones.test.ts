import { describe, expect, it } from "vitest";
import { inicioDiaBolivia, diaBolivia } from "@/lib/formato";
import { codigoCupon, esquemaPromocion } from "./promociones";

const base = {
  nombre: "2x1 Whey",
  tipo: "combo" as const,
  valor: "",
  comboLleva: 2,
  comboPaga: 1,
  alcance: "producto" as const,
  productoIds: [1, 2, 2],
  categoriaIds: [9],
  sucursalId: null,
  desde: "2026-10-01",
  hasta: "2026-10-31",
  requiereCupon: false,
  activo: true,
};

describe("promoción", () => {
  it("limpia los campos que no corresponden al tipo y al alcance", () => {
    const r = esquemaPromocion.parse(base);
    expect(r).toMatchObject({ valor: "0", comboLleva: 2, comboPaga: 1, productoIds: [1, 2], categoriaIds: [] });
  });

  it("valida porcentajes, combos y alcance", () => {
    expect(esquemaPromocion.safeParse({ ...base, tipo: "porcentaje", valor: "150" }).success).toBe(false);
    expect(esquemaPromocion.safeParse({ ...base, tipo: "porcentaje", valor: "12,5" }).success).toBe(true);
    expect(esquemaPromocion.safeParse({ ...base, comboPaga: 2 }).success).toBe(false); // paga igual que lleva
    expect(esquemaPromocion.safeParse({ ...base, productoIds: [] }).success).toBe(false);
    expect(esquemaPromocion.safeParse({ ...base, hasta: "2026-09-30" }).success).toBe(false);
  });

  it("normaliza códigos de cupón", () => {
    expect(codigoCupon.parse(" verano10 ")).toBe("VERANO10");
    expect(codigoCupon.safeParse("con espacio").success).toBe(false);
  });
});

it("vigencia en hora de Bolivia: 'hasta el 31' incluye todo el día 31", () => {
  const fin = inicioDiaBolivia("2026-10-31", true);
  expect(fin.toISOString()).toBe("2026-11-01T04:00:00.000Z");
  expect(diaBolivia(fin, true)).toBe("2026-10-31");
  expect(diaBolivia(inicioDiaBolivia("2026-10-01"))).toBe("2026-10-01");
});
