/**
 * Carga el catálogo desde una planilla (mismo formato que Catálogo → Importar Excel) por comando.
 *   npm run db:importar -- planilla.xlsx                               revisa y muestra el resumen (no guarda)
 *   npm run db:importar -- planilla.xlsx --aplicar                     guarda (todo o nada)
 *   npm run db:importar -- planilla.xlsx --env .env.produccion.local   contra otra base
 * Usa la misma lectura y el mismo guardado que la pantalla; queda en auditoría a nombre del primer administrador.
 */
import { cargarEntornoScript, destino } from "./entorno-script";
const archivoEntorno = cargarEntornoScript();

import { readFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const archivo = process.argv.slice(2).find((a, i, t) => !a.startsWith("--") && t[i - 1] !== "--env");
const aplicar = process.argv.includes("--aplicar");
if (!archivo) throw new Error("Falta la planilla: npm run db:importar -- planilla.xlsx");
console.log(`Base: ${destino(process.env.DATABASE_URL)} (variables de ${archivoEntorno})`);

// Después de cargar el entorno: estos módulos abren la conexión al importarse.
const { db } = await import("@/db");
const { auditoria, usuarios } = await import("./schema");
const { and, asc, eq } = await import("drizzle-orm");
const { contextoImportacion } = await import("@/lib/importacion/contexto");
const { columnaStock, leerPlanilla, normalizar } = await import("@/lib/importacion/productos");
const { aplicarImportacion, unidadesDe } = await import("@/lib/importacion/aplicar");

const libro = XLSX.read(await readFile(archivo), { cellDates: true });
const hoja = libro.Sheets[libro.SheetNames.find((n) => normalizar(n) === "productos") ?? libro.SheetNames[0]];
const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: null, raw: true });
const ctx = await contextoImportacion();
// Una columna "Stock …" que no coincide con ninguna ubicación se ignoraría en silencio: mejor detenerse.
const conocidas = new Set(["stock minimo", ...ctx.ubicaciones.map((u) => normalizar(columnaStock(u)))]);
const sobrantes = Object.keys(filas[0] ?? {}).filter((c) => normalizar(c).startsWith("stock ") && !conocidas.has(normalizar(c)));
if (sobrantes.length) throw new Error(`Columnas de stock sin ubicación: ${sobrantes.join(", ")}. Ubicaciones: ${ctx.ubicaciones.map(columnaStock).join(", ")}`);
const r = leerPlanilla(filas, ctx);

console.log(`Ubicaciones: ${ctx.ubicaciones.map((u) => `"Stock ${u.nombre}"`).join(", ")}`);
console.log(`Productos ya en el catálogo: ${ctx.clavesExistentes.size}`);
console.log(`Planilla: ${r.productos.length} productos válidos, ${unidadesDe(r)} unidades, ${r.errores.length} filas con error`);
console.log(`Categorías nuevas: ${r.categoriasNuevas.join(", ") || "ninguna"}`);
for (const e of r.errores.slice(0, 50)) console.log(`  Fila ${e.fila}: ${e.mensajes.join("; ")}`);

if (!aplicar) console.log("Solo revisión: no se guardó nada (agrega --aplicar para guardar).");
else if (r.errores.length > 0 || r.productos.length === 0) throw new Error("No se guardó nada: corrige los errores primero.");
else {
  const [admin] = await db.select({ id: usuarios.id }).from(usuarios).where(and(eq(usuarios.rol, "admin"), eq(usuarios.activo, true))).orderBy(asc(usuarios.id)).limit(1);
  if (!admin) throw new Error("No hay un administrador activo para registrar la carga");
  await aplicarImportacion(r, ctx, admin.id);
  await db.insert(auditoria).values({
    accion: "productos_importados",
    usuarioId: admin.id,
    dispositivo: "comando db:importar",
    detalle: { productos: r.productos.length, unidades: unidadesDe(r), categoriasNuevas: r.categoriasNuevas, archivo: path.basename(archivo).slice(0, 120) },
  });
  console.log(`Guardado: ${r.productos.length} productos y ${unidadesDe(r)} unidades.`);
}
