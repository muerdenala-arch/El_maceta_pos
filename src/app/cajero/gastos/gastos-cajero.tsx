"use client";

/* eslint-disable @next/next/no-img-element -- foto propia del comprobante */
import { Receipt, ReceiptText } from "lucide-react";
import { useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { SubirImagen } from "@/components/formularios/subir-imagen";
import { useAccion } from "@/components/formularios/use-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sumar } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { COMPRESION_PRODUCTO } from "@/lib/imagen-cliente";
import { cn } from "@/lib/utils";
import { nuevoUuid } from "@/lib/uuid";
import { CATEGORIAS_GASTO } from "@/lib/validaciones/caja";
import { registrarGasto } from "../acciones";

type Gasto = {
  id: number;
  categoria: string;
  monto: string;
  descripcion: string | null;
  fotoUrl: string | null;
  anulado: boolean;
  fecha: string;
};

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function GastosCajero({ gastos }: { gastos: Gasto[] }) {
  const [uuid, setUuid] = useState(nuevoUuid);
  const [categoria, setCategoria] = useState<string>("");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const guardar = useAccion(registrarGasto, {
    mensajeExito: "Gasto registrado",
    alExito: () => {
      setUuid(nuevoUuid());
      setCategoria("");
      setMonto("");
      setDescripcion("");
      setFotoUrl(null);
    },
  });
  const vigentes = gastos.filter((g) => !g.anulado);
  const total = vigentes.length ? sumar(...vigentes.map((g) => g.monto)) : "0";

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <EncabezadoPagina icono={ReceiptText} titulo="Gastos" descripcion="Se descuentan del efectivo esperado al cerrar la caja" />
        <form
          className="space-y-5 rounded-3xl border bg-card p-5 shadow-sm sm:p-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            guardar.ejecutar({ uuid, categoria: categoria as never, monto: monto.replace(",", "."), descripcion, fotoUrl });
          }}
        >
          <Campo etiqueta="Categoría" error={guardar.campos.categoria}>
            {(p) => (
              <div {...p} role="radiogroup" className="flex flex-wrap gap-2">
                {CATEGORIAS_GASTO.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={categoria === c}
                    onClick={() => {
                      setCategoria(c);
                      guardar.limpiarCampo("categoria");
                    }}
                    className={cn(
                      "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                      categoria === c ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent",
                    )}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </Campo>
          <Campo etiqueta="Monto" error={guardar.campos.monto}>
            {(p) => (
              <div className="flex max-w-60 items-center rounded-2xl border bg-background px-4 focus-within:ring-3 focus-within:ring-ring/50">
                <span className="font-display text-lg font-bold text-muted-foreground">Bs</span>
                <input
                  {...p}
                  value={monto}
                  onChange={(e) => {
                    setMonto(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10));
                    guardar.limpiarCampo("monto");
                  }}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="cifras h-12 w-full bg-transparent px-2 font-display text-2xl font-extrabold outline-none"
                />
              </div>
            )}
          </Campo>
          <Campo etiqueta="Descripción" opcional error={guardar.campos.descripcion}>
            {(p) => <Textarea {...p} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} maxLength={300} placeholder="Ej. taxi para llevar mercadería" />}
          </Campo>
          <Campo etiqueta="Foto del comprobante" opcional error={guardar.campos.fotoUrl}>
            {() => <SubirImagen valor={fotoUrl} onCambiar={setFotoUrl} carpeta="gastos" compresion={COMPRESION_PRODUCTO} etiqueta="Foto" />}
          </Campo>
          <Button type="submit" size="lg" disabled={guardar.pendiente} className="h-12 w-full rounded-2xl font-bold sm:w-auto sm:px-10">
            {guardar.pendiente ? "Guardando…" : "Registrar gasto"}
          </Button>
        </form>
      </div>

      <aside className="space-y-3 lg:pt-20">
        <div className="flex items-baseline justify-between rounded-3xl bg-ficha-rosa p-5 text-ficha-rosa-foreground">
          <span className="font-bold">Gastos del turno</span>
          <span className="cifras font-display text-2xl font-extrabold">{formatoBs(total)}</span>
        </div>
        <ul className="space-y-2">
          {gastos.map((g) => (
            <li key={g.id} className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3", g.anulado && "opacity-50")}>
              {g.fotoUrl ? (
                <a href={g.fotoUrl} target="_blank" rel="noreferrer" className="size-11 shrink-0 overflow-hidden rounded-xl">
                  <img src={g.fotoUrl} alt="Comprobante" className="size-full object-cover" />
                </a>
              ) : (
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Receipt className="size-5 text-muted-foreground" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-semibold">
                  {g.categoria} {g.anulado && <Badge variant="destructive">Anulado</Badge>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {hora(g.fecha)}
                  {g.descripcion && ` · ${g.descripcion}`}
                </p>
              </div>
              <span className={cn("cifras font-display font-extrabold", g.anulado && "line-through")}>{formatoBs(g.monto)}</span>
            </li>
          ))}
          {gastos.length === 0 && <li className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Sin gastos en este turno.</li>}
        </ul>
      </aside>
    </div>
  );
}
