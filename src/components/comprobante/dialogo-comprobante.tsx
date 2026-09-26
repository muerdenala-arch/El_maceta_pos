"use client";

import { Ban, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { anularVenta, confirmarPagoQr } from "@/app/admin/reportes/acciones";
import { verComprobante } from "@/app/cajero/acciones";
import { Campo } from "@/components/formularios/campo";
import { useAccion } from "@/components/formularios/use-accion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { DatosComprobante } from "@/lib/comprobante/datos";
import { numeroComprobante } from "@/lib/comprobante/datos";
import { formatoBs } from "@/lib/formato";
import { AccionesComprobante } from "./acciones-comprobante";
import { Comprobante } from "./comprobante";

/**
 * Vista previa del comprobante de una venta + reimprimir, descargar o reenviar.
 * Para el administrador además: confirmar un pago QR pendiente y anular la venta con motivo.
 */
export function DialogoComprobante({ ventaId, admin, onCerrar }: { ventaId: number; admin?: boolean; onCerrar: () => void }) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosComprobante | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const cargar = useCallback(
    () =>
      verComprobante(ventaId)
        .then((r) => (r.ok ? setDatos(r.datos) : setError(r.error)))
        .catch(() => setError("No se pudo cargar el comprobante")),
    [ventaId],
  );
  useEffect(() => {
    cargar();
  }, [cargar]);

  const actualizar = () => {
    cargar();
    router.refresh();
  };
  const confirmar = useAccion(confirmarPagoQr, { mensajeExito: "Pago QR confirmado", alExito: actualizar });
  const anular = useAccion(anularVenta, {
    mensajeExito: "Venta anulada: el stock volvió a la sucursal",
    alExito: () => {
      setAnulando(false);
      actualizar();
    },
  });

  const v = datos?.venta;
  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onCerrar()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogTitle className="font-display text-xl font-extrabold">
          {v ? `Comprobante N.º ${numeroComprobante(v.numero)}` : "Comprobante"}
        </DialogTitle>
        {error && <p className="py-8 text-center text-destructive">{error}</p>}
        {!datos && !error && <Loader2 className="mx-auto my-10 size-8 animate-spin text-muted-foreground" />}
        {datos && v && (
          <>
            {admin && !v.anulada && v.estadoPago === "qr_por_confirmar" && (
              <div className="flex items-center gap-3 rounded-2xl border border-aviso/50 bg-aviso/15 p-3 text-sm">
                <p className="flex-1">
                  Pago por QR hecho <strong>sin conexión</strong>: revisa que llegaron {formatoBs(v.total)} a la cuenta.
                </p>
                <Button size="sm" disabled={confirmar.pendiente} onClick={() => confirmar.ejecutar({ id: v.id })}>
                  <CheckCircle2 className="size-4" /> Confirmar
                </Button>
              </div>
            )}
            <div className="flex justify-center overflow-x-auto rounded-2xl border bg-white p-3 shadow-inner">
              <Comprobante datos={datos} tamano={datos.sucursal.tamanoImpresion === "58mm" ? "58mm" : "80mm"} />
            </div>
            <AccionesComprobante datos={datos} />

            {admin && !v.anulada && !anulando && (
              <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => setAnulando(true)}>
                <Ban className="size-4" /> Anular venta
              </Button>
            )}
            {admin && anulando && (
              <form
                className="space-y-3 rounded-2xl border border-destructive/40 p-4"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  anular.ejecutar({ id: v.id, motivo });
                }}
              >
                <p className="text-sm">
                  La venta queda registrada como <strong>anulada</strong> (no se borra), el stock vuelve a la sucursal y queda en auditoría.
                </p>
                <Campo etiqueta="Motivo" error={anular.campos.motivo}>
                  {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} autoFocus placeholder="Ej. el cliente devolvió el producto" />}
                </Campo>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAnulando(false)} disabled={anular.pendiente}>
                    Volver
                  </Button>
                  <Button type="submit" variant="destructive" disabled={anular.pendiente}>
                    {anular.pendiente ? "Anulando…" : "Anular venta"}
                  </Button>
                </div>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
