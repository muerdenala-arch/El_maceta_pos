import { describe, expect, it } from "vitest";
import { COTIZACION_VACIA, cotizar, type ProductoCombo } from "@/lib/combos/calculo";
import type { Promocion } from "./motor";
import { calcularVenta, mensajeCupon, type CuponVenta } from "./venta";

const linea = (productoId: number, precio: string, cantidad = 1, categoriaId: number | null = null) => ({ productoId, categoriaId, cantidad, precioUnitario: precio });
const cupon = (c: Partial<CuponVenta> = {}): CuponVenta => ({
  id: 1,
  codigo: "PROMO",
  tipo: "porcentaje",
  valor: "10",
  montoMinimo: "0",
  alcance: "todo",
  productoIds: [],
  categoriaIds: [],
  acumulaPromociones: false,
  acumulaCombos: false,
  ...c,
});
const promo20: Promocion = { id: 7, nombre: "20 % en proteínas", tipo: "porcentaje", valor: "20", comboLleva: null, comboPaga: null, alcance: "categoria", productoId: null, categoriaId: 1 };
const base = { combos: COTIZACION_VACIA, promociones: [] as Promocion[] };

describe("venta sin cupón ni descuento manual", () => {
  it("equivale a las promociones automáticas; cada línea guarda de dónde viene su descuento", () => {
    const r = calcularVenta({ ...base, lineas: [linea(1, "350.00", 1, 1), linea(2, "120.00", 2)], promociones: [promo20] });
    expect(r).toMatchObject({ subtotal: "590.00", descuentoPromociones: "70.00", descuentoCupon: "0.00", descuentoManual: "0.00", descuento: "70.00", total: "520.00", cupon: null });
    expect(r.lineas.map((l) => [l.descuentoPromocion, l.promocionId, l.total])).toEqual([
      ["70.00", 7, "280.00"],
      ["0.00", null, "240.00"],
    ]);
    expect(r.promocionesAplicadas).toEqual([{ promocionId: 7, nombre: "20 % en proteínas", descuento: "70.00" }]);
  });
});

describe("cupón", () => {
  const lineas = [linea(1, "350.00", 1, 1), linea(2, "120.00", 2)];

  it("porcentaje sobre toda la compra", () => {
    const r = calcularVenta({ ...base, lineas, cupon: cupon() });
    expect(r).toMatchObject({ descuentoCupon: "59.00", total: "531.00", cupon: { estado: "aplicado", descuento: "59.00" } });
    expect(r.lineas.map((l) => l.descuentoCupon)).toEqual(["35.00", "24.00"]);
  });

  it("monto fijo: una sola vez, repartido entre lo que cubre, y nunca más que el importe", () => {
    const r = calcularVenta({ ...base, lineas, cupon: cupon({ tipo: "monto", valor: "20" }) });
    expect(r).toMatchObject({ descuentoCupon: "20.00", total: "570.00" });
    expect(r.lineas.map((l) => l.descuentoCupon)).toEqual(["11.87", "8.13"]); // el centavo sobrante va a la línea de mayor importe
    expect(calcularVenta({ ...base, lineas: [linea(2, "15.00")], cupon: cupon({ tipo: "monto", valor: "20" }) })).toMatchObject({ descuentoCupon: "15.00", total: "0.00" });
  });

  it("solo ciertos productos o categorías", () => {
    const soloCreatina = calcularVenta({ ...base, lineas, cupon: cupon({ alcance: "productos", productoIds: [2] }) });
    expect(soloCreatina.lineas.map((l) => l.descuentoCupon)).toEqual(["0.00", "24.00"]);
    const proteinas = calcularVenta({ ...base, lineas, cupon: cupon({ alcance: "categorias", categoriaIds: [1] }) });
    expect(proteinas.lineas.map((l) => l.descuentoCupon)).toEqual(["35.00", "0.00"]);
    expect(calcularVenta({ ...base, lineas, cupon: cupon({ alcance: "productos", productoIds: [99] }) }).cupon).toEqual({ estado: "no_aplica" });
  });

  it("monto mínimo: cuenta el total antes del cupón (ya con los descuentos automáticos)", () => {
    expect(calcularVenta({ ...base, lineas, cupon: cupon({ montoMinimo: "600" }) })).toMatchObject({ cupon: { estado: "minimo", faltan: "10.00" }, descuentoCupon: "0.00", total: "590.00" });
    expect(calcularVenta({ ...base, lineas, cupon: cupon({ montoMinimo: "590" }) }).cupon?.estado).toBe("aplicado");
    // Con la promoción el total baja a 520: ya no llega a 550.
    expect(calcularVenta({ ...base, lineas, promociones: [promo20], cupon: cupon({ montoMinimo: "550" }) }).cupon).toEqual({ estado: "minimo", faltan: "30.00" });
  });

  it("NO acumulable: en cada producto queda el mayor (cupón o automático), nunca los dos", () => {
    // Proteína: automático 70 (20 %) > cupón 35 → queda el automático. Creatina: sin automático → cupón 24.
    const r = calcularVenta({ ...base, lineas, promociones: [promo20], cupon: cupon() });
    expect(r.lineas.map((l) => [l.descuentoPromocion, l.descuentoCupon, l.promocionId])).toEqual([
      ["70.00", "0.00", 7],
      ["0.00", "24.00", null],
    ]);
    expect(r).toMatchObject({ descuentoPromociones: "70.00", descuentoCupon: "24.00", total: "496.00" });

    // Cupón mayor que el automático: reemplaza a la promoción en esa línea.
    const mayor = calcularVenta({ ...base, lineas, promociones: [promo20], cupon: cupon({ valor: "30" }) });
    expect(mayor.lineas[0]).toMatchObject({ descuentoPromocion: "0.00", descuentoCupon: "105.00", promocionId: null, promocion: null });
    expect(mayor.promocionesAplicadas).toEqual([]);

    // Si no mejora nada, no se usa (y no se gasta).
    const sinEfecto = calcularVenta({ ...base, lineas: [linea(1, "350.00", 1, 1)], promociones: [promo20], cupon: cupon() });
    expect(sinEfecto).toMatchObject({ cupon: { estado: "sin_efecto" }, descuentoCupon: "0.00", total: "280.00" });
  });

  it("acumulable: se calcula sobre lo que queda después del automático y se suma", () => {
    const r = calcularVenta({ ...base, lineas, promociones: [promo20], cupon: cupon({ acumulaPromociones: true }) });
    // Proteína: 350 − 70 = 280 → 10 % = 28. Creatina: 240 → 24.
    expect(r.lineas.map((l) => [l.descuentoPromocion, l.descuentoCupon])).toEqual([
      ["70.00", "28.00"],
      ["0.00", "24.00"],
    ]);
    expect(r).toMatchObject({ descuento: "122.00", total: "468.00" });
  });
});

