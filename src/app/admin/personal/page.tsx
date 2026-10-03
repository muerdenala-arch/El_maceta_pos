import { asc, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { sucursales, usuarios } from "@/db/schema";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { listarSucursalesActivas } from "@/lib/sucursal-vista";
import { ListaPersonal } from "./lista-personal";

export const metadata: Metadata = { title: "Personal" };

export default async function PaginaPersonal() {
  const { sesion } = await requerirModulo("personal");

  const [personas, opcionesSucursal] = await Promise.all([
    db
      .select({
        id: usuarios.id,
        nombre: usuarios.nombre,
        usuario: usuarios.usuario,
        rol: usuarios.rol,
        sucursalId: usuarios.sucursalId,
        sucursal: sucursales.nombre,
        activo: usuarios.activo,
        // Solo si el bloqueo sigue vigente (se compara en la BD, con su reloj).
        bloqueadoHasta: sql<string | null>`case when ${usuarios.bloqueadoHasta} > now() then to_char(${usuarios.bloqueadoHasta} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end`,
      })
      .from(usuarios)
      .leftJoin(sucursales, eq(sucursales.id, usuarios.sucursalId))
      // Activos primero, luego administradores, luego por nombre.
      .orderBy(sql`${usuarios.activo} desc`, sql`${usuarios.rol} = 'cajero'`, asc(usuarios.nombre)),
    listarSucursalesActivas(),
  ]);

  return <ListaPersonal yo={sesion.uid} sucursales={opcionesSucursal} personas={personas} />;
}
