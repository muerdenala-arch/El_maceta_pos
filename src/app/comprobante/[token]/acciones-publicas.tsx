"use client";

import { Download, Loader2, Printer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cargarGeneradorPdf } from "@/lib/comprobante/cargar-pdf";
import { nombreArchivo, type DatosComprobante } from "@/lib/comprobante/datos";

/** Para el cliente: descargar el PDF (hoja carta) o imprimir la página. */
export function AccionesPublicas({ datos }: { datos: DatosComprobante }) {
  const [generando, setGenerando] = useState(false);

  async function descargar() {
    setGenerando(true);
    try {
      const { generarPdf } = await cargarGeneradorPdf();
      const url = URL.createObjectURL(await generarPdf(datos, "carta"));
      Object.assign(document.createElement("a"), { href: url, download: nombreArchivo(datos) }).click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch {
      toast.error("No se pudo generar el PDF");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-3 print:hidden">
      <Button size="lg" className="h-12 rounded-2xl font-bold" disabled={generando} onClick={descargar}>
        {generando ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />} Descargar PDF
      </Button>
      <Button size="lg" variant="outline" className="h-12 rounded-2xl font-bold" onClick={() => window.print()}>
        <Printer className="size-5" /> Imprimir
      </Button>
    </div>
  );
}
