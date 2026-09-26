import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth/sesion";
import { hoyEnBolivia } from "@/lib/formato";
import {
  listarLotesConVencimiento,
  listarProductosInventario,
  listarSolicitudesPendientes,
  listarTransferencias,
  listarUbicaciones,
  mapaStock,
} from "@/lib/inventario/consultas";
import { Bodega } from "./bodega";

export const metadata: Metadata = { title: "Bodega central" };

export default async function PaginaBodega(props: PageProps<"/admin/bodega">) {
  await requerirSesion("admin");
  const sp = await props.searchParams;
  const vista = sp.vista === "transferencias" || sp.vista === "vencimientos" ? sp.vista : "stock";

  const [ubicaciones, productos, stock, lotes, transferencias, solicitudes] = await Promise.all([
    listarUbicaciones(),
    listarProductosInventario(),
    mapaStock(),
    listarLotesConVencimiento(),
    listarTransferencias({ limite: 60 }),
    listarSolicitudesPendientes(),
  ]);

  return (
    <Bodega
      vista={vista}
      hoy={hoyEnBolivia()}
      ubicaciones={ubicaciones}
      productos={productos}
      stock={stock}
      lotes={lotes}
      transferencias={transferencias}
      solicitudes={solicitudes}
    />
  );
}
