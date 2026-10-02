import { expect, it } from "vitest";
import { lineasImprimibles } from "./datos";

it("el comprobante muestra cada combo como una línea con el detalle de sus productos, sin repetir la palabra «Combo»", () => {
  const combo = {
    nombre: "Combo Volumen",
    cantidad: 2,
    precioNormal: "590.00",
    subtotal: "1180.00",
    descuento: "80.00",
    productos: [
      { nombre: "Whey", cantidad: 2, unidad: null },
      { nombre: "Omega 3", cantidad: 60, unidad: "capsula" },
    ],
  };
  const [linea] = lineasImprimibles({ lineas: [], combos: [combo] });
  expect(linea).toMatchObject({ nombre: "Combo Volumen", detalle: "2 Whey + 60 cápsulas Omega 3", cantidad: 2, precioUnitario: "590.00", subtotal: "1180.00", descuento: "80.00", promocion: "Descuento del combo" });
  expect(lineasImprimibles({ lineas: [], combos: [{ ...combo, nombre: "Fuerza", descuento: "0.00" }] })[0]).toMatchObject({ nombre: "Combo Fuerza", promocion: null });
  expect(lineasImprimibles({ lineas: [] })).toEqual([]);
});
