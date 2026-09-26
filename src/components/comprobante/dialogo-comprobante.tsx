"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { verComprobante } from "@/app/cajero/acciones";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { DatosComprobante } from "@/lib/comprobante/datos";
import { numeroComprobante } from "@/lib/comprobante/datos";
import { AccionesComprobante } from "./acciones-comprobante";
import { Comprobante } from "./comprobante";

/** Vista previa del comprobante de una venta + reimprimir, descargar o reenviar. */
export function DialogoComprobante({ ventaId, onCerrar }: { ventaId: number; onCerrar: () => void }) {
  const [datos, setDatos] = useState<DatosComprobante | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    verComprobante(ventaId)
      .then((r) => vigente && (r.ok ? setDatos(r.datos) : setError(r.error)))
      .catch(() => vigente && setError("No se pudo cargar el comprobante"));
    return () => {
      vigente = false;
    };
  }, [ventaId]);

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogTitle className="font-display text-xl font-extrabold">
          {datos ? `Comprobante N.º ${numeroComprobante(datos.venta.numero)}` : "Comprobante"}
        </DialogTitle>
        {error && <p className="py-8 text-center text-destructive">{error}</p>}
        {!datos && !error && <Loader2 className="mx-auto my-10 size-8 animate-spin text-muted-foreground" />}
        {datos && (
          <>
            <div className="flex justify-center overflow-x-auto rounded-2xl border bg-white p-3 shadow-inner">
              <Comprobante datos={datos} tamano={datos.sucursal.tamanoImpresion === "58mm" ? "58mm" : "80mm"} />
            </div>
            <AccionesComprobante datos={datos} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
