import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { categorias, productos } from "@/db/schema";
import { cambiarStock } from "@/lib/inventario/stock";
import { normalizar, type ContextoImportacion, type ResultadoLectura } from "./productos";

export const unidadesDe = (r: ResultadoLectura) => r.productos.reduce((s, p) => s + p.stock.reduce((t, x) => t + x.cantidad, 0), 0);

/**
 * Guarda una planilla ya revisada (sin errores): categorías nuevas, productos y stock inicial (ingreso con
 * lote y vencimiento) en una sola transacción: o entra todo o nada. La auditoría la registra quien llama. La usan "Importar Excel" y `npm run db:importar`.
 */
export async function aplicarImportacion(r: ResultadoLectura, ctx: ContextoImportacion, usuarioId: number) {
  await db.transaction(async (tx) => {
    const idsCategoria = new Map(ctx.categorias);
    for (const nombre of r.categoriasNuevas) {
      const [c] = await tx.insert(categorias).values({ nombre }).onConflictDoNothing().returning({ id: categorias.id });
      const id = c?.id ?? (await tx.select({ id: categorias.id }).from(categorias).where(eq(categorias.nombre, nombre)))[0].id;
      idsCategoria.set(normalizar(nombre), id);
    }
    for (const p of r.productos) {
      const [nuevo] = await tx
        .insert(productos)
        .values({
          nombre: p.nombre,
          marca: p.marca,
          categoriaId: p.categoria ? (idsCategoria.get(normalizar(p.categoria)) ?? null) : null,
          sabor: p.sabor,
          presentacion: p.presentacion,
          descripcion: p.descripcion,
          precioVenta: p.precioVenta,
          precioCosto: p.precioCosto,
          codigoBarras: p.codigoBarras,
          stockMinimo: p.stockMinimo,
        })
        .returning({ id: productos.id });
      for (const s of p.stock) {
        await cambiarStock(tx, {
          productoId: nuevo.id,
          ubicacionId: s.ubicacionId,
          delta: s.cantidad,
          tipo: "ingreso",
          usuarioId,
          motivo: "Carga inicial desde Excel",
          lotesEntrada: [{ vencimiento: p.vencimiento, cantidad: s.cantidad }],
        });
      }
    }
  });
}
