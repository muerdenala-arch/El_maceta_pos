import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requerirSesion } from "@/lib/auth/sesion";
import { cajaAbiertaDe, nombreSucursal } from "@/lib/caja/consultas";
import { FormularioApertura } from "./formulario-apertura";

export const metadata: Metadata = { title: "Apertura de caja" };

export default async function PaginaApertura() {
  const sesion = await requerirSesion("cajero");
  if (await cajaAbiertaDe(sesion.uid)) redirect("/cajero/venta");
  if (!sesion.sucursalId) {
    return <p className="p-10 text-center text-muted-foreground">No tienes una sucursal asignada. Avisa al administrador.</p>;
  }
  return <FormularioApertura nombre={sesion.nombre} sucursal={await nombreSucursal(sesion.sucursalId)} />;
}
