"use client";

import { Check, Plus } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { AccionesComprobante } from "@/components/comprobante/acciones-comprobante";
import { Button } from "@/components/ui/button";
import { formatoBs } from "@/lib/formato";
import type { VentaRealizada } from "../acciones";

/** Pantalla "Venta realizada" con las opciones de comprobante: imprimir, PDF y WhatsApp (sección 6). */
export function VentaExitosa({ venta, onNueva }: { venta: VentaRealizada; onNueva: () => void }) {
  const boton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    boton.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-6 text-center sm:pt-12">
      <motion.span
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", duration: 0.25, bounce: 0.35 }}
        className="flex size-24 items-center justify-center rounded-full bg-exito text-exito-foreground shadow-lg"
      >
        <Check className="size-12" strokeWidth={3} />
      </motion.span>
      <h1 className="mt-6 text-3xl font-extrabold">Venta realizada</h1>
      <p className="cifras mt-1 text-muted-foreground">Comprobante N.º {venta.numero}</p>

      <div className="mt-8 w-full space-y-3 rounded-3xl border bg-card p-6 shadow-sm">
        <Fila etiqueta="Total" valor={formatoBs(venta.total)} grande />
        <Fila etiqueta="Método de pago" valor={venta.metodoPago === "efectivo" ? "Efectivo" : "QR"} />
        {venta.metodoPago === "efectivo" && venta.montoRecibido && (
          <>
            <Fila etiqueta="Recibido" valor={formatoBs(venta.montoRecibido)} />
            <div className="flex items-center justify-between rounded-2xl bg-ficha-verde p-4 text-ficha-verde-foreground">
              <span className="font-bold">Cambio</span>
              <span className="cifras font-display text-4xl font-extrabold">{formatoBs(venta.cambio ?? "0")}</span>
            </div>
          </>
        )}
      </div>

      {venta.comprobante && (
        <div className="mt-5 w-full">
          <p className="mb-2 text-left text-sm font-semibold text-muted-foreground">Comprobante</p>
          <AccionesComprobante datos={venta.comprobante} />
        </div>
      )}

      <Button ref={boton} size="lg" className="mt-5 h-14 w-full rounded-2xl text-lg font-bold" onClick={onNueva}>
        <Plus className="size-5" /> Nueva venta
      </Button>
    </div>
  );
}

function Fila({ etiqueta, valor, grande }: { etiqueta: string; valor: string; grande?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-semibold text-muted-foreground">{etiqueta}</span>
      <span className={grande ? "cifras font-display text-3xl font-extrabold" : "cifras font-bold"}>{valor}</span>
    </div>
  );
}
