import type { Metadata } from "next";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { hoyEnBolivia } from "@/lib/formato";
import { listarUbicaciones } from "@/lib/inventario/consultas";
import { periodoDe, periodoValido, periodoVecino } from "@/lib/sueldos/calculo";
import { asegurarEmpleados, planillaDelMes } from "@/lib/sueldos/consultas";
import { Sueldos } from "./sueldos";

export const metadata: Metadata = { title: "Sueldos" };

/**
 * Sueldos del personal (solo administrador): trabajadores (con o sin usuario en el sistema), desde cuándo trabajan y
 * cuándo cumplen su mes, sueldo, adelantos, descuentos, bonos y pagos de cada mes, y bajas con su motivo.
 */
export default async function PaginaSueldos(props: PageProps<"/admin/sueldos">) {
  await requerirModulo("sueldos");
  const hoy = hoyEnBolivia();
  const actual = periodoDe(hoy);
  const sp = await props.searchParams;
  // Hasta el mes que viene (para dejar adelantos anotados); nunca más allá.
  const tope = periodoVecino(actual, 1);
  const periodo = periodoValido(sp.mes) && sp.mes <= tope ? sp.mes : actual;
  const conBajas = sp.bajas === "1";
  await asegurarEmpleados();
  const [filas, ubicaciones] = await Promise.all([planillaDelMes(periodo, { conBajas }), listarUbicaciones()]);
  return <Sueldos periodo={periodo} actual={actual} tope={tope} hoy={hoy} conBajas={conBajas} filas={filas} sucursales={ubicaciones.map((u) => ({ id: u.id, nombre: u.nombre }))} />;
}
