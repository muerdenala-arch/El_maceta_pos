/**
 * Importación del catálogo desde Excel (Fase 10: carga de productos reales). Puro y probado:
 * recibe las filas de la planilla (como las entrega SheetJS) y devuelve productos válidos o errores por fila.
 * Las columnas se reconocen sin importar mayúsculas ni tildes. Solo crea productos nuevos: los que ya
 * existen (mismo código de barras, o mismo nombre + sabor + presentación) se informan como error.
 */
import { esquemaProducto } from "@/lib/validaciones/admin";

export type Ubicacion = { id: number; nombre: string };

export type ContextoImportacion = {
  /** Nombre de categoría normalizado → id. */
  categorias: Map<string, number>;
  ubicaciones: Ubicacion[];
  codigosExistentes: Set<string>;
  /** claveProducto() de los productos existentes. */
  clavesExistentes: Set<string>;
};

export type ProductoImportado = {
  fila: number;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  sabor: string | null;
  presentacion: string | null;
  descripcion: string | null;
  precioVenta: string;
  precioCosto: string;
  codigoBarras: string | null;
  stockMinimo: number;
  vencimiento: string | null;
  /** Stock inicial por ubicación (solo cantidades > 0). */
  stock: { ubicacionId: number; cantidad: number }[];
};

export type ResultadoLectura = {
  productos: ProductoImportado[];
  errores: { fila: number; mensajes: string[] }[];
  categoriasNuevas: string[];
};

export const MAX_FILAS = 2000;

/** Minúsculas, sin tildes ni espacios repetidos: "Categoría " → "categoria". */
export const normalizar = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const claveProducto = (p: { nombre: string; sabor: string | null; presentacion: string | null }) =>
  [p.nombre, p.sabor ?? "", p.presentacion ?? ""].map(normalizar).join("|");

/** Encabezados de la plantilla (en este orden) + una columna "Stock <ubicación>" por ubicación. */
export const COLUMNAS = [
  "Nombre",
  "Marca",
  "Categoría",
  "Sabor",
  "Presentación",
  "Descripción",
  "Precio venta",
  "Precio costo",
  "Código de barras",
  "Stock mínimo",
  "Vencimiento",
] as const;

export const columnaStock = (u: Ubicacion) => `Stock ${u.nombre}`;

const texto = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const t = (typeof v === "number" ? String(v) : String(v)).trim();
  return t === "" ? null : t;
};

/** "1.234,50", "350,5", 350.5 → "350.50" (texto que valida esquemaProducto). */
function monto(v: unknown): string | null {
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(2) : null;
  const t = texto(v)?.replace(/^bs\.?\s*/i, "");
  if (!t) return null;
  const limpio = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^\d+(\.\d{1,2})?$/.test(limpio) ? Number(limpio).toFixed(2) : t;
}

function entero(v: unknown): number | null | "invalido" {
  if (v === null || v === undefined || texto(v) === null) return null;
  const n = typeof v === "number" ? v : Number(String(v).trim().replace(",", "."));
  return Number.isInteger(n) && n >= 0 ? n : "invalido";
}

