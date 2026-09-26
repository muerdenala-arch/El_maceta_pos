import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import { db } from "@/db";
import { clientes, sucursales, usuarios, ventas } from "@/db/schema";
import { ListaVentas } from "@/components/comprobante/lista-ventas";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { SelectorFecha } from "@/components/panel/selector-fecha";
import { requerirSesion } from "@/lib/auth/sesion";
import { sumar } from "@/lib/dinero";
import { fechaLarga, fechaValida, formatoBs, hoyEnBolivia, ZONA_HORARIA } from "@/lib/formato";
import { obtenerSucursalVista } from "@/lib/sucursal-vista";

export const metadata: Metadata = { title: "Reporte de ventas" };

/**
 * Versión inicial (Fase 4b): ventas del día con acceso al comprobante de cada una.
 * La Fase 8 agrega filtros por cajero, método y producto, y exportación a Excel/PDF.
 */
export default async function PaginaReporteVentas(props: PageProps<"/admin/reportes">) {
  const sesion = await requerirSesion("admin");
  const hoy = hoyEnBolivia();
  const fecha = fechaValida((await props.searchParams).fecha) ?? hoy;
  const sucursalId = await obtenerSucursalVista(sesion);

  const filas = await db
    .select({
      id: ventas.id,
      numero: ventas.numeroComprobante,
      fecha: ventas.fecha,
      total: ventas.total,
      metodoPago: ventas.metodoPago,
      estado: ventas.estado,
      cliente: clientes.nombre,
      cajero: usuarios.nombre,
      sucursal: sucursales.nombre,
    })
    .from(ventas)
    .innerJoin(usuarios, eq(usuarios.id, ventas.cajeroId))
    .innerJoin(sucursales, eq(sucursales.id, ventas.sucursalId))
    .leftJoin(clientes, eq(clientes.id, ventas.clienteId))
    .where(
      and(
        gte(ventas.fecha, sql`(${fecha}::date at time zone ${ZONA_HORARIA})`),
        lt(ventas.fecha, sql`((${fecha}::date + 1) at time zone ${ZONA_HORARIA})`),
        sucursalId ? eq(ventas.sucursalId, sucursalId) : undefined,
      ),
    )
    .orderBy(desc(ventas.fecha));

  const completadas = filas.filter((v) => v.estado === "completada");
  const total = completadas.length ? sumar(...completadas.map((v) => v.total)) : "0";

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <EncabezadoPagina
        icono={BarChart3}
        titulo="Reporte de ventas"
        descripcion={
          <>
            <span className="first-letter:uppercase">{fechaLarga(fecha)}</span> · {completadas.length} venta{completadas.length === 1 ? "" : "s"} ·{" "}
            <strong className="cifras text-foreground">{formatoBs(total)}</strong>
          </>
        }
      >
        <SelectorFecha fecha={fecha} hoy={hoy} />
      </EncabezadoPagina>
      <ListaVentas ventas={filas.map((v) => ({ ...v, fecha: v.fecha.toISOString() }))} />
    </div>
  );
}
