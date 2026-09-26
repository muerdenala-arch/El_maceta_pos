"use client";

import { Banknote, LockOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAccion } from "@/components/formularios/use-accion";
import { Button } from "@/components/ui/button";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { abrirCaja } from "../acciones";

const RAPIDOS = ["0", "100", "200", "300", "500"];

export function FormularioApertura({ nombre, sucursal }: { nombre: string; sucursal: string }) {
  const router = useRouter();
  const [monto, setMonto] = useState("");
  const abrir = useAccion(abrirCaja, {
    mensajeExito: "Caja abierta. ¡Buenas ventas!",
    alExito: () => router.replace("/cajero/venta"),
  });

  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-4 text-center sm:pt-10">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-ficha-naranja text-ficha-naranja-foreground">
        <Banknote className="size-8" />
      </span>
      <h1 className="mt-5 text-3xl font-extrabold">Abrir caja</h1>
      <p className="mt-1 text-muted-foreground">
        Hola {nombre.split(" ")[0]} · {sucursal}
      </p>

      <form
        className="mt-8 w-full rounded-3xl border bg-card p-6 text-left shadow-sm"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          abrir.ejecutar({ montoInicial: monto || "0" });
        }}
      >
        <label htmlFor="monto-inicial" className="font-semibold">
          Efectivo inicial en caja
        </label>
        <p className="text-sm text-muted-foreground">Cuenta el cambio con el que empiezas el turno.</p>
        <div className="mt-3 flex items-center rounded-2xl border bg-background px-4 focus-within:ring-3 focus-within:ring-ring/50">
          <span className="font-display text-2xl font-bold text-muted-foreground">Bs</span>
          <input
            id="monto-inicial"
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
            inputMode="decimal"
            placeholder="0,00"
            autoFocus
            aria-invalid={abrir.campos.montoInicial ? true : undefined}
            className="cifras h-16 w-full bg-transparent px-3 font-display text-4xl font-extrabold outline-none"
          />
        </div>
        {abrir.campos.montoInicial && <p className="mt-1 text-sm text-destructive">{abrir.campos.montoInicial}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {RAPIDOS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setMonto(r)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
                monto === r ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent",
              )}
            >
              {formatoBs(r)}
            </button>
          ))}
        </div>
        <Button type="submit" size="lg" disabled={abrir.pendiente} className="mt-6 h-14 w-full rounded-2xl text-lg font-bold">
          <LockOpen className="size-5" />
          {abrir.pendiente ? "Abriendo…" : "Abrir caja"}
        </Button>
      </form>
    </div>
  );
}