/** Fecha de Excel (Date con cellDates), "AAAA-MM-DD" o "DD/MM/AAAA" → "AAAA-MM-DD". */
function fecha(v: unknown): string | null | "invalida" {
  if (v === null || v === undefined || texto(v) === null) return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "invalida";
    // SheetJS entrega la fecha a medianoche local; se toman sus componentes locales.
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const t = String(v).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  const partes = iso ? [iso[1], iso[2], iso[3]] : dmy ? [dmy[3], dmy[2], dmy[1]] : null;
  if (!partes) return "invalida";
  const [a, m, d] = partes;
  const r = `${a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const prueba = new Date(`${r}T12:00:00Z`);
  return !Number.isNaN(prueba.getTime()) && prueba.toISOString().startsWith(r) ? r : "invalida";
}

export function leerPlanilla(filas: Record<string, unknown>[], ctx: ContextoImportacion): ResultadoLectura {
  const productos: ProductoImportado[] = [];
  const errores: ResultadoLectura["errores"] = [];
  const categoriasNuevas = new Map<string, string>();
  const codigosVistos = new Map<string, number>();
  const clavesVistas = new Map<string, number>();

  if (filas.length > MAX_FILAS) {
    return { productos: [], errores: [{ fila: 0, mensajes: [`La planilla tiene más de ${MAX_FILAS} filas: divídela en partes`] }], categoriasNuevas: [] };
  }

  filas.forEach((original, i) => {
    const fila = i + 2; // la fila 1 es el encabezado
    const f = new Map(Object.entries(original).map(([k, v]) => [normalizar(k), v]));
    const valor = (col: string) => f.get(normalizar(col));
    if ([...f.values()].every((v) => texto(v) === null)) return; // fila vacía

    const mensajes: string[] = [];
    const categoria = texto(valor("Categoría"));
    const minimo = entero(valor("Stock mínimo"));
    const vencimiento = fecha(valor("Vencimiento"));
    if (minimo === "invalido") mensajes.push("Stock mínimo: debe ser un número entero");
    if (vencimiento === "invalida") mensajes.push("Vencimiento: usa AAAA-MM-DD o DD/MM/AAAA");

    const v = esquemaProducto.safeParse({
      nombre: texto(valor("Nombre")) ?? "",
      marca: texto(valor("Marca")),
      categoriaId: null,
      sabor: texto(valor("Sabor")),
      presentacion: texto(valor("Presentación")),
      descripcion: texto(valor("Descripción")),
      precioVenta: monto(valor("Precio venta")) ?? "",
      precioCosto: monto(valor("Precio costo")) ?? "",
      codigoBarras: texto(valor("Código de barras")),
      stockMinimo: minimo === "invalido" ? 0 : (minimo ?? 0),
      fotoUrl: null,
      activo: true,
    });
    if (!v.success) {
      for (const issue of v.error.issues) {
        const campo = { nombre: "Nombre", descripcion: "Descripción", precioVenta: "Precio venta", precioCosto: "Precio costo", codigoBarras: "Código de barras" }[String(issue.path[0])] ?? String(issue.path[0]);
        mensajes.push(`${campo}: ${issue.message}`);
      }
    }

    const stock: ProductoImportado["stock"] = [];
    for (const u of ctx.ubicaciones) {
      const c = entero(valor(columnaStock(u)));
      if (c === "invalido") mensajes.push(`${columnaStock(u)}: debe ser un número entero, 0 o más`);
      else if (c) stock.push({ ubicacionId: u.id, cantidad: c });
    }

    if (v.success) {
      const d = v.data;
      if (d.codigoBarras) {
        if (ctx.codigosExistentes.has(d.codigoBarras)) mensajes.push(`El código de barras ${d.codigoBarras} ya existe en el catálogo`);
        else if (codigosVistos.has(d.codigoBarras)) mensajes.push(`Código de barras repetido (también en la fila ${codigosVistos.get(d.codigoBarras)})`);
        else codigosVistos.set(d.codigoBarras, fila);
      }
      const clave = claveProducto(d);
      if (ctx.clavesExistentes.has(clave)) mensajes.push("Ya existe un producto con el mismo nombre, sabor y presentación");
      else if (clavesVistas.has(clave)) mensajes.push(`Producto repetido (también en la fila ${clavesVistas.get(clave)})`);
      else clavesVistas.set(clave, fila);

      if (mensajes.length === 0) {
        if (categoria && !ctx.categorias.has(normalizar(categoria)) && !categoriasNuevas.has(normalizar(categoria))) {
          categoriasNuevas.set(normalizar(categoria), categoria);
        }
        productos.push({
          fila,
          nombre: d.nombre,
          marca: d.marca,
          categoria,
          sabor: d.sabor,
          presentacion: d.presentacion,
          descripcion: d.descripcion,
          precioVenta: d.precioVenta,
          precioCosto: d.precioCosto,
          codigoBarras: d.codigoBarras,
          stockMinimo: d.stockMinimo,
          vencimiento: vencimiento === "invalida" ? null : vencimiento,
          stock,
        });
      }
    }
    if (mensajes.length) errores.push({ fila, mensajes });
  });

  return { productos, errores, categoriasNuevas: [...categoriasNuevas.values()] };
}
