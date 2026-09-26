"use client";

import { ChevronDown, Download, Loader2, MessageCircle, Printer, Share2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  enlaceWhatsapp,
  mensajeWhatsapp,
  nombreArchivo,
  numeroComprobante,
  telefonoWhatsapp,
  type DatosComprobante,
  type TamanoImpresion,
} from "@/lib/comprobante/datos";
import { cargarGeneradorPdf } from "@/lib/comprobante/cargar-pdf";
import { cn } from "@/lib/utils";
import { Comprobante } from "./comprobante";

const NOMBRES: Record<TamanoImpresion, string> = { "58mm": "Térmica 58 mm", "80mm": "Térmica 80 mm", carta: "Hoja carta" };

/** Márgenes de página por formato; en térmica el ancho lo da el propio comprobante. */
const ESTILO_PAGINA: Record<TamanoImpresion, string> = {
  "58mm": "@page { margin: 0; }",
  "80mm": "@page { margin: 0; }",
  carta: "@page { size: letter; margin: 12mm; }",
};

async function pdf(datos: DatosComprobante, tamano: TamanoImpresion) {
  const { generarPdf } = await cargarGeneradorPdf();
  return generarPdf(datos, tamano);
}

const sinSuscripcion = () => () => {};

/**
 * Imprimir (58/80 mm o carta), descargar PDF y enviar por WhatsApp.
 * Imprimir y generar el PDF funcionan sin internet; el enlace de WhatsApp necesita conexión.
 */
