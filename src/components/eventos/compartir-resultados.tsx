"use client";

import { Download, FileSpreadsheet, Loader2, MessageCircle, Printer, Send, Share2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { enlaceWhatsapp, telefonoWhatsapp } from "@/lib/comprobante/datos";

const sinSuscripcion = () => () => {};

export type MensajePersonal = { id: number; nombre: string; posicion: number | null; telefono: string; texto: string };

type Props = {
  evento: { id: number; nombre: string; estado: "borrador" | "en_curso" | "finalizado"; tokenPublico: string };
  negocio: { nombre: string; codigoPais: string };
  /** PDF generado en el dispositivo (solo datos públicos). */
  generarPdf: () => Promise<{ blob: Blob; nombre: string }>;
  /** Versión para imprimir (se dibuja en la zona de impresión). */
  impresion: React.ReactNode;
  excelHref: string;
  /** Mensaje personal para cada participante (solo con el evento finalizado). */
  mensajes?: MensajePersonal[];
};

/**
 * Imprimir, PDF, Excel y WhatsApp de los resultados de un evento (reto o torneo). Mismo esquema que el
 * comprobante de venta: en el celular se comparte el PDF; si no, se envía el enlace público por wa.me.
 */
export function CompartirResultados({ evento, negocio, generarPdf, impresion, excelHref, mensajes }: Props) {
  const [imprimiendo, setImprimiendo] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [verMensajes, setVerMensajes] = useState(false);

  useEffect(() => {
    if (!imprimiendo) return;
    const estilo = document.createElement("style");
    estilo.textContent = "@page { size: A4; margin: 14mm; }";
    document.head.appendChild(estilo);
    const limpiar = () => setImprimiendo(false);
    window.addEventListener("afterprint", limpiar, { once: true });
    const t = setTimeout(() => window.print(), 50);
    return () => {
      clearTimeout(t);
      estilo.remove();
      window.removeEventListener("afterprint", limpiar);
    };
  }, [imprimiendo]);

  async function descargar() {
    setGenerando(true);
    try {
      const { blob, nombre } = await generarPdf();
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement("a"), { href: url, download: nombre }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch {
      toast.error("No se pudo generar el PDF");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setImprimiendo(true)}>
          <Printer className="size-4" /> Imprimir
        </Button>
        <Button variant="outline" disabled={generando} onClick={descargar}>
          {generando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} PDF
        </Button>
        <Button variant="outline" asChild>
          <a href={excelHref} download>
            <FileSpreadsheet className="size-4 text-exito" /> Excel
          </a>
        </Button>
        <Button className="bg-whatsapp font-bold text-white hover:bg-whatsapp/90" onClick={() => setWhatsapp(true)}>
          <MessageCircle className="size-4" /> Compartir por WhatsApp
        </Button>
        {evento.estado === "finalizado" && mensajes && (
          <Button variant="outline" onClick={() => setVerMensajes(true)}>
            <Send className="size-4" /> Resultado a cada participante
          </Button>
        )}
      </div>

      {imprimiendo && createPortal(<div className="zona-impresion">{impresion}</div>, document.body)}
      {whatsapp && <DialogoCompartir evento={evento} negocio={negocio} generarPdf={generarPdf} onCerrar={() => setWhatsapp(false)} />}
      {verMensajes && mensajes && <DialogoMensajes mensajes={mensajes} codigoPais={negocio.codigoPais} onCerrar={() => setVerMensajes(false)} />}
    </>
  );
}

function DialogoCompartir({ evento, negocio, generarPdf, onCerrar }: Pick<Props, "evento" | "negocio" | "generarPdf"> & { onCerrar: () => void }) {
  const [telefono, setTelefono] = useState("");
  const [compartiendo, setCompartiendo] = useState(false);
  const puedeCompartirArchivo = useSyncExternalStore(
    sinSuscripcion,
    () => typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] }),
    () => false,
  );
  const numero = telefonoWhatsapp(telefono, negocio.codigoPais);
  const enlace = typeof window === "undefined" ? "" : `${window.location.origin}/eventos/${evento.tokenPublico}`;
  const titulo = evento.estado === "finalizado" ? "Resultados finales" : "Posiciones";

  async function compartirArchivo() {
    setCompartiendo(true);
    try {
      const { blob, nombre } = await generarPdf();
      await navigator.share({ files: [new File([blob], nombre, { type: "application/pdf" })], title: `${titulo} · ${evento.nombre}` });
      onCerrar();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) toast.error("No se pudo compartir el PDF");
    } finally {
      setCompartiendo(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">Compartir por WhatsApp</DialogTitle>
          <DialogDescription>Solo se comparten nombres y resultados: nunca la cédula ni el teléfono.</DialogDescription>
        </DialogHeader>
        {puedeCompartirArchivo && (
          <Button size="lg" className="h-12 w-full rounded-2xl bg-whatsapp font-bold text-white hover:bg-whatsapp/90" disabled={compartiendo} onClick={compartirArchivo}>
            {compartiendo ? <Loader2 className="size-5 animate-spin" /> : <Share2 className="size-5" />} Compartir el PDF
          </Button>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!numero) return;
            window.open(enlaceWhatsapp(numero, `${titulo} de «${evento.nombre}» de ${negocio.nombre}: ${enlace}`), "_blank", "noopener");
            onCerrar();
          }}
        >
          <label htmlFor="celular-resultados" className="text-sm font-semibold">
            O enviar el enlace a un celular
          </label>
          <div className="flex items-center rounded-xl border focus-within:ring-3 focus-within:ring-ring/50">
            <span className="cifras pl-3 text-muted-foreground">+{negocio.codigoPais}</span>
            <Input
              id="celular-resultados"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              type="tel"
              inputMode="tel"
              placeholder="71234567"
              className="cifras border-0 bg-transparent text-lg shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
          </div>
          <Button type="submit" variant="outline" size="lg" className="h-12 w-full rounded-2xl font-bold" disabled={!numero}>
            <MessageCircle className="size-5" /> Abrir WhatsApp con el enlace
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogoMensajes({ mensajes, codigoPais, onCerrar }: { mensajes: MensajePersonal[]; codigoPais: string; onCerrar: () => void }) {
  const [enviados, setEnviados] = useState<Set<number>>(new Set());
  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">Resultado a cada participante</DialogTitle>
          <DialogDescription>Se abre WhatsApp con el mensaje listo para cada persona; tú lo envías.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-2xl border">
          {mensajes.map((m) => {
            const numero = telefonoWhatsapp(m.telefono, codigoPais);
            return (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="cifras w-6 text-center font-bold">{m.posicion ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.nombre}</span>
                <Button
                  size="sm"
                  variant={enviados.has(m.id) ? "ghost" : "outline"}
                  disabled={!numero}
                  onClick={() => {
                    window.open(enlaceWhatsapp(numero!, m.texto), "_blank", "noopener");
                    setEnviados((s) => new Set(s).add(m.id));
                  }}
                >
                  <MessageCircle className="size-4 text-whatsapp" /> {enviados.has(m.id) ? "Abierto" : "Enviar"}
                </Button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
