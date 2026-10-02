import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth/sesion";
import { requerirCajaAbierta, totalesCaja, ventasDeCaja } from "@/lib/caja/consultas";
import { CierreCaja } from "./cierre-caja";
import { ROLES_CAJA } from "@/lib/auth/constantes";

export const metadata: Metadata = { title: "Cierre de caja" };

export default async function PaginaCierre() {
  const sesion = await requerirSesion(...ROLES_CAJA);
  const caja = await requerirCajaAbierta(sesion);
  const [resumen, ventas] = await Promise.all([totalesCaja(caja.id, caja.montoInicial), ventasDeCaja(caja.id)]);

  return <CierreCaja apertura={caja.apertura.toISOString()} resumen={resumen} ventas={ventas} />;
}
