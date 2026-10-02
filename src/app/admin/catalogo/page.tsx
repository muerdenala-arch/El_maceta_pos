import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { categorias, productos } from "@/db/schema";
import { ZonaModulo } from "@/components/permisos/zona-modulo";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { Catalogo } from "./catalogo";

export const metadata: Metadata = { title: "Catálogo" };

export default async function PaginaCatalogo() {
  const acceso = await requerirModulo("catalogo");

  const [listaProductos, listaCategorias] = await Promise.all([
    db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        marca: productos.marca,
        categoriaId: productos.categoriaId,
        sabor: productos.sabor,
        presentacion: productos.presentacion,
        descripcion: productos.descripcion,
        precioVenta: productos.precioVenta,
        precioCosto: productos.precioCosto,
        codigoBarras: productos.codigoBarras,
        fotoUrl: productos.fotoUrl,
        stockMinimo: productos.stockMinimo,
        activo: productos.activo,
        fraccionado: productos.fraccionado,
        unidadFraccion: productos.unidadFraccion,
        unidadesPorEnvase: productos.unidadesPorEnvase,
        precioUnidad: productos.precioUnidad,
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

  return (
    <ZonaModulo soloLectura={acceso.soloLectura}>
      {/* El encargado no ve costos: no viajan al navegador. */}
      <Catalogo
        sinCostos={acceso.encargado}
        productos={acceso.encargado ? listaProductos.map((p) => ({ ...p, precioCosto: "0" })) : listaProductos}
        categorias={listaCategorias}
      />
    </ZonaModulo>
  );
}
