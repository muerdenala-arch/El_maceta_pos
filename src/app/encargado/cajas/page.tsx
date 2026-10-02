import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { AuditoriaCajas } from "@/app/admin/auditoria/auditoria-cajas";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { listarCajasAuditadas } from "@/lib/caja/auditadas";
import { requerirEncargado } from "@/lib/encargado";
import { fechaValida, hoyEnBolivia } from "@/lib/formato";

export const metadata: Metadata = { title: "Cajas" };

/** Supervisión de las cajas de la sucursal: abiertas en vivo y cierres (esperado vs. contado). */
export default async function CajasEncargado(props: PageProps<"/encargado/cajas">) {
  const { sucursal } = await requerirEncargado();
  const sp = await props.searchParams;
  const hoy = hoyEnBolivia();
  const hasta = fechaValida(sp.hasta) ?? hoy;
  const desde = fechaValida(sp.desde) ?? new Date(Date.parse(`${hasta}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const cajaResaltada = Number(sp.caja) || null;
  // Siempre con su sucursal: una caja de otra sucursal no aparece aunque se escriba su número en la dirección.
  const cajas = await listarCajasAuditadas({ desde, hasta, sucursalId: sucursal.id, cajaResaltada });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina icono={Wallet} titulo="Cajas" descripcion={`Aperturas y cierres de caja de ${sucursal.nombre}`} />
      <AuditoriaCajas cajas={cajas} desde={desde} hasta={hasta} hoy={hoy} resaltar={cajaResaltada} />
    </div>
  );
}
