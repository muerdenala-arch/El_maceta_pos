import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth/sesion";
import { productosPos, qrsDeSucursal, requerirCajaAbierta } from "@/lib/caja/consultas";
import { PuntoDeVenta } from "./punto-de-venta";

export const metadata: Metadata = { title: "Venta" };

export default async function PaginaVenta() {
  const sesion = await requerirSesion("cajero");
  // Sin caja abierta no se vende: lleva a la apertura.
  const caja = await requerirCajaAbierta(sesion);
  const [productos, qrs] = await Promise.all([productosPos(caja.sucursalId), qrsDeSucursal(caja.sucursalId)]);

  return <PuntoDeVenta cajaId={caja.id} productos={productos} qrs={qrs} />;
}
