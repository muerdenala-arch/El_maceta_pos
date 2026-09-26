import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { cajas, gastos, sucursales, usuarios } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";
import { fechaValida, hoyEnBolivia, ZONA_HORARIA } from "@/lib/formato";
import { obtenerSucursalVista } from "@/lib/sucursal-vista";
import { ListaGastos } from "./lista-gastos";

export const metadata: Metadata = { title: "Gastos diarios" };

export default async function PaginaGastosAdmin(props: PageProps<"/admin/gastos">) {
  const sesion = await requerirSesion("admin");
  const hoy = hoyEnBolivia();
  const fecha = fechaValida((await props.searchParams).fecha) ?? hoy;
  const sucursalId = await obtenerSucursalVista(sesion);

  const filas = await db
    .select({
      id: gastos.id,
      fecha: gastos.fecha,
      categoria: gastos.categoria,
      monto: gastos.monto,
      descripcion: gastos.descripcion,
      fotoUrl: gastos.fotoUrl,
      anulado: gastos.anulado,
      motivoAnulacion: gastos.motivoAnulacion,
      cajero: usuarios.nombre,
      sucursal: sucursales.nombre,
      cajaAbierta: sql<boolean>`${cajas.estado} = 'abierta'`,
    })
    .from(gastos)
    .innerJoin(usuarios, eq(usuarios.id, gastos.usuarioId))
    .innerJoin(sucursales, eq(sucursales.id, gastos.sucursalId))
    .innerJoin(cajas, eq(cajas.id, gastos.cajaId))
    .where(
      and(
        gte(gastos.fecha, sql`(${fecha}::date at time zone ${ZONA_HORARIA})`),
        lt(gastos.fecha, sql`((${fecha}::date + 1) at time zone ${ZONA_HORARIA})`),
        sucursalId ? eq(gastos.sucursalId, sucursalId) : undefined,
      ),
    )
    .orderBy(desc(gastos.fecha));

  return <ListaGastos fecha={fecha} hoy={hoy} gastos={filas.map((g) => ({ ...g, fecha: g.fecha.toISOString() }))} />;
}
