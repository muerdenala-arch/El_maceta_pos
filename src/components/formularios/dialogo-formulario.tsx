"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Diálogo con formulario: se desplaza en celular y tiene los botones Cancelar/Guardar al pie. */
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
  return (
    <Dialog open={abierto} onOpenChange={(v) => !pendiente && onAbierto(v)}>
      <DialogContent className={`max-h-[92dvh] gap-0 overflow-hidden rounded-3xl p-0 ${ancho}`}>
        <form
          className="flex max-h-[92dvh] flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            onGuardar();
          }}
          noValidate
        >
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle className="font-display text-xl font-extrabold">{titulo}</DialogTitle>
            {descripcion && <DialogDescription>{descripcion}</DialogDescription>}
          </DialogHeader>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
          <DialogFooter className="border-t px-6 py-4">
            <Button type="button" variant="outline" disabled={pendiente} onClick={() => onAbierto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendiente} className="font-bold">
              {pendiente ? "Guardando…" : textoGuardar}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
