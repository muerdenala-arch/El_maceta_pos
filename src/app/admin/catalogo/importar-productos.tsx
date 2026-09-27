"use client";

import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useAccion } from "@/components/formularios/use-accion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatoBs } from "@/lib/formato";
import { importarProductos, type ResumenImportacion } from "./acciones";

/** Carga del catálogo desde Excel: planilla modelo → revisión con errores por fila → confirmación. */
export function ImportarProductos({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const entrada = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resumen, setResumen] = useState<ResumenImportacion | null>(null);

  const cerrar = () => {
    setArchivo(null);
    setResumen(null);
    onCerrar();
  };
  const revisar = useAccion(importarProductos, { alExito: setResumen });
  const aplicar = useAccion(importarProductos, {
    alExito: (r) => {
      if (!r.aplicado) return setResumen(r);
      toast.success(`${r.productos} producto${r.productos === 1 ? "" : "s"} importado${r.productos === 1 ? "" : "s"}`);
      cerrar();
    },
  });

  const formulario = (conAplicar: boolean) => {
    const f = new FormData();
    f.set("archivo", archivo!);
    if (conAplicar) f.set("aplicar", "1");
    return f;
  };

  const elegir = (a: File | undefined) => {
    if (!a) return;
    setArchivo(a);
    setResumen(null);
    const f = new FormData();
    f.set("archivo", a);
    revisar.ejecutar(f);
  };

  const listo = resumen && resumen.errores.length === 0 && resumen.productos > 0;

  return (
    <Dialog open={abierto} onOpenChange={(v) => !v && cerrar()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl font-extrabold">
            <FileSpreadsheet className="size-6 text-exito" /> Importar productos desde Excel
          </DialogTitle>
          <DialogDescription>Para cargar el catálogo de una vez, con su stock inicial en la bodega y en cada sucursal.</DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 p-4">
            <span className="text-sm">
              <strong>1.</strong> Descarga la planilla modelo y llénala (trae instrucciones).
            </span>
            <Button variant="outline" asChild>
              <a href="/api/admin/plantilla-productos" download>
                <Download className="size-4" /> Planilla modelo
              </a>
            </Button>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 p-4">
            <span className="min-w-0 text-sm">
              <strong>2.</strong> Elige la planilla llena: {archivo ? <span className="font-semibold break-all">{archivo.name}</span> : "se revisa antes de guardar."}
            </span>
            <input
              ref={entrada}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                elegir(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button disabled={revisar.pendiente || aplicar.pendiente} onClick={() => entrada.current?.click()}>
              {revisar.pendiente ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {archivo ? "Elegir otra" : "Elegir archivo"}
            </Button>
          </li>
        </ol>

        {resumen && resumen.errores.length > 0 && (
          <section className="space-y-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-4" aria-live="polite">
            <p className="flex items-center gap-2 font-bold text-destructive">
              <AlertTriangle className="size-5" />
              {resumen.errores.length} fila{resumen.errores.length === 1 ? "" : "s"} con errores: corrige la planilla y vuelve a elegirla
            </p>
            <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
              {resumen.errores.map((e) => (
                <li key={e.fila}>
                  <strong className="cifras">{e.fila ? `Fila ${e.fila}` : "Planilla"}:</strong> {e.mensajes.join(" · ")}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">No se guardó nada. Las filas sin errores se importarán junto con las corregidas.</p>
          </section>
        )}

        {resumen && resumen.productos === 0 && resumen.errores.length === 0 && (
          <p className="rounded-2xl bg-muted p-4 text-sm">La planilla no tiene productos para importar.</p>
        )}

        {listo && (
          <section className="space-y-3" aria-live="polite">
            <p className="flex items-center gap-2 font-bold text-exito">
              <CheckCircle2 className="size-5" />
              Todo en orden: {resumen.productos} producto{resumen.productos === 1 ? "" : "s"} · {resumen.unidades} unidades de stock inicial
            </p>
            {resumen.categoriasNuevas.length > 0 && (
              <p className="text-sm text-muted-foreground">Categorías nuevas: {resumen.categoriasNuevas.join(", ")}</p>
            )}
            <ul className="max-h-60 divide-y overflow-y-auto rounded-2xl border text-sm">
              {resumen.muestra.map((p) => (
                <li key={p.fila} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.nombre}</p>
                    {p.detalle && <p className="truncate text-xs text-muted-foreground">{p.detalle}</p>}
                  </div>
                  <span className="cifras text-muted-foreground">{p.stock} u.</span>
                  <span className="cifras font-bold">{formatoBs(p.precioVenta)}</span>
                </li>
              ))}
              {resumen.productos > resumen.muestra.length && (
                <li className="px-3 py-2 text-xs text-muted-foreground">y {resumen.productos - resumen.muestra.length} más…</li>
              )}
            </ul>
            <Button size="lg" className="h-12 w-full rounded-2xl font-bold" disabled={aplicar.pendiente} onClick={() => aplicar.ejecutar(formulario(true))}>
              {aplicar.pendiente ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
              Importar {resumen.productos} producto{resumen.productos === 1 ? "" : "s"}
            </Button>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
