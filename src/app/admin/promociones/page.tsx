import { asc, desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { categorias, cupones, promociones, sucursales } from "@/db/schema";
import { ZonaModulo } from "@/components/permisos/zona-modulo";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { diaBolivia, hoyEnBolivia } from "@/lib/formato";
import { listarProductosInventario } from "@/lib/inventario/consultas";
import { listarSucursalesActivas } from "@/lib/sucursal-vista";
import { Pestanas } from "@/components/inventario/pestanas";
import { catalogoParaCombos, listarCombos } from "@/lib/combos/consultas";
import { ListaCombos } from "./lista-combos";
import { ListaCupones } from "./lista-cupones";
import { ListaPromociones } from "./lista-promociones";

export const metadata: Metadata = { title: "Promociones y cupones" };

export default async function PaginaPromociones(props: PageProps<"/admin/promociones">) {
  const acceso = await requerirModulo("promociones");
  const pedida = (await props.searchParams).vista;
  const vista = pedida === "cupones" || pedida === "combos" ? pedida : "automaticos";

  const [filas, listaCupones, listaProductos, listaCategorias, listaSucursales, listaCombos] = await Promise.all([
    db
      .select({
        id: promociones.id,
        nombre: promociones.nombre,
        tipo: promociones.tipo,
        valor: promociones.valor,
        comboLleva: promociones.comboLleva,
        comboPaga: promociones.comboPaga,
        alcance: promociones.alcance,
        productoIds: promociones.productoIds,
        categoriaIds: promociones.categoriaIds,
        sucursalId: promociones.sucursalId,
        sucursal: sucursales.nombre,
        fechaInicio: promociones.fechaInicio,
        fechaFin: promociones.fechaFin,
        requiereCupon: promociones.requiereCupon,
        activo: promociones.activo,
      })
      .from(promociones)
      .leftJoin(sucursales, eq(sucursales.id, promociones.sucursalId))
      .orderBy(desc(promociones.activo), desc(promociones.fechaFin)),
    db.select().from(cupones).orderBy(desc(cupones.activo), asc(cupones.codigo)),
    listarProductosInventario(),
    db.select({ id: categorias.id, nombre: categorias.nombre }).from(categorias).orderBy(asc(categorias.nombre)),
    listarSucursalesActivas(),
    listarCombos(),
  ]);
  const hoy = hoyEnBolivia();
  const activos = listaProductos.filter((p) => p.activo);

  const pestanas = (
    <Pestanas
      actual={vista}
      opciones={[
        { valor: "automaticos", titulo: "Descuentos automáticos", href: "/admin/promociones", contador: filas.length },
        { valor: "cupones", titulo: "Cupones", href: "/admin/promociones?vista=cupones", contador: listaCupones.length },
        { valor: "combos", titulo: "Combos", href: "/admin/promociones?vista=combos", contador: listaCombos.length },
      ]}
    />
  );

  if (vista === "combos") {
    return (
      <ZonaModulo soloLectura={acceso.soloLectura}>
        <ListaCombos hoy={hoy} combos={listaCombos} productos={await catalogoParaCombos()}>
          {pestanas}
        </ListaCombos>
      </ZonaModulo>
    );
  }

  if (vista === "cupones") {
    return (
      <ZonaModulo soloLectura={acceso.soloLectura}>
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
      </ZonaModulo>
    );
  }

  return (
    <ZonaModulo soloLectura={acceso.soloLectura}>
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
    </ZonaModulo>
  );
}
