"use client";

import { useSoloLectura } from "@/components/permisos/zona-modulo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Diálogo con formulario: se desplaza en celular y tiene los botones Cancelar/Guardar al pie.
 * En un apartado con candado (encargado) muestra los datos sin poder cambiarlos ni guardar.
 */
export function DialogoFormulario({
  abierto,
  onAbierto,
  titulo,
  descripcion,
  pendiente,
  textoGuardar = "Guardar",
  onGuardar,
  children,
  ancho = "sm:max-w-lg",
}: {
  abierto: boolean;
  onAbierto: (abierto: boolean) => void;
  titulo: string;
  descripcion?: string;
  pendiente?: boolean;
  textoGuardar?: string;
  onGuardar: () => void;
  children: React.ReactNode;
  ancho?: string;
}) {
  const soloLectura = useSoloLectura();
  return (
    <Dialog open={abierto} onOpenChange={(v) => !pendiente && onAbierto(v)}>
      <DialogContent className={`max-h-[92dvh] gap-0 overflow-hidden rounded-3xl p-0 ${ancho}`}>
        <form
          className="flex max-h-[92dvh] flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!soloLectura) onGuardar();
          }}
          noValidate
        >
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle className="font-display text-xl font-extrabold">{titulo}</DialogTitle>
            {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <fieldset disabled={soloLectura} className="min-w-0 space-y-4">
              {children}
            </fieldset>
          </div>
          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" disabled={pendiente} onClick={() => onAbierto(false)}>
              {soloLectura ? "Cerrar" : "Cancelar"}
            </Button>
            {!soloLectura && (
              <Button type="submit" disabled={pendiente} className="font-bold">
                {pendiente ? "Guardando…" : textoGuardar}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
