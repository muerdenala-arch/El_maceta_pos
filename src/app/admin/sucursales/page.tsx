import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { sucursales, usuarios } from "@/db/schema";
import { ZonaModulo } from "@/components/permisos/zona-modulo";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { ListaSucursales } from "./lista-sucursales";

export const metadata: Metadata = { title: "Sucursales" };

export default async function PaginaSucursales() {
  const acceso = await requerirModulo("sucursales");

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

  return (
    <ZonaModulo soloLectura={acceso.soloLectura}>
      {/* El encargado: solo su sucursal (edita sus datos; no crea ni desactiva). */}
      <ListaSucursales soloLaSuya={acceso.encargado} sucursales={acceso.encargado ? filas.filter((s) => s.id === acceso.sucursalId) : filas} />
    </ZonaModulo>
  );
}
