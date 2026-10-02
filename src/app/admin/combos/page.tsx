import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { productos } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";
import { listarCombos } from "@/lib/combos/consultas";
import { hoyEnBolivia } from "@/lib/formato";
import { ListaCombos } from "./lista-combos";

export const metadata: Metadata = { title: "Combos" };

/** Combos de productos (solo administrador): lista, activar/desactivar y formulario con buscador de productos. */
export default async function PaginaCombos() {
  await requerirSesion("admin");
  const [combos, catalogo] = await Promise.all([
    listarCombos(),
    db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        marca: productos.marca,
        sabor: productos.sabor,
        presentacion: productos.presentacion,
        codigoBarras: productos.codigoBarras,
        fotoUrl: productos.fotoUrl,
        precioVenta: productos.precioVenta,
        precioCosto: productos.precioCosto,
        precioUnidad: productos.precioUnidad,
        fraccionado: productos.fraccionado,
        unidadFraccion: productos.unidadFraccion,
        unidadesPorEnvase: productos.unidadesPorEnvase,
        activo: productos.activo,
      })
      .from(productos)
      .where(eq(productos.activo, true))
      .orderBy(asc(productos.nombre)),
  ]);
  return <ListaCombos hoy={hoyEnBolivia()} combos={combos} productos={catalogo} />;
}
