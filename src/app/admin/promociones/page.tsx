import { asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { categorias, cupones, productos, promociones, sucursales } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";
import { diaBolivia, hoyEnBolivia } from "@/lib/formato";
import { listarProductosInventario } from "@/lib/inventario/consultas";
import { listarSucursalesActivas } from "@/lib/sucursal-vista";
import { Pestanas } from "@/components/inventario/pestanas";
import { ListaCupones } from "./lista-cupones";
import { ListaPromociones } from "./lista-promociones";

export const metadata: Metadata = { title: "Promociones y cupones" };

export default async function PaginaPromociones(props: PageProps<"/admin/promociones">) {
  await requerirSesion("admin");
  const vista = (await props.searchParams).vista === "cupones" ? "cupones" : "automaticos";

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
    db.select().from(cupones).orderBy(desc(cupones.activo), asc(cupones.codigo)),
    listarProductosInventario(),
    db.select({ id: categorias.id, nombre: categorias.nombre }).from(categorias).orderBy(asc(categorias.nombre)),
    listarSucursalesActivas(),
  ]);
  const hoy = hoyEnBolivia();
  const activos = listaProductos.filter((p) => p.activo);

  const pestanas = (
    <Pestanas
      actual={vista}
      opciones={[
        { valor: "automaticos", titulo: "Descuentos automáticos", href: "/admin/promociones", contador: filas.length },
        { valor: "cupones", titulo: "Cupones", href: "/admin/promociones?vista=cupones", contador: listaCupones.length },
      ]}
    />
  );

  if (vista === "cupones") {
    return (
      <ListaCupones
        hoy={hoy}
        cupones={listaCupones.map((c) => ({
          id: c.id,
          codigo: c.codigo,
          descripcion: c.descripcion,
          tipo: c.tipo === "monto" ? ("monto" as const) : ("porcentaje" as const),
          valor: c.valor,
          montoMinimo: c.montoMinimo,
          fechaInicio: c.fechaInicio,
          fechaFin: c.fechaFin,
          usosMaximos: c.usosMaximos,
          usosActuales: c.usosActuales,
          activo: c.activo,
          alcance: c.alcance === "productos" || c.alcance === "categorias" ? c.alcance : ("todo" as const),
          productoIds: c.productoIds,
          categoriaIds: c.categoriaIds,
          sucursalIds: c.sucursalIds,
          acumulaPromociones: c.acumulaPromociones,
          acumulaCombos: c.acumulaCombos,
        }))}
        productos={activos}
        categorias={listaCategorias}
        sucursales={listaSucursales}
      >
        {pestanas}
      </ListaCupones>
    );
  }

  return (
    <ListaPromociones
      hoy={hoy}
      promociones={filas.map(({ fechaInicio, fechaFin, ...p }) => ({
        ...p,
        // "sucursal" se edita como "todo" + sucursal elegida.
        alcance: p.alcance === "sucursal" ? ("todo" as const) : p.alcance,
        desde: diaBolivia(fechaInicio),
        hasta: diaBolivia(fechaFin, true),
      }))}
      productos={activos}
      categorias={listaCategorias}
      sucursales={listaSucursales}
    >
      {pestanas}
    </ListaPromociones>
  );
}
