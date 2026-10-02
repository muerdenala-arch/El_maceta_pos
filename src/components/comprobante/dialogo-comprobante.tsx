"use client";

import { Ban, CheckCircle2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { anularVenta, confirmarPagoQr } from "@/app/admin/reportes/acciones";
import { verComprobante } from "@/app/cajero/acciones";
import { anularVentaEnSucursal } from "@/app/cajero/ventas/acciones";
import { DialogoAutorizacion } from "@/components/seguridad/dialogo-autorizacion";
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
 * En la sucursal (`anulacion`): el encargado anula directamente; el cajero, con el PIN del encargado o de un
 * administrador. Solo mientras la caja de la venta siga abierta (lo comprueba el servidor).
 */
export function DialogoComprobante({
  ventaId,
  admin,
  anulacion,
  onCerrar,
}: {
  ventaId: number;
  admin?: boolean;
  anulacion?: "encargado" | "cajero";
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [datos, setDatos] = useState<DatosComprobante | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pidiendoPin, setPidiendoPin] = useState(false);

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

  const anularAqui = useAccion(anularVentaEnSucursal, {
    mensajeExito: "Venta anulada: el stock volvió a la sucursal",
    alExito: () => {
      setAnulando(false);
      actualizar();
    },
  });
  const puedeAnular = admin || !!anulacion;
  const anulandoAhora = admin ? anular : anularAqui;

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

            {puedeAnular && !v.anulada && !anulando && (
              <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => setAnulando(true)}>
                <Ban className="size-4" /> Anular venta
              </Button>
            )}
            {puedeAnular && anulando && (
              <form
                className="space-y-3 rounded-2xl border border-destructive/40 p-4"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (admin) anular.ejecutar({ id: v.id, motivo });
                  else if (anulacion === "encargado") anularAqui.ejecutar({ id: v.id, motivo });
                  else if (motivo.trim().length >= 4) setPidiendoPin(true);
                  else anularAqui.ejecutar({ id: v.id, motivo }); // muestra el error del motivo
                }}
              >
                <p className="text-sm">
                  La venta queda registrada como <strong>anulada</strong> (no se borra), el stock vuelve a la sucursal y queda en auditoría.
                  {anulacion === "cajero" && " Necesita el PIN del encargado o de un administrador."}
                </p>
                <Campo etiqueta="Motivo" error={anulandoAhora.campos.motivo}>
                  {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} autoFocus placeholder="Ej. el cliente devolvió el producto" />}
                </Campo>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAnulando(false)} disabled={anulandoAhora.pendiente}>
                    Volver
                  </Button>
                  <Button type="submit" variant="destructive" disabled={anulandoAhora.pendiente}>
                    {anulandoAhora.pendiente ? "Anulando…" : anulacion === "cajero" ? "Pedir autorización" : "Anular venta"}
                  </Button>
                </div>
              </form>
            )}
            {pidiendoPin && (
              <DialogoAutorizacion
                titulo="Autorizar anulación"
                descripcion={
                  <>
                    Anular la venta N.º {numeroComprobante(v.numero)} por <strong>{formatoBs(v.total)}</strong>.
                  </>
                }
                proposito="anulacion"
                referencia={String(v.id)}
                onCerrar={() => setPidiendoPin(false)}
                onAutorizado={(a) => {
                  setPidiendoPin(false);
                  anularAqui.ejecutar({ id: v.id, motivo, autorizacion: a.token });
                }}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
