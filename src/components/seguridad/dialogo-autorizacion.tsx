"use client";

import { ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { pedirAutorizacion } from "@/lib/auth/autorizacion-acciones";
import { TecladoPin } from "./teclado-pin";

export type AutorizacionDada = { token: string; autorizador: string; rol: "admin" | "encargado" };

/**
 * El encargado de la sucursal (o un administrador) escribe su PIN en la pantalla de quien está vendiendo para
 * autorizar un descuento o una anulación. El PIN no se guarda: el servidor devuelve un permiso de pocos minutos.
 */
export function DialogoAutorizacion({
  titulo,
  descripcion,
  proposito,
  referencia,
  porcentaje = null,
  onAutorizado,
  onCerrar,
}: {
  titulo: string;
  descripcion: React.ReactNode;
  proposito: "descuento" | "anulacion";
  /** UUID del cobro (descuento) o id de la venta (anulación). */
  referencia: string;
  porcentaje?: string | null;
  onAutorizado: (a: AutorizacionDada) => void;
  onCerrar: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [ocupado, iniciar] = useTransition();

  const enviar = () =>
    iniciar(async () => {
      try {
        const r = await pedirAutorizacion({ pin, proposito, ref: referencia, porcentaje });
        if (r.ok) return onAutorizado(r.datos);
        setError(r.error);
      } catch {
        setError("No se pudo comprobar el PIN. Las autorizaciones necesitan conexión.");
      }
      setPin("");
      setIntento((n) => n + 1);
    });

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !ocupado && onCerrar()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto rounded-3xl sm:max-w-sm">
        <DialogTitle className="flex items-center gap-2 font-display text-xl font-extrabold">
          <ShieldCheck className="size-6 text-primary" /> {titulo}
        </DialogTitle>
        <DialogDescription>{descripcion}</DialogDescription>
        <p className="text-center text-sm font-semibold">PIN del encargado de la sucursal o de un administrador</p>
        <TecladoPin valor={pin} onCambiar={setPin} onEnviar={enviar} ocupado={ocupado} error={error} intentoError={intento} textoBoton="Autorizar" />
      </DialogContent>
    </Dialog>
  );
}
