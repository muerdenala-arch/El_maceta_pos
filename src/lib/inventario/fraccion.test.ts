import { describe, expect, it } from "vitest";
import {
  costoUnidadCentavos,
  desglosar,
  envasesAUnidades,
  esFraccionado,
  minimoEnUnidades,
  stockCorto,
  textoCantidadVendida,
  textoStock,
  unidadesDeLinea,
  unidadesPedidas,
} from "./fraccion";

const omega = { id: 1, fraccionado: true, unidadFraccion: "capsula", unidadesPorEnvase: 120, stockMinimo: 2 };
const normal = { id: 2, fraccionado: false, unidadFraccion: null, unidadesPorEnvase: null, stockMinimo: 5 };
const sobres = { id: 3, fraccionado: true, unidadFraccion: "sobre", unidadesPorEnvase: 30, stockMinimo: 0 };

describe("venta fraccionada", () => {
  it("un producto normal no cambia: una unidad es una unidad", () => {
    expect(esFraccionado(normal)).toBe(false);
    expect(envasesAUnidades(7, normal)).toBe(7);
    expect(textoStock(12, normal)).toBe("12");
    expect(stockCorto(12, normal)).toEqual({ principal: "12", extra: null });
    expect(minimoEnUnidades(normal)).toBe(5);
    expect(unidadesDeLinea({ cantidad: 3 }, normal)).toBe(3);
  });

  it("el stock se muestra como envases + sueltas y el total", () => {
    expect(desglosar(405, omega)).toEqual({ envases: 3, sueltas: 45 });
    expect(textoStock(405, omega)).toBe("3 frascos + 45 cápsulas (405 cápsulas en total)");
    expect(textoStock(120, omega)).toBe("1 frasco (120 cápsulas en total)");
    expect(textoStock(1, omega)).toBe("1 cápsula");
    expect(textoStock(0, omega)).toBe("0 frascos (0 cápsulas en total)");
    expect(textoStock(61, sobres)).toBe("2 cajas + 1 sobre (61 sobres en total)");
    expect(stockCorto(405, omega)).toEqual({ principal: "3", extra: "+45 cápsulas" });
    expect(stockCorto(240, omega)).toEqual({ principal: "2", extra: null });
  });

  it("stock negativo (ventas sin conexión) conserva el signo", () => {
    expect(desglosar(-130, omega)).toEqual({ envases: -1, sueltas: -10 });
    expect(textoStock(-130, omega)).toBe("-1 frasco + 10 cápsulas (-130 cápsulas en total)");
  });

  it("un envase completo descuenta todas sus unidades; las sueltas, tal cual", () => {
    expect(unidadesDeLinea({ cantidad: 2 }, omega)).toBe(240);
    expect(unidadesDeLinea({ cantidad: 30, fraccion: true }, omega)).toBe(30);
    // 2 frascos + 50 sueltas = 290 cápsulas pedidas (se valida contra el total que haya).
    const carrito = [
      { productoId: 1, cantidad: 2 },
      { productoId: 1, cantidad: 50, fraccion: true },
      { productoId: 2, cantidad: 9 },
    ];
    expect(unidadesPedidas(carrito, omega)).toBe(290);
    expect(unidadesPedidas(carrito, normal)).toBe(9);
  });

  it("el mínimo se define en envases", () => {
    expect(minimoEnUnidades(omega)).toBe(240);
    expect(minimoEnUnidades(sobres)).toBe(0);
  });

  it("textos de lo vendido y costo por unidad suelta", () => {
    expect(textoCantidadVendida(30, "capsula")).toBe("30 cápsulas");
    expect(textoCantidadVendida(1, "sobre")).toBe("1 sobre");
    expect(textoCantidadVendida(2, null)).toBe("2");
    expect(costoUnidadCentavos(5000n, omega)).toBe(42n); // Bs 50 ÷ 120 = 0,4167 → 0,42
    expect(costoUnidadCentavos(20000n, sobres)).toBe(667n);
    expect(costoUnidadCentavos(5000n, normal)).toBe(5000n);
  });
});
