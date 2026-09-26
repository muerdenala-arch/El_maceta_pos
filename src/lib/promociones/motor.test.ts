import { describe, expect, it } from "vitest";
import { aplicarPromociones, describirBeneficio, type LineaCarrito, type Promocion } from "./motor";

const promo = (p: Partial<Promocion> & Pick<Promocion, "id" | "tipo">): Promocion => ({
  nombre: `P${p.id}`,
  valor: "0",
  comboLleva: null,
  comboPaga: null,
  alcance: "todo",
  productoId: null,
  categoriaId: null,
  ...p,
});

const whey: LineaCarrito = { productoId: 1, categoriaId: 10, cantidad: 2, precioUnitario: "350.00" };
const creatina: LineaCarrito = { productoId: 2, categoriaId: 20, cantidad: 1, precioUnitario: "180.50" };
const bcaa: LineaCarrito = { productoId: 3, categoriaId: 20, cantidad: 3, precioUnitario: "99.90" };

describe("sin promociones", () => {
  it("total = subtotal", () => {
    const r = aplicarPromociones([whey, creatina], []);
    expect(r).toMatchObject({ subtotal: "880.50", descuento: "0.00", total: "880.50", aplicadas: [] });
  });
});

describe("porcentaje", () => {
  it("se aplica solo a la categoría y redondea al centavo", () => {
    const r = aplicarPromociones([whey, creatina, bcaa], [promo({ id: 1, tipo: "porcentaje", valor: "15", alcance: "categoria", categoriaId: 20 })]);
    // creatina 180.50 × 15 % = 27.075 → 27.08 ; bcaa 299.70 × 15 % = 44.955 → 44.96
    expect(r.lineas.map((l) => l.descuento)).toEqual(["0.00", "27.08", "44.96"]);
    expect(r.descuento).toBe("72.04");
    expect(r.total).toBe("1108.16");
  });
});

describe("monto fijo por unidad", () => {
  it("descuenta por cada unidad del producto", () => {
    const r = aplicarPromociones([whey], [promo({ id: 1, tipo: "monto_fijo", valor: "20", alcance: "producto", productoId: 1 })]);
    expect(r.lineas[0]).toMatchObject({ descuento: "40.00", total: "660.00", promocion: "P1" });
  });

  it("nunca deja un producto con precio negativo", () => {
    const r = aplicarPromociones([{ ...creatina, precioUnitario: "15.00" }], [promo({ id: 1, tipo: "monto_fijo", valor: "20" })]);
    expect(r.lineas[0].total).toBe("0.00");
  });
});

describe("combos", () => {
  it("2x1 del mismo producto: de cada 2, 1 gratis", () => {
    const r = aplicarPromociones([{ ...whey, cantidad: 5 }], [promo({ id: 1, tipo: "combo", comboLleva: 2, comboPaga: 1, alcance: "producto", productoId: 1 })]);
    expect(r.lineas[0].descuento).toBe("700.00"); // 5 unidades → 2 gratis
  });

  it("3x2 por categoría: sale gratis la unidad más barata", () => {
    const r = aplicarPromociones(
      [creatina, { ...bcaa, cantidad: 2 }],
      [promo({ id: 1, tipo: "combo", comboLleva: 3, comboPaga: 2, alcance: "categoria", categoriaId: 20 })],
    );
    expect(r.lineas.map((l) => l.descuento)).toEqual(["0.00", "99.90"]);
    // La creatina participó en el combo: queda marcada con la promo aunque no salga gratis
    expect(r.descuento).toBe("99.90");
  });

  it("no alcanza para el combo → sin descuento", () => {
    const r = aplicarPromociones([{ ...whey, cantidad: 1 }], [promo({ id: 1, tipo: "combo", comboLleva: 2, comboPaga: 1 })]);
    expect(r.descuento).toBe("0.00");
  });
});

describe("no se acumulan", () => {
  it("cada línea recibe solo la mejor promoción", () => {
    const r = aplicarPromociones(
      [{ ...whey, cantidad: 2 }],
      [
        promo({ id: 1, tipo: "porcentaje", valor: "10" }), // 70
        promo({ id: 2, tipo: "combo", comboLleva: 2, comboPaga: 1, alcance: "producto", productoId: 1 }), // 350
      ],
    );
    expect(r.lineas[0]).toMatchObject({ descuento: "350.00", promocionId: 2 });
    expect(r.aplicadas).toEqual([{ promocionId: 2, nombre: "P2", descuento: "350.00", cuponId: null }]);
  });

  it("las líneas libres toman la siguiente mejor promoción", () => {
    const r = aplicarPromociones(
      [whey, creatina],
      [
        promo({ id: 1, tipo: "porcentaje", valor: "10" }),
        promo({ id: 2, tipo: "monto_fijo", valor: "100", alcance: "producto", productoId: 1 }),
      ],
    );
    expect(r.lineas.map((l) => [l.descuento, l.promocionId])).toEqual([
      ["200.00", 2],
      ["18.05", 1],
    ]);
  });

  it("un cupón compite con las automáticas y queda registrado", () => {
    const r = aplicarPromociones([creatina], [promo({ id: 1, tipo: "porcentaje", valor: "5" }), promo({ id: 7, tipo: "porcentaje", valor: "20", cuponId: 3 })]);
    expect(r.aplicadas).toEqual([{ promocionId: 7, nombre: "P7", descuento: "36.10", cuponId: 3 }]);
  });
});

it("describe el beneficio", () => {
  expect(describirBeneficio({ tipo: "combo", valor: "0", comboLleva: 2, comboPaga: 1 })).toBe("2x1");
  expect(describirBeneficio({ tipo: "porcentaje", valor: "12.5", comboLleva: null, comboPaga: null })).toBe("12,5 % de descuento");
});
