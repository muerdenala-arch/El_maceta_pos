import type { Metadata } from "next";
import { requerirSesion } from "@/lib/auth/sesion";
import { hoyEnBolivia } from "@/lib/formato";
import { periodoDe, periodoValido, periodoVecino } from "@/lib/sueldos/calculo";
import { planillaDelMes } from "@/lib/sueldos/consultas";
import { Sueldos } from "./sueldos";

export const metadata: Metadata = { title: "Sueldos" };

/** Sueldos del personal (solo administrador): sueldo mensual, adelantos, descuentos, bonos y pagos de cada mes. */
export default async function PaginaSueldos(props: PageProps<"/admin/sueldos">) {
  await requerirSesion("admin");
  const actual = periodoDe(hoyEnBolivia());
  const pedido = (await props.searchParams).mes;
  // Hasta el mes que viene (para dejar adelantos anotados); nunca más allá.
  const tope = periodoVecino(actual, 1);
  const periodo = periodoValido(pedido) && pedido <= tope ? pedido : actual;
  return <Sueldos periodo={periodo} actual={actual} tope={tope} filas={await planillaDelMes(periodo)} />;
}
