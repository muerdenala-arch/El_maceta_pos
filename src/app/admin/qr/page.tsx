import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { qrPagos, sucursales } from "@/db/schema";
import { ZonaModulo } from "@/components/permisos/zona-modulo";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { listarSucursalesActivas } from "@/lib/sucursal-vista";
import { ListaQr } from "./lista-qr";

export const metadata: Metadata = { title: "QR de cobro" };

export default async function PaginaQr() {
  const acceso = await requerirModulo("qr");
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
  if (!acceso.encargado) return <ListaQr qrs={qrs} sucursales={opciones} />;
  // El encargado: los QR que se usan en su sucursal; crea y edita solo los propios de ella.
  return (
    <ZonaModulo soloLectura={acceso.soloLectura}>
      <ListaQr
        sucursalFija={acceso.sucursalId}
        qrs={qrs.filter((q) => q.sucursalId === null || q.sucursalId === acceso.sucursalId)}
        sucursales={opciones.filter((s) => s.id === acceso.sucursalId)}
      />
    </ZonaModulo>
  );
}
