import "server-only";
import * as XLSX from "xlsx";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categorias, productos, sucursales } from "@/db/schema";
import { claveProducto, COLUMNAS, columnaStock, normalizar, type ContextoImportacion, type Ubicacion } from "./productos";

/** Bodega primero y luego las sucursales activas: una columna de stock por cada una. */
export async function ubicacionesImportacion(): Promise<Ubicacion[]> {
  return db
    .select({ id: sucursales.id, nombre: sucursales.nombre })
    .from(sucursales)
    .where(eq(sucursales.activo, true))
    .orderBy(sql`${sucursales.tipo} = 'bodega' desc`, asc(sucursales.id));
}

export async function contextoImportacion(): Promise<ContextoImportacion> {
  const [cats, existentes, ubicaciones] = await Promise.all([
    db.select({ id: categorias.id, nombre: categorias.nombre }).from(categorias),
    db.select({ nombre: productos.nombre, sabor: productos.sabor, presentacion: productos.presentacion, codigoBarras: productos.codigoBarras }).from(productos),
    ubicacionesImportacion(),
  ]);
  return {
    categorias: new Map(cats.map((c) => [normalizar(c.nombre), c.id])),
    ubicaciones,
    codigosExistentes: new Set(existentes.flatMap((p) => (p.codigoBarras ? [p.codigoBarras] : []))),
    clavesExistentes: new Set(existentes.map(claveProducto)),
  };
}

/** Planilla modelo: hoja "Productos" con los encabezados y un ejemplo, y hoja "Instrucciones". */
export async function plantillaProductos(): Promise<Buffer> {
  const [ubicaciones, cats] = await Promise.all([
    ubicacionesImportacion(),
    db.select({ nombre: categorias.nombre }).from(categorias).orderBy(asc(categorias.nombre)),
  ]);
  const encabezado = [...COLUMNAS, ...ubicaciones.map(columnaStock)];
  const ejemplo = ["Whey Gold Standard", "Optimum Nutrition", cats[0]?.nombre ?? "Proteínas", "Chocolate", "2 lb", "Proteína de suero, 24 g por porción", 350, 280.5, "748927028669", 3, "2027-03-31", ...ubicaciones.map((_, i) => (i === 0 ? 20 : 5))];
  const productosHoja = XLSX.utils.aoa_to_sheet([encabezado, ejemplo]);
  productosHoja["!cols"] = encabezado.map((c) => ({ wch: Math.max(12, c.length + 2) }));

  const instrucciones = XLSX.utils.aoa_to_sheet(
    [
      ["Cómo llenar la planilla"],
      [],
      ["• Una fila por producto (cada sabor y presentación es un producto distinto). Borra la fila de ejemplo."],
      ["• Obligatorios: Nombre, Precio venta y Precio costo (en Bs, por ejemplo 350 o 280,50)."],
      ["• Categoría: si no existe, se crea al importar. Categorías actuales: " + (cats.map((c) => c.nombre).join(", ") || "ninguna")],
      ["• Descripción: opcional (hasta 2000 caracteres): para qué sirve, cómo se toma, notas."],
      ["• Código de barras: opcional; si lo tiene, escríbelo como texto para que Excel no lo redondee."],
      ["• Stock mínimo: cantidad desde la que avisa 'stock bajo' (0 si no quieres aviso)."],
      ["• Vencimiento: opcional, AAAA-MM-DD o DD/MM/AAAA; se aplica a todo el stock inicial de esa fila."],
      ["• Columnas 'Stock ...': cantidad inicial en cada lugar (vacío o 0 = nada)."],
      ["• Solo se agregan productos nuevos: los que ya existen (mismo código, o mismo nombre + sabor + presentación) se marcan como error."],
      ["• Primero se revisa la planilla y se muestran los errores por fila; no se guarda nada hasta confirmar."],
    ],
  );
  instrucciones["!cols"] = [{ wch: 110 }];

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, productosHoja, "Productos");
  XLSX.utils.book_append_sheet(libro, instrucciones, "Instrucciones");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
