import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { categorias, productos } from "@/db/schema";
import { ZonaModulo } from "@/components/permisos/zona-modulo";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { listarCombos } from "@/lib/combos/consultas";
import { hoyEnBolivia } from "@/lib/formato";
import { ListaCombos } from "./lista-combos";

export const metadata: Metadata = { title: "Combos" };

/** Combos de productos (solo administrador): lista, activar/desactivar y formulario con buscador de productos. */
export default async function PaginaCombos() {
  const acceso = await requerirModulo("combos");
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
        categoria: categorias.nombre,
      })
      .from(productos)
      .leftJoin(categorias, eq(categorias.id, productos.categoriaId))
      .where(eq(productos.activo, true))
      .orderBy(asc(productos.nombre)),
  ]);
  return (
    <ZonaModulo soloLectura={acceso.soloLectura}>
      {/* El encargado no ve costos: no viajan al navegador (ni el aviso de "bajo el costo"). */}
      <ListaCombos hoy={hoyEnBolivia()} combos={combos} productos={acceso.encargado ? catalogo.map((p) => ({ ...p, precioCosto: "0" })) : catalogo} />
    </ZonaModulo>
  );
}