describe("cupón y combos", () => {
  const productos = new Map<number, ProductoCombo>(
    [
      { id: 1, precioVenta: "350.00" },
      { id: 2, precioVenta: "120.00" },
    ].map((p) => [p.id, { ...p, precioUnidad: null, fraccionado: false, unidadFraccion: null, unidadesPorEnvase: null }]),
  );
  const combos = cotizar(
    [{ comboId: 5, cantidad: 1 }],
    [{ id: 5, nombre: "Combo", tipoDescuento: "monto", valorDescuento: "40", items: [{ productoId: 1, cantidad: 1, fraccion: false }, { productoId: 2, cantidad: 2, fraccion: false }] }],
    productos,
  );

  it("por defecto el cupón no toca los combos: solo los productos sueltos", () => {
    const r = calcularVenta({ combos, promociones: [], lineas: [linea(2, "120.00")], cupon: cupon() });
    expect(r).toMatchObject({ subtotal: "710.00", descuentoCombos: "40.00", descuentoCupon: "12.00", total: "658.00" });
    expect(r.lineas.filter((l) => l.combo !== null).every((l) => l.descuentoCupon === "0.00")).toBe(true);
    // Carrito solo con combos: no aplica.
    expect(calcularVenta({ combos, promociones: [], lineas: [], cupon: cupon() }).cupon).toEqual({ estado: "no_aplica" });
  });

  it("si se acumula con combos, descuenta sobre el precio del combo ya rebajado", () => {
    const r = calcularVenta({ combos, promociones: [], lineas: [], cupon: cupon({ acumulaCombos: true }) });
    // Combo: 590 − 40 = 550 → 10 % = 55.
    expect(r).toMatchObject({ descuentoCombos: "40.00", descuentoCupon: "55.00", total: "495.00" });
    expect(r.lineas.map((l) => l.combo)).toEqual([0, 0]);
  });
});

describe("descuento manual del cajero", () => {
  it("porcentaje sobre el total que queda, repartido entre las líneas al centavo", () => {
    const lineas = [linea(1, "350.00", 1, 1), linea(2, "120.00", 2)];
    const r = calcularVenta({ ...base, lineas, promociones: [promo20], cupon: cupon({ acumulaPromociones: true }), manualPorcentaje: "5" });
    // Queda 468 tras promoción y cupón → 5 % = 23,40.
    expect(r).toMatchObject({ descuentoManual: "23.40", descuento: "145.40", total: "444.60" });
    expect(r.lineas.map((l) => l.descuentoManual)).toEqual(["12.60", "10.80"]);
    expect(r.lineas.reduce((s, l) => s + Number(l.total), 0).toFixed(2)).toBe(r.total);
    expect(calcularVenta({ ...base, lineas, manualPorcentaje: "0" }).descuentoManual).toBe("0.00");
  });
});

it("mensajes del cupón para el cajero", () => {
  const bs = (m: string) => `Bs ${m}`;
  expect(mensajeCupon({ estado: "aplicado", descuento: "59.00" }, bs)).toBe("Cupón válido: descuenta Bs 59.00");
  expect(mensajeCupon({ estado: "minimo", faltan: "10.00" }, bs)).toBe("Monto mínimo no alcanzado: faltan Bs 10.00");
  expect(mensajeCupon({ estado: "no_aplica" }, bs)).toMatch(/No aplica/);
  expect(mensajeCupon({ estado: "sin_efecto" }, bs)).toMatch(/No mejora/);
});