export function AccionesComprobante({ datos, className }: { datos: DatosComprobante; className?: string }) {
  const [imprimiendo, setImprimiendo] = useState<TamanoImpresion | null>(null);
  const [generando, setGenerando] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const tamano = datos.sucursal.tamanoImpresion;

  // Imprime cuando el comprobante ya está dibujado en la zona de impresión.
  useEffect(() => {
    if (!imprimiendo) return;
    const estilo = document.createElement("style");
    estilo.textContent = ESTILO_PAGINA[imprimiendo];
    document.head.appendChild(estilo);
    const limpiar = () => setImprimiendo(null);
    window.addEventListener("afterprint", limpiar, { once: true });
    // Espera a que carguen las imágenes (logo) antes de abrir el diálogo de impresión.
    const t = setTimeout(async () => {
      await Promise.all([...document.querySelectorAll<HTMLImageElement>(".zona-impresion img")].map((i) => i.decode().catch(() => {})));
      window.print();
    }, 50);
    return () => {
      clearTimeout(t);
      estilo.remove();
      window.removeEventListener("afterprint", limpiar);
    };
  }, [imprimiendo]);

  async function descargar() {
    setGenerando(true);
    try {
      const blob = await pdf(datos, tamano);
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: nombreArchivo(datos) });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch {
      toast.error("No se pudo generar el PDF");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <div className={cn("grid grid-cols-3 gap-2", className)}>
        <div className="flex">
          <Button variant="outline" className="h-14 flex-1 flex-col gap-0.5 rounded-l-2xl rounded-r-none border-r-0 text-xs font-bold" onClick={() => setImprimiendo(tamano)}>
            <Printer className="size-5" /> Imprimir
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-14 w-7 rounded-l-none rounded-r-2xl px-0" aria-label="Elegir tamaño de impresión">
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.keys(NOMBRES) as TamanoImpresion[]).map((t) => (
                <DropdownMenuItem key={t} onSelect={() => setImprimiendo(t)}>
                  <Printer className="size-4" /> {NOMBRES[t]}
                  {t === tamano && <span className="ml-auto text-xs text-muted-foreground">sucursal</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button variant="outline" className="h-14 flex-col gap-0.5 rounded-2xl text-xs font-bold" disabled={generando} onClick={descargar}>
          {generando ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />} PDF
        </Button>
        <Button className="h-14 flex-col gap-0.5 rounded-2xl bg-whatsapp text-xs font-bold text-white hover:bg-whatsapp/90" onClick={() => setWhatsapp(true)}>
          <MessageCircle className="size-5" /> WhatsApp
        </Button>
      </div>

      {imprimiendo &&
        createPortal(
          <div className="zona-impresion">
            <Comprobante datos={datos} tamano={imprimiendo} />
          </div>,
          document.body,
        )}
      {whatsapp && <DialogoWhatsapp datos={datos} tamano={tamano} onCerrar={() => setWhatsapp(false)} />}
    </>
  );
}

function DialogoWhatsapp({ datos, tamano, onCerrar }: { datos: DatosComprobante; tamano: TamanoImpresion; onCerrar: () => void }) {
  const [telefono, setTelefono] = useState(datos.venta.cliente?.telefono ?? "");
  const [compartiendo, setCompartiendo] = useState(false);
  // Web Share con archivos: disponible en celulares (Android/iPhone) y algunos navegadores de PC.
  const puedeCompartirArchivo = useSyncExternalStore(
    sinSuscripcion,
    () => typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] }),
    () => false,
  );
  const enLinea = useSyncExternalStore(sinSuscripcion, () => navigator.onLine, () => true);
  const numero = telefonoWhatsapp(telefono, datos.negocio.codigoPais);
  const enlace = typeof window === "undefined" ? "" : `${window.location.origin}/comprobante/${datos.venta.tokenPublico}`;

  async function compartirArchivo() {
    setCompartiendo(true);
    try {
      const blob = await pdf(datos, tamano);
      const archivo = new File([blob], nombreArchivo(datos), { type: "application/pdf" });
      await navigator.share({ files: [archivo], title: `Comprobante N.º ${numeroComprobante(datos.venta.numero)}` });
      onCerrar();
    } catch (e) {
      // El usuario cerró el menú de compartir: no es un error.
      if (!(e instanceof DOMException && e.name === "AbortError")) toast.error("No se pudo compartir el PDF");
    } finally {
      setCompartiendo(false);
    }
  }

  function enviarEnlace() {
    if (!numero) return;
    if (!navigator.onLine) {
      toast.error("Sin conexión: el enlace necesita internet. Comparte el PDF o inténtalo al volver la conexión.");
      return;
    }
    window.open(enlaceWhatsapp(numero, mensajeWhatsapp(datos, enlace)), "_blank", "noopener");
    onCerrar();
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">Enviar por WhatsApp</DialogTitle>
          <DialogDescription>Comprobante N.º {numeroComprobante(datos.venta.numero)}</DialogDescription>
        </DialogHeader>

        {puedeCompartirArchivo && (
          <div className="space-y-2">
            <Button size="lg" className="h-14 w-full rounded-2xl bg-whatsapp text-base font-bold text-white hover:bg-whatsapp/90" disabled={compartiendo} onClick={compartirArchivo}>
              {compartiendo ? <Loader2 className="size-5 animate-spin" /> : <Share2 className="size-5" />}
              Compartir el PDF
            </Button>
            <p className="text-center text-xs text-muted-foreground">Elige WhatsApp y el contacto en el menú del teléfono. Funciona sin internet para generarlo.</p>
            {!datos.venta.provisional && (
              <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> o envía un enlace <span className="h-px flex-1 bg-border" />
              </div>
            )}
          </div>
        )}

        {datos.venta.provisional ? (
          <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
            Esta venta se hizo sin conexión: el enlace para el cliente estará disponible cuando se sincronice.
            {puedeCompartirArchivo ? " Mientras tanto puedes compartir el PDF." : " Mientras tanto puedes descargar o imprimir el PDF."}
          </p>
        ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            enviarEnlace();
          }}
        >
          <label htmlFor="celular-whatsapp" className="text-sm font-semibold">
            Celular del cliente
          </label>
          <div className="flex items-center rounded-xl border focus-within:ring-3 focus-within:ring-ring/50">
            <span className="cifras pl-3 text-muted-foreground">+{datos.negocio.codigoPais}</span>
            <Input
              id="celular-whatsapp"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              type="tel"
              inputMode="tel"
              autoFocus={!puedeCompartirArchivo}
              placeholder="71234567"
              className="cifras border-0 bg-transparent text-lg shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          {telefono && !numero && <p className="text-sm text-destructive">Número inválido</p>}
          <Button
            type="submit"
            variant={puedeCompartirArchivo ? "outline" : "default"}
            size="lg"
            className={cn("h-12 w-full rounded-2xl font-bold", !puedeCompartirArchivo && "bg-whatsapp text-white hover:bg-whatsapp/90")}
            disabled={!numero}
          >
            <MessageCircle className="size-5" /> Abrir WhatsApp con el enlace
          </Button>
          {!enLinea && <p className="text-center text-xs text-destructive">Sin conexión: el enlace se podrá enviar cuando vuelva internet.</p>}
          <p className="text-center text-xs text-muted-foreground">
            El cliente recibe un enlace privado para ver y descargar su comprobante.
          </p>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
