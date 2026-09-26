"use client";

/* eslint-disable @next/next/no-img-element -- vista previa de imágenes propias (Blob o locales) */
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { subirImagen } from "@/lib/acciones/subir-imagen";
import { comprimirImagen, type OpcionesCompresion } from "@/lib/imagen-cliente";
import { cn } from "@/lib/utils";

type Props = {
  valor: string | null;
  onCambiar: (url: string | null) => void;
  carpeta: "productos" | "logo" | "qr" | "gastos";
  compresion: OpcionesCompresion;
  forma?: "cuadrada" | "circular";
  etiqueta?: string;
};

/**
 * Elegir foto (galería o cámara en el celular) → comprimir en el dispositivo → subir → URL.
 * La URL se guarda recién al guardar el formulario.
 */
export function SubirImagen({ valor, onCambiar, carpeta, compresion, forma = "cuadrada", etiqueta = "Foto" }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function alElegir(archivo: File | undefined) {
    if (!archivo) return;
    setSubiendo(true);
    try {
      const comprimida = await comprimirImagen(archivo, compresion);
      const datos = new FormData();
      datos.set("carpeta", carpeta);
      datos.set("archivo", comprimida, `imagen.${comprimida.type === "image/webp" ? "webp" : "jpg"}`);
      const r = await subirImagen(datos);
      if (r.ok) onCambiar(r.datos.url);
      else toast.error(r.error);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  const redondeo = forma === "circular" ? "rounded-full" : "rounded-2xl";

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={subiendo}
        aria-label={valor ? `Cambiar ${etiqueta.toLowerCase()}` : `Subir ${etiqueta.toLowerCase()}`}
        className={cn(
          "relative flex size-28 shrink-0 items-center justify-center overflow-hidden border-2 border-dashed bg-muted/60 text-muted-foreground transition-colors hover:border-primary hover:text-primary",
          redondeo,
          valor && "border-solid",
        )}
      >
        {valor ? (
          <img src={valor} alt={etiqueta} className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-8" />
        )}
        {subiendo && (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-7 animate-spin text-primary" />
          </span>
        )}
      </button>
      <div className="space-y-2">
        <Button type="button" variant="outline" size="sm" disabled={subiendo} onClick={() => entrada.current?.click()}>
          <ImagePlus className="size-4" />
          {valor ? "Cambiar" : "Subir"} {etiqueta.toLowerCase()}
        </Button>
        {valor && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={subiendo}
            className="text-destructive hover:text-destructive"
            onClick={() => onCambiar(null)}
          >
            <Trash2 className="size-4" />
            Quitar
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Desde el celular o la PC. Se comprime automáticamente.</p>
      </div>
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => alElegir(e.target.files?.[0])}
      />
    </div>
  );
}
