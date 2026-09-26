import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { sucursales, usuarios } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";
import { ListaSucursales } from "./lista-sucursales";

export const metadata: Metadata = { title: "Sucursales" };

export default async function PaginaSucursales() {
  await requerirSesion("admin");

  const filas = await db
    .select({
      id: sucursales.id,
      nombre: sucursales.nombre,
      tipo: sucursales.tipo,
      direccion: sucursales.direccion,
      telefono: sucursales.telefono,
      encargado: sucursales.encargado,
      tamanoImpresion: sucursales.tamanoImpresion,
      activo: sucursales.activo,
      cajeros: sql<number>`count(${usuarios.id}) filter (where ${usuarios.activo})::int`,
    })
    .from(sucursales)
    .leftJoin(usuarios, eq(usuarios.sucursalId, sucursales.id))
    .groupBy(sucursales.id)
    .orderBy(sql`${sucursales.tipo} = 'sucursal'`, asc(sucursales.id));

  return <ListaSucursales sucursales={filas} />;
}
