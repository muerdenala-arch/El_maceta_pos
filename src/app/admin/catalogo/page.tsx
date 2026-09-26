import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { categorias, productos } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";
import { Catalogo } from "./catalogo";

export const metadata: Metadata = { title: "Catálogo" };

export default async function PaginaCatalogo() {
  await requerirSesion("admin");

  const [listaProductos, listaCategorias] = await Promise.all([
    db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        marca: productos.marca,
        categoriaId: productos.categoriaId,
        sabor: productos.sabor,
        presentacion: productos.presentacion,
        precioVenta: productos.precioVenta,
        precioCosto: productos.precioCosto,
        codigoBarras: productos.codigoBarras,
        fotoUrl: productos.fotoUrl,
        stockMinimo: productos.stockMinimo,
        activo: productos.activo,
      })
      .from(productos)
      .orderBy(sql`${productos.activo} desc`, asc(productos.nombre)),
    db
      .select({
        id: categorias.id,
        nombre: categorias.nombre,
        productos: sql<number>`count(${productos.id})::int`,
      })
      .from(categorias)
      .leftJoin(productos, eq(productos.categoriaId, categorias.id))
      .groupBy(categorias.id)
      .orderBy(asc(categorias.nombre)),
  ]);

  return <Catalogo productos={listaProductos} categorias={listaCategorias} />;
}
