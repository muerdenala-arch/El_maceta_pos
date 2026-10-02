import { describe, expect, it } from "vitest";
import { combosDisponibles, comboVigente, costoCombo, estadoCombo, lineasDeCombo, precioCombo, repartirDescuento, type ProductoCombo } from "./calculo";

const whey: ProductoCombo = { id: 1, precioVenta: "350.00", precioUnidad: null, fraccionado: false, unidadFraccion: null, unidadesPorEnvase: null };
const creatina: ProductoCombo = { id: 2, precioVenta: "120.00", precioUnidad: null, fraccionado: false, unidadFraccion: null, unidadesPorEnvase: null };
const omega: ProductoCombo = { id: 3, precioVenta: "100.00", precioUnidad: "1.50", fraccionado: true, unidadFraccion: "capsula", unidadesPorEnvase: 120 };
const productos = new Map([whey, creatina, omega].map((p) => [p.id, p]));

describe("precio del combo", () => {
  const items = [
    { precio: "350.00", cantidad: 1 },
    { precio: "120.00", cantidad: 2 },
  ];

  it("precio normal = suma; descuento en porcentaje o en Bs; ahorro", () => {
    expect(precioCombo(items, "porcentaje", "10")).toEqual({ normal: "590.00", descuento: "59.00", final: "531.00", ahorroPorcentaje: 10 });
    expect(precioCombo(items, "monto", "40")).toEqual({ normal: "590.00", descuento: "40.00", final: "550.00", ahorroPorcentaje: 6.8 });
    expect(precioCombo(items, "porcentaje", "0")).toMatchObject({ descuento: "0.00", final: "590.00" });
    expect(precioCombo(items, "porcentaje", "12.5")).toMatchObject({ descuento: "73.75", final: "516.25" });
  });

  it("el descuento nunca supera el precio normal ni es negativo", () => {
    expect(precioCombo(items, "monto", "9999")).toMatchObject({ descuento: "590.00", final: "0.00", ahorroPorcentaje: 100 });
    expect(precioCombo([], "porcentaje", "10")).toEqual({ normal: "0.00", descuento: "0.00", final: "0.00", ahorroPorcentaje: 0 });
  });
});

describe("reparto del descuento entre los productos del combo", () => {
  it("es proporcional y suma exactamente el total", () => {
    expect(repartirDescuento(["350.00", "240.00"], "59.00")).toEqual(["35.00", "24.00"]);
    const partes = repartirDescuento(["100.00", "100.00", "100.00"], "100.00");
    expect(partes).toEqual(["33.34", "33.33", "33.33"]);
    expect(partes.reduce((s, p) => s + Number(p), 0).toFixed(2)).toBe("100.00");
  });

  it("ninguna parte supera el importe de su línea; sin descuento todo queda en cero", () => {
    expect(repartirDescuento(["0.01", "500.00"], "500.01")).toEqual(["0.01", "500.00"]);
    expect(repartirDescuento(["10.00", "5.00"], "99.00")).toEqual(["10.00", "5.00"]);
    expect(repartirDescuento(["10.00", "5.00"], "0")).toEqual(["0.00", "0.00"]);
  });
});

describe("vigencia y estado", () => {
  const base = { activo: true, fechaInicio: "2026-10-05", fechaFin: "2026-10-10" };
  it("las dos fechas son inclusivas y opcionales", () => {
    expect(comboVigente(base, "2026-10-04")).toBe(false);
    expect(comboVigente(base, "2026-10-05")).toBe(true);
    expect(comboVigente(base, "2026-10-10")).toBe(true);
    expect(comboVigente(base, "2026-10-11")).toBe(false);
    expect(comboVigente({ activo: true, fechaInicio: null, fechaFin: null }, "2030-01-01")).toBe(true);
    expect(comboVigente({ ...base, activo: false }, "2026-10-06")).toBe(false);
  });
  it("estado para la lista", () => {
    expect(estadoCombo(base, "2026-10-01")).toBe("programado");
    expect(estadoCombo(base, "2026-10-06")).toBe("activo");
    expect(estadoCombo(base, "2026-10-20")).toBe("vencido");
    expect(estadoCombo({ ...base, activo: false }, "2026-10-06")).toBe("inactivo");
  });
});

describe("stock del combo", () => {
  const items = [
    { productoId: 1, cantidad: 1, fraccion: false },
    { productoId: 2, cantidad: 2, fraccion: false },
  ];
  const stock = (s: Record<number, number>) => (id: number) => s[id] ?? 0;

  it("alcanza para tantos combos como permita el producto más escaso; si falta uno, ninguno", () => {
    expect(combosDisponibles(items, productos, stock({ 1: 5, 2: 5 }))).toBe(2);
    expect(combosDisponibles(items, productos, stock({ 1: 5, 2: 1 }))).toBe(0);
    expect(combosDisponibles(items, productos, stock({ 1: 0, 2: 50 }))).toBe(0);
    expect(combosDisponibles([], productos, stock({}))).toBe(0);
    expect(combosDisponibles([{ productoId: 99, cantidad: 1, fraccion: false }], productos, stock({ 99: 9 }))).toBe(0);
  });

  it("productos fraccionados: por envase o por cápsulas, sumando si vienen de las dos formas", () => {
    const conOmega = [
      { productoId: 3, cantidad: 1, fraccion: false }, // 120 cápsulas
      { productoId: 3, cantidad: 30, fraccion: true },
    ];
    expect(combosDisponibles(conOmega, productos, stock({ 3: 300 }))).toBe(2);
    expect(combosDisponibles(conOmega, productos, stock({ 3: 149 }))).toBe(0);
    expect(lineasDeCombo(conOmega, 2)).toEqual([
      { productoId: 3, cantidad: 2, fraccion: false },
      { productoId: 3, cantidad: 60, fraccion: true },
    ]);
  });

  it("costo del combo (las unidades sueltas, a su parte del envase)", () => {
    expect(
      costoCombo([
        { productoId: 1, cantidad: 1, fraccion: false, precioCosto: "280.50", unidadesPorEnvase: null },
        { productoId: 3, cantidad: 30, fraccion: true, precioCosto: "60.00", unidadesPorEnvase: 120 },
      ]),
    ).toBe(28050n + 1500n);
  });
});
