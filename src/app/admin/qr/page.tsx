import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { qrPagos, sucursales } from "@/db/schema";
import { requerirSesion } from "@/lib/auth/sesion";
import { listarSucursalesActivas } from "@/lib/sucursal-vista";
import { ListaQr } from "./lista-qr";

export const metadata: Metadata = { title: "QR de cobro" };

export default async function PaginaQr() {
  await requerirSesion("admin");
  const [qrs, opciones] = await Promise.all([
    db
      .select({
        id: qrPagos.id,
        nombre: qrPagos.nombre,
        imagenUrl: qrPagos.imagenUrl,
        sucursalId: qrPagos.sucursalId,
        sucursal: sucursales.nombre,
        activo: qrPagos.activo,
      })
      .from(qrPagos)
      .leftJoin(sucursales, eq(sucursales.id, qrPagos.sucursalId))
      .orderBy(asc(qrPagos.id)),
    listarSucursalesActivas(),
  ]);
  return <ListaQr qrs={qrs} sucursales={opciones} />;
}
