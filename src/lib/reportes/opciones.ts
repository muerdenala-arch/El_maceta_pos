import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productos, usuarios } from "@/db/schema";
import type { ProductoLigero } from "@/components/inventario/selector-producto";
import { listarSucursalesActivas } from "@/lib/sucursal-vista";

export type OpcionesFiltros = {
  sucursales: { id: number; nombre: string }[];
  cajeros: { id: number; nombre: string; sucursalId: number | null; activo: boolean }[];
  productos: ProductoLigero[];
};

/** Listas para los selectores de la barra de filtros (incluye cajeros y productos desactivados: tienen historial). */
export async function opcionesFiltros({ conProductos = true } = {}): Promise<OpcionesFiltros> {
  const [sucursales, cajeros, lista] = await Promise.all([
    listarSucursalesActivas(),
    db
      .select({ id: usuarios.id, nombre: usuarios.nombre, sucursalId: usuarios.sucursalId, activo: usuarios.activo })
      .from(usuarios)
      .where(eq(usuarios.rol, "cajero"))
      .orderBy(asc(usuarios.nombre)),
    conProductos
      ? db
          .select({
            id: productos.id,
            nombre: productos.nombre,
            marca: productos.marca,
            sabor: productos.sabor,
            presentacion: productos.presentacion,
            codigoBarras: productos.codigoBarras,
            fotoUrl: productos.fotoUrl,
          })
          .from(productos)
          .orderBy(asc(productos.nombre))
      : Promise.resolve([]),
  ]);
  return {
    sucursales,
    cajeros,
    productos: lista,
  };
}
