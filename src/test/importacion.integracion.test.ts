/** Carga del catálogo desde Excel con la planilla modelo real (Fase 10). */
import { and, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { beforeAll, describe, expect, it } from "vitest";
import { importarProductos } from "@/app/admin/catalogo/acciones";
import { GET as plantilla } from "@/app/api/admin/plantilla-productos/route";
import { db } from "@/db";
import { auditoria, categorias, lotes, productos } from "@/db/schema";
import { comoUsuario, prepararBase, stock, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
});

/** Planilla modelo descargada + las filas indicadas (sin la fila de ejemplo). */
async function planilla(filas: (string | number | null)[][]) {
  const libro = XLSX.read(new Uint8Array(await (await plantilla()).arrayBuffer()));
  const [encabezado] = XLSX.utils.sheet_to_json<string[]>(libro.Sheets.Productos, { header: 1 });
  libro.Sheets.Productos = XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
  const datos = new FormData();
  datos.set("archivo", new File([XLSX.write(libro, { type: "array", bookType: "xlsx" })], "catalogo.xlsx"));
  return { datos, encabezado };
}

describe("importar productos", () => {
  it("la plantilla trae una columna de stock por ubicación (bodega primero) y solo la baja el admin", async () => {
    await comoUsuario(b.cajeroNorte);
    expect((await plantilla()).status).toBe(403);
    await comoUsuario(b.admin);
    const { encabezado } = await planilla([]);
    expect(encabezado.slice(-3)).toEqual(["Stock Bodega central", "Stock Sucursal Norte", "Stock Sucursal Sur"]);
  });

  it("revisa sin guardar, muestra errores por fila y no importa nada si hay errores", async () => {
    await comoUsuario(b.admin);
    const { datos } = await planilla([
      ["BCAA 2:1:1", "Marca X", "Aminoácidos", "Limón", "300 g", null, 180, 120, "7790001", 2, "2027-06-30", 30, 5, 0],
      ["Whey Test", "Marca", "Proteínas", null, null, null, 350, 280.5, null, 3, null, 1, 0, 0], // ya existe
    ]);
    const r = await importarProductos(datos);
    if (!r.ok) throw new Error(r.error);
    expect(r.datos).toMatchObject({ aplicado: false, productos: 1, unidades: 35, categoriasNuevas: ["Aminoácidos"] });
    expect(r.datos.errores).toEqual([{ fila: 3, mensajes: ["Ya existe un producto con el mismo nombre, sabor y presentación"] }]);

    datos.set("aplicar", "1");
    const conErrores = await importarProductos(datos);
    expect(conErrores.ok && conErrores.datos.aplicado).toBe(false);
    expect(await db.select().from(productos).where(eq(productos.nombre, "BCAA 2:1:1"))).toHaveLength(0);
  });

  it("aplica todo en una transacción: categorías nuevas, productos, stock con lote y auditoría", async () => {
    await comoUsuario(b.admin);
    const { datos } = await planilla([
      ["BCAA 2:1:1", "Marca X", "Aminoácidos", "Limón", "300 g", "Aminoácidos ramificados para la recuperación", 180, "120,00", "7790001", 2, "30/06/2027", 30, 5, null],
      ["Shaker", null, "Accesorios", null, "600 ml", null, 45, 20, null, 0, null, null, 10, 10],
    ]);
    datos.set("aplicar", "1");
    const r = await importarProductos(datos);
    if (!r.ok) throw new Error(r.error);
    expect(r.datos).toMatchObject({ aplicado: true, productos: 2, unidades: 55, errores: [] });

    const [bcaa] = await db.select().from(productos).where(eq(productos.nombre, "BCAA 2:1:1"));
    expect(bcaa).toMatchObject({ descripcion: "Aminoácidos ramificados para la recuperación", precioVenta: "180.00", precioCosto: "120.00", codigoBarras: "7790001", stockMinimo: 2 });
    const [cat] = await db.select().from(categorias).where(eq(categorias.id, bcaa.categoriaId!));
    expect(cat.nombre).toBe("Aminoácidos");
    expect(await stock(bcaa.id, b.bodega.id)).toBe(30);
    expect(await stock(bcaa.id, b.norte.id)).toBe(5);
    const [lote] = await db.select().from(lotes).where(and(eq(lotes.productoId, bcaa.id), eq(lotes.ubicacionId, b.bodega.id)));
    expect(lote).toMatchObject({ cantidad: 30, fechaVencimiento: "2027-06-30" });
    expect(await db.select().from(auditoria).where(eq(auditoria.accion, "productos_importados"))).toHaveLength(1);

    // Reimportar la misma planilla no duplica: ahora son productos existentes.
    const otra = await importarProductos(datos);
    expect(otra.ok && otra.datos.errores.length).toBe(2);
    expect(await db.select().from(productos).where(eq(productos.nombre, "Shaker"))).toHaveLength(1);
  });

  it("rechaza archivos que no son Excel", async () => {
    await comoUsuario(b.admin);
    const datos = new FormData();
    datos.set("archivo", new File([new Uint8Array([0, 1, 2, 3])], "foto.png"));
    const r = await importarProductos(datos);
    expect(r.ok).toBe(false);
  });
});
