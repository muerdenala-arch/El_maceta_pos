import { describe, expect, it } from "vitest";
import { claveProducto, leerPlanilla, normalizar, type ContextoImportacion } from "./productos";

const ctx = (): ContextoImportacion => ({
  categorias: new Map([["proteinas", 1]]),
  ubicaciones: [
    { id: 1, nombre: "Bodega central" },
    { id: 2, nombre: "Sucursal Norte" },
  ],
  codigosExistentes: new Set(["7890000000001"]),
  clavesExistentes: new Set([claveProducto({ nombre: "Creatina Pura", sabor: null, presentacion: "300 g" })]),
});

const fila = (extra: Record<string, unknown> = {}) => ({
  Nombre: "Whey Gold",
  Marca: "ON",
  Categoría: "Proteínas",
  Sabor: "Chocolate",
  Presentación: "2 lb",
  "Precio venta": 350,
  "Precio costo": "280,50",
  "Código de barras": 7501234567890,
  "Stock mínimo": 3,
  Vencimiento: "31/03/2027",
  "Stock Bodega central": 20,
  "Stock Sucursal Norte": "",
  ...extra,
});

describe("leerPlanilla", () => {
  it("convierte montos, código numérico, fechas y stock por ubicación", () => {
    const r = leerPlanilla([fila()], ctx());
    expect(r.errores).toEqual([]);
    expect(r.productos).toEqual([
      {
        fila: 2,
        nombre: "Whey Gold",
        marca: "ON",
        categoria: "Proteínas",
        sabor: "Chocolate",
        presentacion: "2 lb",
        precioVenta: "350.00",
        precioCosto: "280.50",
        codigoBarras: "7501234567890",
        stockMinimo: 3,
        vencimiento: "2027-03-31",
        stock: [{ ubicacionId: 1, cantidad: 20 }],
      },
    ]);
  });

  it("reconoce encabezados sin tildes ni mayúsculas y fechas de Excel", () => {
    const r = leerPlanilla(
      [{ nombre: "BCAA", "precio VENTA": "Bs 1.200,00", "PRECIO COSTO": 900, categoria: "Aminoácidos", vencimiento: new Date(2027, 0, 5), "stock sucursal norte": 4 }],
      ctx(),
    );
    expect(r.errores).toEqual([]);
    expect(r.productos[0]).toMatchObject({ precioVenta: "1200.00", vencimiento: "2027-01-05", stock: [{ ubicacionId: 2, cantidad: 4 }] });
    expect(r.categoriasNuevas).toEqual(["Aminoácidos"]);
  });

  it("informa cada error con su número de fila", () => {
    const r = leerPlanilla(
      [
        fila({ Nombre: "", "Precio venta": "abc" }),
        fila({ "Stock Bodega central": -2, Vencimiento: "2027-02-30" }),
        fila({ "Código de barras": "7890000000001", Nombre: "Otro" }),
        fila({ Nombre: "Creatina Pura", Sabor: "", Presentación: "300 G", "Código de barras": null }),
      ],
      ctx(),
    );
    expect(r.productos).toEqual([]);
    expect(r.errores.map((e) => e.fila)).toEqual([2, 3, 4, 5]);
    expect(r.errores[0].mensajes.join(" ")).toMatch(/Nombre.*Precio venta/);
    expect(r.errores[1].mensajes).toEqual(["Vencimiento: usa AAAA-MM-DD o DD/MM/AAAA", "Stock Bodega central: debe ser un número entero, 0 o más"]);
    expect(r.errores[2].mensajes[0]).toMatch(/ya existe en el catálogo/);
    expect(r.errores[3].mensajes[0]).toMatch(/mismo nombre, sabor y presentación/);
  });

  it("detecta repetidos dentro de la planilla e ignora filas vacías", () => {
    const r = leerPlanilla([fila(), { Nombre: "", Marca: null }, fila({ Sabor: "Vainilla" })], ctx());
    expect(r.productos).toHaveLength(1);
    expect(r.errores).toEqual([{ fila: 4, mensajes: ["Código de barras repetido (también en la fila 2)"] }]);
  });

  it("normaliza texto", () => {
    expect(normalizar("  Categoría   Única ")).toBe("categoria unica");
  });
});
