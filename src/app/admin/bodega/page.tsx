import type { Metadata } from "next";
import { ZonaModulo } from "@/components/permisos/zona-modulo";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
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
  const acceso = await requerirModulo("bodega");
  const suya = acceso.sucursalId ?? undefined;
  const sp = await props.searchParams;
  const vista = sp.vista === "transferencias" || sp.vista === "vencimientos" ? sp.vista : "stock";

  const [todas, productos, lotes, transferencias, pendientes] = await Promise.all([
    listarUbicaciones(),
    listarProductosInventario(),
    listarLotesConVencimiento(),
    // El encargado: la bodega completa, y de las sucursales solo la suya (envíos y solicitudes incluidos).
    listarTransferencias({ limite: 60, destinoId: suya }),
    listarSolicitudesPendientes(),
  ]);
  const ubicaciones = acceso.encargado ? todas.filter((u) => u.id === suya || u.tipo === "bodega") : todas;
  const stock = await mapaStock(acceso.encargado ? ubicaciones.map((u) => u.id) : undefined);
  const solicitudes = acceso.encargado ? pendientes.filter((s) => s.sucursalId === suya) : pendientes;

  return (
    <ZonaModulo soloLectura={acceso.soloLectura}>
    <Bodega
      vista={vista}
      resaltar={Number(sp.resaltar) || null}
      hoy={hoyEnBolivia()}
      ubicaciones={ubicaciones}
      productos={productos}
      stock={stock}
      lotes={lotes}
      transferencias={transferencias}
      solicitudes={solicitudes}
    />
    </ZonaModulo>
  );
}
