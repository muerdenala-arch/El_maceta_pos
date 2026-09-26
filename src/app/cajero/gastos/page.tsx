import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth/sesion";
import { gastosDeCaja, requerirCajaAbierta } from "@/lib/caja/consultas";
import { GastosCajero } from "./gastos-cajero";

export const metadata: Metadata = { title: "Gastos" };

export default async function PaginaGastos() {
  const sesion = await requerirSesion("cajero");
  const caja = await requerirCajaAbierta(sesion);
  return <GastosCajero gastos={await gastosDeCaja(caja.id)} cajaId={caja.id} usuarioId={sesion.uid} />;
}
