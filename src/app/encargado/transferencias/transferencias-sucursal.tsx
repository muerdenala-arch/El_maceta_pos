"use client";

import { ArrowRight, Check, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { useAccion } from "@/components/formularios/use-accion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { coincide } from "@/lib/busqueda";
import { recibirTransferencia } from "@/lib/inventario/acciones";
import type { Transferencia } from "@/lib/inventario/consultas";
import { cn } from "@/lib/utils";

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const estado = (t: Transferencia) => (t.estado === "enviada" ? "En camino" : t.estado === "recibida" ? "Recibida" : "Cancelada");

export function TransferenciasSucursal({ transferencias }: { transferencias: Transferencia[] }) {
  const [porRecibir, setPorRecibir] = useState<Transferencia | null>(null);
  const recibir = useAccion(recibirTransferencia, { mensajeExito: "Transferencia recibida: el stock ya está en tu sucursal", alExito: () => setPorRecibir(null) });
  const [busqueda, setBusqueda] = useState("");
  const visibles = transferencias.filter((t) => coincide(busqueda, [`T-${t.id}`, t.origen, t.envia, estado(t), t.nota, ...t.lineas.flatMap((l) => [l.producto, l.presentacion])]));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {transferencias.length > 0 && <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar transferencias" placeholder="Producto, estado o T-número" />}
        <Button variant="outline" className="ml-auto rounded-full" asChild>
          <Link href="/cajero/bodega">
            <Send className="size-4" /> Pedir reposición
          </Link>
        </Button>
      </div>

      {transferencias.length === 0 && <p className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Todavía no hay transferencias hacia tu sucursal.</p>}
      {transferencias.length > 0 && visibles.length === 0 && <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />}

      <ul className="grid gap-3 lg:grid-cols-2">
        {visibles.map((t) => (
          <li key={t.id} className={cn("flex flex-col rounded-3xl border bg-card p-4 shadow-sm", t.estado !== "enviada" && "opacity-75")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">T-{t.id}</span>
              <Badge variant={t.estado === "enviada" ? "default" : t.estado === "recibida" ? "secondary" : "destructive"}>{estado(t)}</Badge>
              <span className="ml-auto text-xs text-muted-foreground">
                {fechaCorta(t.enviadaEn)} · {t.envia}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-2 font-bold">
              <Resaltar texto={t.origen} consulta={busqueda} /> <ArrowRight className="size-4 text-primary" /> {t.destino}
            </p>
            <ul className="mt-2 space-y-0.5 text-sm">
              {t.lineas.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">
                    <Resaltar texto={l.producto} consulta={busqueda} />
                    {l.presentacion && <span className="text-muted-foreground"> · {l.presentacion}</span>}
                  </span>
                  <span className="cifras shrink-0 font-semibold">{l.texto}</span>
                </li>
              ))}
            </ul>
            {t.nota && <p className="mt-2 text-sm text-muted-foreground italic">{t.nota}</p>}
            {t.estado === "enviada" ? (
              <div className="mt-4 flex justify-end border-t pt-3">
                <Button size="sm" disabled={recibir.pendiente} onClick={() => setPorRecibir(t)}>
                  <Check className="size-4" /> Confirmar recepción
                </Button>
              </div>
            ) : (
              t.recibidaEn && (
                <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                  {t.estado === "recibida" ? "Recibida" : "Cancelada"} el {fechaCorta(t.recibidaEn)}
                  {t.recibe && ` por ${t.recibe}`}
                </p>
              )
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={!!porRecibir} onOpenChange={(v) => !v && setPorRecibir(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Llegó completa la transferencia T-{porRecibir?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              Al confirmar, estos productos entran al stock de tu sucursal y queda registrado con tu nombre. Si falta algo, no confirmes y avisa al administrador.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recibir.pendiente}>Todavía no</AlertDialogCancel>
            <AlertDialogAction
              disabled={recibir.pendiente}
              onClick={(e) => {
                e.preventDefault();
                if (porRecibir) recibir.ejecutar({ id: porRecibir.id });
              }}
            >
              {recibir.pendiente ? "Confirmando…" : "Sí, la recibí"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
