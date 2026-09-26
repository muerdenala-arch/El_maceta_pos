import { asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { categorias, cupones, productos, promociones, sucursales } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";
import { diaBolivia, hoyEnBolivia } from "@/lib/formato";
import { listarProductosInventario } from "@/lib/inventario/consultas";
import { listarSucursalesActivas } from "@/lib/sucursal-vista";
import { ListaPromociones } from "./lista-promociones";

export const metadata: Metadata = { title: "Promociones y cupones" };

export default async function PaginaPromociones() {
  await requerirSesion("admin");

  const [filas, listaCupones, listaProductos, listaCategorias, listaSucursales] = await Promise.all([
    db
      .select({
        id: promociones.id,
        nombre: promociones.nombre,
        tipo: promociones.tipo,
        valor: promociones.valor,
        comboLleva: promociones.comboLleva,
        comboPaga: promociones.comboPaga,
        alcance: promociones.alcance,
        productoId: promociones.productoId,
        producto: productos.nombre,
        categoriaId: promociones.categoriaId,
        categoria: categorias.nombre,
        sucursalId: promociones.sucursalId,
        sucursal: sucursales.nombre,
        fechaInicio: promociones.fechaInicio,
        fechaFin: promociones.fechaFin,
        requiereCupon: promociones.requiereCupon,
        activo: promociones.activo,
      })
      .from(promociones)
      .leftJoin(productos, eq(productos.id, promociones.productoId))
      .leftJoin(categorias, eq(categorias.id, promociones.categoriaId))
      .leftJoin(sucursales, eq(sucursales.id, promociones.sucursalId))
      .orderBy(desc(promociones.activo), desc(promociones.fechaFin)),
    db.select().from(cupones).orderBy(asc(cupones.codigo)),
    listarProductosInventario(),
    db.select({ id: categorias.id, nombre: categorias.nombre }).from(categorias).orderBy(asc(categorias.nombre)),
    listarSucursalesActivas(),
  ]);

  return (
    <ListaPromociones
      hoy={hoyEnBolivia()}
      promociones={filas.map(({ fechaInicio, fechaFin, ...p }) => ({
        ...p,
        // "sucursal" se edita como "todo" + sucursal elegida.
        alcance: p.alcance === "sucursal" ? ("todo" as const) : p.alcance,
        desde: diaBolivia(fechaInicio),
        hasta: diaBolivia(fechaFin, true),
        cupones: listaCupones
          .filter((c) => c.promocionId === p.id)
          .map((c) => ({ id: c.id, codigo: c.codigo, usosMaximos: c.usosMaximos, usosActuales: c.usosActuales })),
      }))}
      productos={listaProductos.filter((p) => p.activo)}
      categorias={listaCategorias}
      sucursales={listaSucursales}
    />
  );
}
