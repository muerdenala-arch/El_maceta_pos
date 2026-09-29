"use client";

import { Download, FileSpreadsheet, Loader2, MessageCircle, Printer, Send, Share2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { enlaceWhatsapp, telefonoWhatsapp } from "@/lib/comprobante/datos";
import { textoKilos, textoPorcentaje, type FilaPosicion } from "@/lib/eventos/calculos";
import type { DetalleRetoProps } from "./tipos";

const sinSuscripcion = () => () => {};
const fechaCorta = (f: string) => f.split("-").reverse().join("/");

/** Un solo sitio de import(): Turbopack crea un fragmento por cada uno (ver CLAUDE.md, Fase 6). */
const cargarPdf = () => import("@/lib/eventos/pdf");

async function pdf(props: Props) {
  const { generarPdfResultados } = await cargarPdf();
  return generarPdfResultados({
    negocio: props.negocio,
    evento: { ...props.evento, finalizado: props.evento.estado === "finalizado" },
    filas: props.filas,
  });
}

async function nombreArchivo(evento: string) {
  const { nombreArchivoResultados } = await cargarPdf();
  return nombreArchivoResultados(evento);
}

type Props = Pick<DetalleRetoProps, "evento" | "participantes" | "negocio"> & { filas: FilaPosicion[] };

/** Imprimir, PDF, Excel y WhatsApp de los resultados (mismo esquema que el comprobante de venta). */
export function AccionesResultados(props: Props) {
  const { evento } = props;
  const [imprimiendo, setImprimiendo] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [whatsapp, setWhatsapp] = useState(false);
  const [mensajes, setMensajes] = useState(false);

  // Igual que el comprobante: se dibuja en la zona de impresión y luego se abre el diálogo del navegador.
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
      const url = URL.createObjectURL(await pdf(props));
      Object.assign(document.createElement("a"), { href: url, download: await nombreArchivo(evento.nombre) }).click();
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
          <a href={`/api/admin/eventos/${evento.id}/excel`} download>
            <FileSpreadsheet className="size-4 text-exito" /> Excel
          </a>
        </Button>
        <Button className="bg-whatsapp font-bold text-white hover:bg-whatsapp/90" onClick={() => setWhatsapp(true)}>
          <MessageCircle className="size-4" /> Compartir por WhatsApp
        </Button>
        {evento.estado === "finalizado" && (
          <Button variant="outline" onClick={() => setMensajes(true)}>
            <Send className="size-4" /> Resultado a cada participante
          </Button>
        )}
      </div>

      {imprimiendo &&
        createPortal(
          <div className="zona-impresion">
            <Impresion {...props} />
          </div>,
          document.body,
        )}
      {whatsapp && <DialogoCompartir {...props} onCerrar={() => setWhatsapp(false)} />}
      {mensajes && <DialogoMensajes {...props} onCerrar={() => setMensajes(false)} />}
    </>
  );
}

/** Versión para imprimir: blanco y negro, sin datos personales. */
function Impresion({ evento, negocio, filas }: Props) {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#000" }}>
      <p style={{ fontSize: 13, fontWeight: 700 }}>{negocio.nombre}</p>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 2px" }}>
        {evento.estado === "finalizado" ? "Resultados finales" : "Posiciones parciales"} · {evento.nombre}
      </h1>
      <p style={{ fontSize: 11 }}>
        Del {fechaCorta(evento.fechaInicio)} al {fechaCorta(evento.fechaFin)} · Gana por{" "}
        {evento.criterioGanador === "porcentaje" ? "porcentaje de peso perdido" : "kilos perdidos"}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #000", textAlign: "left" }}>
            <th style={{ padding: 4 }}>#</th>
            <th style={{ padding: 4 }}>Participante</th>
            <th style={{ padding: 4, textAlign: "right" }}>Kilos perdidos</th>
            <th style={{ padding: 4, textAlign: "right" }}>% perdido</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.participanteId} style={{ borderBottom: "1px solid #ccc", fontWeight: f.posicion && f.posicion <= 3 ? 700 : 400 }}>
              <td style={{ padding: 4 }}>{f.posicion ?? "—"}</td>
              <td style={{ padding: 4 }}>{f.nombre}</td>
              {f.kilos === null ? (
                <td colSpan={2} style={{ padding: 4, textAlign: "right" }}>
                  {f.estado === "no_completo" ? "No completó" : "Sin pesaje"}
                </td>
              ) : (
                <>
                  <td style={{ padding: 4, textAlign: "right" }}>{textoKilos(f.kilos)}</td>
                  <td style={{ padding: 4, textAlign: "right" }}>{textoPorcentaje(f.porcentaje!)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DialogoCompartir({ onCerrar, ...props }: Props & { onCerrar: () => void }) {
  const { evento, negocio } = props;
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
      const archivo = new File([await pdf(props)], await nombreArchivo(evento.nombre), { type: "application/pdf" });
      await navigator.share({ files: [archivo], title: `${titulo} · ${evento.nombre}` });
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
          <DialogDescription>Solo se comparten nombres, kilos y porcentaje perdido.</DialogDescription>
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
            window.open(enlaceWhatsapp(numero, `${titulo} del reto «${evento.nombre}» de ${negocio.nombre}: ${enlace}`), "_blank", "noopener");
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

/** Mensaje personal para cada participante: posición, kilos y porcentaje (uno por uno, con su celular). */
function DialogoMensajes({ onCerrar, evento, negocio, participantes, filas }: Props & { onCerrar: () => void }) {
  const [enviados, setEnviados] = useState<Set<number>>(new Set());
  const telefonos = new Map(participantes.map((p) => [p.id, p.telefono]));
  const enlace = typeof window === "undefined" ? "" : `${window.location.origin}/eventos/${evento.tokenPublico}`;

  const mensaje = (f: FilaPosicion) => {
    const nombre = f.nombre.split(" ")[0];
    const resultado =
      f.posicion === null
        ? "No llegaste a registrar tu pesaje final, pero gracias por ser parte."
        : `Quedaste en el puesto ${f.posicion} con ${textoKilos(f.kilos!)} perdidos (${textoPorcentaje(f.porcentaje!)} de tu peso inicial).`;
    return `¡Hola ${nombre}! Terminó el reto «${evento.nombre}» de ${negocio.nombre}. ${resultado} ¡Gracias por participar! Resultados: ${enlace}`;
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onCerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">Resultado a cada participante</DialogTitle>
          <DialogDescription>Se abre WhatsApp con el mensaje listo para cada persona; tú lo envías.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y rounded-2xl border">
          {filas.map((f) => {
            const numero = telefonoWhatsapp(telefonos.get(f.participanteId) ?? "", negocio.codigoPais);
            return (
              <li key={f.participanteId} className="flex items-center gap-3 px-3 py-2.5">
                <span className="cifras w-6 text-center font-bold">{f.posicion ?? "—"}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.nombre}</span>
                <Button
                  size="sm"
                  variant={enviados.has(f.participanteId) ? "ghost" : "outline"}
                  disabled={!numero}
                  onClick={() => {
                    window.open(enlaceWhatsapp(numero!, mensaje(f)), "_blank", "noopener");
                    setEnviados((s) => new Set(s).add(f.participanteId));
                  }}
                >
                  <MessageCircle className="size-4 text-whatsapp" /> {enviados.has(f.participanteId) ? "Abierto" : "Enviar"}
                </Button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
