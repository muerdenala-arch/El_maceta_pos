import { Truck } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { requerirEncargado } from "@/lib/encargado";
import { listarTransferencias } from "@/lib/inventario/consultas";
import { TransferenciasSucursal } from "./transferencias-sucursal";

export const metadata: Metadata = { title: "Transferencias" };

/** Lo que la bodega central envió a la sucursal del encargado: él confirma la llegada y el stock entra. */
export default async function TransferenciasEncargado() {
  const { sucursal } = await requerirEncargado();
  const transferencias = await listarTransferencias({ destinoId: sucursal.id, limite: 60 });
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <EncabezadoPagina icono={Truck} titulo="Transferencias" descripcion={`Lo que llega a ${sucursal.nombre}. Confirma cada envío cuando lo recibas: recién entonces entra al stock.`} />
      <TransferenciasSucursal transferencias={transferencias} />
    </div>
  );
}
