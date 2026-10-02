"use client";

import { Ban, ChevronDown, ChevronLeft, ChevronRight, HandCoins, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import { TarjetaEstadistica } from "@/components/panel/tarjeta-estadistica";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NOMBRES_ROL } from "@/lib/auth/constantes";
import { coincide } from "@/lib/busqueda";
import { aCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { NOMBRES_MOVIMIENTO, nombrePeriodo, periodoVecino, totalesPlanilla, type TipoMovimiento } from "@/lib/sueldos/calculo";
import type { FilaPlanilla, MovimientoSueldo } from "@/lib/sueldos/consultas";
import { cn } from "@/lib/utils";
import { Banknote, CircleDollarSign, Wallet } from "lucide-react";
import { anularMovimientoSueldo, guardarSueldo, registrarMovimientoSueldo } from "./acciones";

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

type Dialogo =
  | { tipo: "sueldo"; fila: FilaPlanilla }
  | { tipo: "movimiento"; fila: FilaPlanilla; movimiento: TipoMovimiento }
  | { tipo: "anular"; fila: FilaPlanilla; movimiento: MovimientoSueldo };

/** Planilla de un mes: una tarjeta por persona con su sueldo, lo entregado y lo que falta pagarle. */
export function Sueldos({ periodo, actual, tope, filas }: { periodo: string; actual: string; tope: string; filas: FilaPlanilla[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const visibles = filas.filter((f) => coincide(busqueda, [f.nombre, NOMBRES_ROL[f.rol], f.sucursal]));
  const t = totalesPlanilla(filas.map((f) => f.resumen));
  const siguiente = periodoVecino(periodo, 1);
  const titulo = nombrePeriodo(periodo);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina icono={HandCoins} titulo="Sueldos" descripcion="Sueldo mensual de cada persona, adelantos, descuentos, bonos y pagos" />

      <nav className="flex items-center gap-2" aria-label="Mes">
        <Button variant="outline" size="icon" className="rounded-full" asChild>
          <Link href={`/admin/sueldos?mes=${periodoVecino(periodo, -1)}`} replace scroll={false} aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <p className="min-w-44 text-center font-display text-lg font-extrabold first-letter:uppercase">{titulo}</p>
        {siguiente <= tope ? (
          <Button variant="outline" size="icon" className="rounded-full" asChild>
            <Link href={`/admin/sueldos?mes=${siguiente}`} replace scroll={false} aria-label="Mes siguiente">
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        ) : (
          <Button variant="outline" size="icon" className="rounded-full" disabled aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Button>
        )}
        {periodo !== actual && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/admin/sueldos" replace scroll={false}>
              Mes actual
            </Link>
          </Button>
        )}
      </nav>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Totales del mes">
        <TarjetaEstadistica icono={CircleDollarSign} tono="naranja" valor={formatoBs(t.aPagar)} titulo="Total a pagar" detalle={`Sueldos ${formatoBs(t.sueldo)} + bonos ${formatoBs(t.bonos)} − descuentos ${formatoBs(t.descuentos)}`} />
        <TarjetaEstadistica icono={HandCoins} tono="rosa" valor={formatoBs(t.adelantos)} titulo="Adelantos" />
        <TarjetaEstadistica icono={Banknote} tono="verde" valor={formatoBs(t.pagos)} titulo="Pagado" />
        <TarjetaEstadistica icono={Wallet} tono="neutra" valor={formatoBs(t.saldo)} titulo="Falta pagar" />
      </section>

      {filas.length > 0 && <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar personal" placeholder="Nombre, rol o sucursal" />}
      {filas.length === 0 && <p className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Todavía no hay personal registrado.</p>}
      {filas.length > 0 && visibles.length === 0 && <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />}

      <ul className="space-y-3">
        {visibles.map((f) => {
          const r = f.resumen;
          const saldo = aCentavos(r.saldo);
          const abierto = abiertos.has(f.usuarioId);
          const vigentes = f.movimientos.filter((m) => !m.anulado).length;
          return (
            <li key={f.usuarioId} className={cn("rounded-3xl border bg-card p-4 shadow-sm sm:p-5", !f.activo && "opacity-70")}>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                    <Resaltar texto={f.nombre} consulta={busqueda} />
                    {!f.activo && <Badge variant="secondary">Inactivo</Badge>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <Resaltar texto={[NOMBRES_ROL[f.rol], f.sucursal].filter(Boolean).join(" · ")} consulta={busqueda} />
                  </p>
                  <p className="mt-2 flex items-center gap-1 text-sm">
                    <span className="text-muted-foreground">Sueldo del mes:</span>
                    <strong className="cifras">{formatoBs(r.sueldo)}</strong>
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Editar sueldo de ${f.nombre}`} onClick={() => setDialogo({ tipo: "sueldo", fila: f })}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  <Dato titulo="Bonos" valor={r.bonos} signo="+" />
                  <Dato titulo="Descuentos" valor={r.descuentos} signo="−" />
                  <Dato titulo="Adelantos" valor={r.adelantos} signo="−" />
                  <Dato titulo="Pagado" valor={r.pagos} signo="−" />
                </dl>

                <div className="text-right">
                  <p className="text-xs font-bold text-muted-foreground uppercase">{saldo < 0n ? "Entregado de más" : saldo === 0n && aCentavos(r.aPagar) > 0n ? "Pagado" : "Falta pagar"}</p>
                  <p className={cn("cifras font-display text-2xl font-extrabold", saldo < 0n && "text-destructive", saldo === 0n && aCentavos(r.aPagar) > 0n && "text-exito")}>
                    {formatoBs(r.saldo.replace("-", ""))}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: "movimiento", fila: f, movimiento: "adelanto" })}>
                  Adelanto
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: "movimiento", fila: f, movimiento: "descuento" })}>
                  Descuento
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDialogo({ tipo: "movimiento", fila: f, movimiento: "bono" })}>
                  Bono
                </Button>
                <Button size="sm" className="font-bold" disabled={saldo <= 0n} onClick={() => setDialogo({ tipo: "movimiento", fila: f, movimiento: "pago" })}>
                  Pagar
                </Button>
                {f.movimientos.length > 0 && (
                  <button
                    type="button"
                    aria-expanded={abierto}
                    onClick={() => setAbiertos((s) => new Set(abierto ? [...s].filter((id) => id !== f.usuarioId) : [...s, f.usuarioId]))}
                    className="ml-auto flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {vigentes} movimiento{vigentes === 1 ? "" : "s"} <ChevronDown className={cn("size-4 transition-transform", abierto && "rotate-180")} />
                  </button>
                )}
              </div>

              {abierto && (
                <ul className="mt-3 space-y-1.5">
                  {f.movimientos.map((m) => (
                    <li key={m.id} className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-muted/60 px-3 py-2 text-sm", m.anulado && "opacity-60")}>
                      <span className="font-bold">{NOMBRES_MOVIMIENTO[m.tipo]}</span>
                      {m.anulado && <Badge variant="destructive">Anulado</Badge>}
                      <span className="min-w-0 flex-1 basis-40 text-muted-foreground">
                        {fechaCorta(m.fecha)} · {m.registradoPor}
                        {m.nota && ` · ${m.nota}`}
                        {m.anulado && m.motivoAnulacion && ` · Motivo: ${m.motivoAnulacion}`}
                      </span>
                      <span className={cn("cifras font-display font-extrabold", m.anulado && "line-through")}>{formatoBs(m.monto)}</span>
                      {!m.anulado && (
                        <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDialogo({ tipo: "anular", fila: f, movimiento: m })}>
                          <Ban className="size-4" /> Anular
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {dialogo?.tipo === "sueldo" && <DialogoSueldo fila={dialogo.fila} periodo={periodo} mes={titulo} onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === "movimiento" && <DialogoMovimiento fila={dialogo.fila} tipo={dialogo.movimiento} periodo={periodo} mes={titulo} onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === "anular" && <DialogoAnular fila={dialogo.fila} movimiento={dialogo.movimiento} onCerrar={() => setDialogo(null)} />}
    </div>
  );
}

function Dato({ titulo, valor, signo }: { titulo: string; valor: string; signo: string }) {
  const hay = aCentavos(valor) > 0n;
  return (
    <div>
      <dt className="text-xs font-bold text-muted-foreground uppercase">{titulo}</dt>
      <dd className={cn("cifras font-semibold", !hay && "text-muted-foreground")}>{hay ? `${signo}${formatoBs(valor)}` : "—"}</dd>
    </div>
  );
}

const soloMonto = (v: string) => v.replace(/[^\d.,]/g, "").slice(0, 12);

function DialogoSueldo({ fila, periodo, mes, onCerrar }: { fila: FilaPlanilla; periodo: string; mes: string; onCerrar: () => void }) {
  const [monto, setMonto] = useState(aCentavos(fila.resumen.sueldo) > 0n ? fila.resumen.sueldo : "");
  const guardar = useAccion(guardarSueldo, { mensajeExito: "Sueldo guardado", alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Sueldo de ${fila.nombre}`}
      descripcion={`Vale para ${mes} y los meses siguientes. Los meses anteriores no cambian.`}
      pendiente={guardar.pendiente}
      onGuardar={() => guardar.ejecutar({ usuarioId: fila.usuarioId, periodo, monto: monto.replace(",", ".") })}
    >
      <Campo etiqueta="Sueldo mensual (Bs)" error={guardar.campos.monto}>
        {(p) => <Input {...p} value={monto} onChange={(e) => setMonto(soloMonto(e.target.value))} inputMode="decimal" autoFocus placeholder="0,00" className="cifras text-lg font-bold" />}
      </Campo>
    </DialogoFormulario>
  );
}

const AYUDA: Record<TipoMovimiento, string> = {
  adelanto: "Dinero que se le entrega antes del pago: se resta de lo que falta pagarle.",
  descuento: "Se resta del sueldo de este mes (faltas, daños, préstamos…). El motivo es obligatorio.",
  bono: "Se suma al sueldo de este mes (comisión, horas extra, premio…).",
  pago: "Pago del sueldo. Por defecto, todo lo que falta pagarle este mes.",
};

function DialogoMovimiento({ fila, tipo, periodo, mes, onCerrar }: { fila: FilaPlanilla; tipo: TipoMovimiento; periodo: string; mes: string; onCerrar: () => void }) {
  const [monto, setMonto] = useState(tipo === "pago" ? fila.resumen.saldo : "");
  const [nota, setNota] = useState("");
  const guardar = useAccion(registrarMovimientoSueldo, { mensajeExito: `${NOMBRES_MOVIMIENTO[tipo]} registrado`, alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`${NOMBRES_MOVIMIENTO[tipo]} · ${fila.nombre}`}
      descripcion={`${AYUDA[tipo]} Mes: ${mes}.`}
      pendiente={guardar.pendiente}
      textoGuardar="Registrar"
      onGuardar={() => guardar.ejecutar({ usuarioId: fila.usuarioId, periodo, tipo, monto: monto.replace(",", "."), nota })}
    >
      <Campo etiqueta="Monto (Bs)" error={guardar.campos.monto}>
        {(p) => <Input {...p} value={monto} onChange={(e) => setMonto(soloMonto(e.target.value))} inputMode="decimal" autoFocus placeholder="0,00" className="cifras text-lg font-bold" />}
      </Campo>
      <Campo etiqueta={tipo === "descuento" ? "Motivo" : "Nota"} opcional={tipo !== "descuento"} error={guardar.campos.nota}>
        {(p) => <Textarea {...p} value={nota} onChange={(e) => setNota(e.target.value)} rows={2} maxLength={300} />}
      </Campo>
    </DialogoFormulario>
  );
}

function DialogoAnular({ fila, movimiento, onCerrar }: { fila: FilaPlanilla; movimiento: MovimientoSueldo; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const anular = useAccion(anularMovimientoSueldo, { mensajeExito: "Movimiento anulado", alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Anular movimiento"
      descripcion={`${NOMBRES_MOVIMIENTO[movimiento.tipo]} de ${formatoBs(movimiento.monto)} a ${fila.nombre}. Queda registrado como anulado (no se borra).`}
      pendiente={anular.pendiente}
      textoGuardar="Anular"
      onGuardar={() => anular.ejecutar({ id: movimiento.id, motivo })}
    >
      <Campo etiqueta="Motivo" error={anular.campos.motivo}>
        {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} autoFocus />}
      </Campo>
    </DialogoFormulario>
  );
}
