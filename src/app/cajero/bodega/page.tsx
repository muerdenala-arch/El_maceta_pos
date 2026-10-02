import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { alertas } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";
import { listarProductosInventario, listarUbicaciones, mapaEnCamino, mapaStock } from "@/lib/inventario/consultas";
import { ConsultaBodega } from "./consulta-bodega";
import { ROLES_CAJA } from "@/lib/auth/constantes";

export const metadata: Metadata = { title: "Bodega" };

/** Consulta de stock para el cajero: su sucursal y la bodega central (solo lectura, sin costos). */
export default async function PaginaBodegaCajero(props: PageProps<"/cajero/bodega">) {
  const resaltar = Number((await props.searchParams).resaltar) || null;
  const sesion = await requerirSesion(...ROLES_CAJA);
  const ubicaciones = await listarUbicaciones();
  const miSucursal = ubicaciones.find((u) => u.id === sesion.sucursalId);
  const bodega = ubicaciones.find((u) => u.tipo === "bodega");
  if (!miSucursal) {
    return <p className="p-10 text-center text-muted-foreground">No tienes una sucursal activa asignada. Avisa al administrador.</p>;
  }

  const [productos, stock, enCamino, pendientes] = await Promise.all([
    listarProductosInventario(),
    mapaStock([miSucursal.id, ...(bodega ? [bodega.id] : [])]),
    mapaEnCamino(miSucursal.id),
    db
      .select({ productoId: alertas.productoId, mensaje: alertas.mensaje })
      .from(alertas)
      .where(and(eq(alertas.tipo, "solicitud_reposicion"), eq(alertas.sucursalId, miSucursal.id), eq(alertas.resuelta, false))),
  ]);

  return (
    <ConsultaBodega
      resaltar={resaltar}
      sucursal={miSucursal}
      bodegaId={bodega?.id ?? null}
      productos={productos.filter((p) => p.activo)}
      stock={stock}
      enCamino={enCamino}
      solicitados={Object.fromEntries(pendientes.map((p) => [p.productoId!, p.mensaje]))}
    />
  );
}
