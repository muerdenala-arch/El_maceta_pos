"use client";

import { AlertTriangle, CheckCircle2, ClipboardCheck, Lock } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
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
import { Button } from "@/components/ui/button";
import { diferenciaCierre, type ResumenCierre } from "@/lib/caja/calculos";
import { aCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { baseLocal } from "@/lib/offline/base";
import { etiquetaOperacion, sincronizarAhora, useOperacionesConError, usePendientes } from "@/lib/offline/sincronizar";
import { cerrarCaja, type CierreRealizado } from "../acciones";

type Venta = { id: number; numero: number; total: string; metodoPago: "efectivo" | "qr"; estado: string; fecha: string };

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function CierreCaja({
  apertura,
  resumen,
  ventas,
}: {
  apertura: string;
  resumen: ResumenCierre & { cantidadVentas: number };
  ventas: Venta[];
}) {
  const [contado, setContado] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [cerrada, setCerrada] = useState<CierreRealizado | null>(null);
  // El cierre requiere haber sincronizado todo (sección 8.7 del plan) y conexión.
  const { pendientes } = usePendientes();
  const enLinea = useSyncExternalStore(suscribirConexion, () => navigator.onLine, () => true);
  const cerrar = useAccion(cerrarCaja, { alExito: (r) => setCerrada(r) });

  const contadoValido = /^\d+([.,]\d{1,2})?$/.test(contado);
  const diferencia = contadoValido ? diferenciaCierre(resumen.esperado, contado.replace(",", ".")) : null;

  if (cerrada) return <Resultado cierre={cerrada} />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <EncabezadoPagina icono={ClipboardCheck} titulo="Cierre de caja" descripcion={`Turno abierto a las ${hora(apertura)} · ${resumen.cantidadVentas} venta${resumen.cantidadVentas === 1 ? "" : "s"}`} />

      <section className="space-y-2 rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <Fila etiqueta="Efectivo inicial" valor={resumen.montoInicial} />
        <Fila etiqueta="+ Ventas en efectivo" valor={resumen.ventasEfectivo} />
        <Fila etiqueta="− Gastos" valor={resumen.gastos} negativo />
        <div className="flex items-baseline justify-between border-t pt-3">
          <span className="text-lg font-extrabold">Efectivo esperado</span>
          <span className="cifras font-display text-3xl font-extrabold">{formatoBs(resumen.esperado)}</span>
        </div>
        <p className="flex justify-between pt-1 text-sm text-muted-foreground">
          <span>Ventas por QR (no entran en el efectivo)</span>
          <span className="cifras font-semibold">{formatoBs(resumen.ventasQr)}</span>
        </p>
      </section>

      <section className="space-y-3 rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
        <label htmlFor="contado" className="text-lg font-extrabold">
          ¿Cuánto efectivo contaste?
        </label>
        <div className="flex items-center rounded-2xl border bg-background px-4 focus-within:ring-3 focus-within:ring-ring/50">
          <span className="font-display text-xl font-bold text-muted-foreground">Bs</span>
          <input
            id="contado"
            value={contado}
            onChange={(e) => setContado(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
            inputMode="decimal"
            placeholder="0,00"
            className="cifras h-16 w-full bg-transparent px-3 font-display text-4xl font-extrabold outline-none"
          />
        </div>
        {diferencia !== null && <IndicadorDiferencia diferencia={diferencia} />}
        <EstadoSincronizacion />
        <Button
          size="lg"
          className="h-14 w-full rounded-2xl text-lg font-bold"
          disabled={!contadoValido || cerrar.pendiente || pendientes > 0 || !enLinea}
          onClick={() => setConfirmar(true)}
        >
          <Lock className="size-5" /> Cerrar caja
        </Button>
      </section>

      {ventas.length > 0 && (
        <details className="rounded-3xl border bg-card p-5 shadow-sm">
          <summary className="cursor-pointer font-bold">Ventas del turno ({ventas.length})</summary>
          <ul className="mt-3 divide-y text-sm">
            {ventas.map((v) => (
              <li key={v.id} className="flex items-center gap-3 py-2">
                <span className="cifras w-14 font-mono text-muted-foreground">#{v.numero}</span>
                <span className="text-muted-foreground">{hora(v.fecha)}</span>
                <span className="rounded-full bg-muted px-2 text-xs font-semibold">{v.metodoPago === "qr" ? "QR" : "Efectivo"}</span>
                <span className="cifras ml-auto font-bold">{formatoBs(v.total)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar la caja con {contadoValido ? formatoBs(contado.replace(",", ".")) : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              Una vez cerrada no se puede modificar.
              {diferencia && aCentavos(diferencia) !== 0n && " La diferencia se informará al administrador."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver a contar</AlertDialogCancel>
            <AlertDialogAction onClick={() => cerrar.ejecutar({ efectivoContado: contado.replace(",", ".") })}>Sí, cerrar caja</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function suscribirConexion(avisar: () => void) {
  window.addEventListener("online", avisar);
  window.addEventListener("offline", avisar);
  return () => {
    window.removeEventListener("online", avisar);
    window.removeEventListener("offline", avisar);
  };
}

/** Pendientes y rechazos de la cola sin conexión, con opción de sincronizar o descartar. */
function EstadoSincronizacion() {
  const { pendientes } = usePendientes();
  const conError = useOperacionesConError();
  const [enviando, setEnviando] = useState(false);
  const enLinea = useSyncExternalStore(suscribirConexion, () => navigator.onLine, () => true);
  if (pendientes === 0 && conError.length === 0 && enLinea) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-aviso/50 bg-aviso/10 p-4 text-sm">
      {!enLinea && <p className="font-semibold">Sin conexión: el cierre de caja necesita internet.</p>}
      {pendientes > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 font-semibold">
            Hay {pendientes} operación{pendientes === 1 ? "" : "es"} sin sincronizar. Envíalas antes de cerrar.
          </p>
          <Button
            size="sm"
            disabled={!enLinea || enviando}
            onClick={async () => {
              setEnviando(true);
              await sincronizarAhora().catch(() => {});
              setEnviando(false);
            }}
          >
            {enviando ? "Enviando…" : "Sincronizar ahora"}
          </Button>
        </div>
      )}
      {conError.length > 0 && (
        <div className="space-y-2">
          <p className="font-semibold text-destructive">Rechazadas por el servidor (avisa al administrador):</p>
          <ul className="space-y-1.5">
            {conError.map((o) => (
              <li key={o.uuid} className="flex items-center gap-2 rounded-xl bg-card p-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{etiquetaOperacion(o)}</span>
                  <span className="block text-xs text-muted-foreground">{o.error}</span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm("¿Descartar esta operación de este dispositivo? No se registrará en el sistema.")) {
                      baseLocal().cola.delete(o.uuid).catch(() => {});
                    }
                  }}
                >
                  Descartar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Fila({ etiqueta, valor, negativo }: { etiqueta: string; valor: string; negativo?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted-foreground">{etiqueta}</span>
      <span className={cn("cifras font-display text-lg font-bold", negativo && "text-destructive")}>
        {negativo && aCentavos(valor) > 0n ? "−" : ""}
        {formatoBs(valor)}
      </span>
    </div>
  );
}

function IndicadorDiferencia({ diferencia }: { diferencia: string }) {
  const c = aCentavos(diferencia);
  return (
    <div
      aria-live="polite"
      className={cn(
        "flex items-center justify-between rounded-2xl p-4 font-bold",
        c === 0n ? "bg-ficha-verde text-ficha-verde-foreground" : "bg-destructive/15 text-destructive",
      )}
    >
      <span className="flex items-center gap-2">
        {c === 0n ? <CheckCircle2 className="size-5" /> : <AlertTriangle className="size-5" />}
        {c === 0n ? "Cuadra exacto" : c < 0n ? "Faltante" : "Sobrante"}
      </span>
      <span className="cifras font-display text-2xl font-extrabold">{formatoBs(diferencia.replace("-", ""))}</span>
    </div>
  );
}

function Resultado({ cierre }: { cierre: CierreRealizado }) {
  const cuadra = aCentavos(cierre.diferencia) === 0n;
  return (
    <div className="mx-auto flex max-w-md flex-col items-center pt-10 text-center">
      <span className={cn("flex size-20 items-center justify-center rounded-full", cuadra ? "bg-exito text-exito-foreground" : "bg-aviso text-aviso-foreground")}>
        {cuadra ? <CheckCircle2 className="size-10" /> : <AlertTriangle className="size-10" />}
      </span>
      <h1 className="mt-5 text-3xl font-extrabold">Caja cerrada</h1>
      <div className="mt-6 w-full space-y-2 rounded-3xl border bg-card p-6 text-left shadow-sm">
        <Fila etiqueta="Esperado" valor={cierre.esperado} />
        <Fila etiqueta="Contado" valor={cierre.contado} />
        <IndicadorDiferencia diferencia={cierre.diferencia} />
      </div>
      {!cuadra && <p className="mt-3 text-sm text-muted-foreground">Se avisó al administrador de la diferencia.</p>}
      <Button asChild size="lg" variant="outline" className="mt-6 h-12 w-full rounded-2xl">
        <Link href="/cajero/apertura">Abrir un nuevo turno</Link>
      </Button>
    </div>
  );
}
