"use client";

import { Ban, Banknote, CalendarClock, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, HandCoins, History, Pencil, UserMinus, UserPlus, Wallet } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { NOMBRES_ROL } from "@/lib/auth/constantes";
import { coincide } from "@/lib/busqueda";
import { aCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { antiguedad, fechaCortaDia, NOMBRES_MOVIMIENTO, nombrePeriodo, periodoVecino, proximoPago, totalesPlanilla, type TipoMovimiento } from "@/lib/sueldos/calculo";
import type { FilaPlanilla, MovimientoSueldo } from "@/lib/sueldos/consultas";
import { cn } from "@/lib/utils";
import { anularMovimientoSueldo, darDeBajaTrabajador, guardarSueldo, guardarTrabajador, registrarMovimientoSueldo, reincorporarTrabajador } from "./acciones";

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

type Sucursal = { id: number; nombre: string };
type Dialogo =
  | { tipo: "trabajador"; fila: FilaPlanilla | null }
  | { tipo: "sueldo"; fila: FilaPlanilla }
  | { tipo: "movimiento"; fila: FilaPlanilla; movimiento: TipoMovimiento }
  | { tipo: "anular"; fila: FilaPlanilla; movimiento: MovimientoSueldo }
  | { tipo: "baja"; fila: FilaPlanilla }
  | { tipo: "reincorporar"; fila: FilaPlanilla };

const NOMBRES_EVENTO = { ingreso: "Entró a trabajar", baja: "Baja", reincorporacion: "Volvió a trabajar" } as const;

/** Lo que se muestra debajo del nombre: cargo (o rol de su usuario) y sucursal. */
const puesto = (f: FilaPlanilla) => [f.cargo ?? (f.rol ? NOMBRES_ROL[f.rol] : null), f.sucursal].filter(Boolean).join(" · ");

/** Planilla de un mes: una tarjeta por trabajador con su sueldo, lo entregado, lo que falta pagarle y su historial. */
export function Sueldos({
  periodo,
  actual,
  tope,
  hoy,
  conBajas,
  filas,
  sucursales,
}: {
  periodo: string;
  actual: string;
  tope: string;
  hoy: string;
  conBajas: boolean;
  filas: FilaPlanilla[];
  sucursales: Sucursal[];
}) {
  const [busqueda, setBusqueda] = useState("");
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const visibles = filas.filter((f) => coincide(busqueda, [f.nombre, f.cargo, f.rol ? NOMBRES_ROL[f.rol] : null, f.sucursal, f.fechaBaja ? "Baja" : null]));
  const t = totalesPlanilla(filas.filter((f) => !f.fechaBaja || f.movimientos.length > 0).map((f) => f.resumen));
  const siguiente = periodoVecino(periodo, 1);
  const titulo = nombrePeriodo(periodo);
  const enlace = (mes: string, bajas = conBajas) => `/admin/sueldos?mes=${mes}${bajas ? "&bajas=1" : ""}`;
  const alternar = (clave: string) => setAbiertos((s) => new Set(s.has(clave) ? [...s].filter((c) => c !== clave) : [...s, clave]));
  const cerrar = () => setDialogo(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina icono={HandCoins} titulo="Sueldos" descripcion="Trabajadores, desde cuándo trabajan, sueldo, adelantos, descuentos, bonos y pagos">
        <Button size="lg" className="rounded-full font-bold" onClick={() => setDialogo({ tipo: "trabajador", fila: null })}>
          <UserPlus className="size-5" /> Nuevo trabajador
        </Button>
      </EncabezadoPagina>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav className="flex items-center gap-2" aria-label="Mes">
          <Button variant="outline" size="icon" className="rounded-full" asChild>
            <Link href={enlace(periodoVecino(periodo, -1))} replace scroll={false} aria-label="Mes anterior">
              <ChevronLeft className="size-4" />
            </Link>
          </Button>
          <p className="min-w-44 text-center font-display text-lg font-extrabold first-letter:uppercase">{titulo}</p>
          {siguiente <= tope ? (
            <Button variant="outline" size="icon" className="rounded-full" asChild>
              <Link href={enlace(siguiente)} replace scroll={false} aria-label="Mes siguiente">
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
              <Link href={enlace(actual)} replace scroll={false}>
                Mes actual
              </Link>
            </Button>
          )}
        </nav>
        <Button variant={conBajas ? "secondary" : "ghost"} size="sm" className="ml-auto" asChild>
          <Link href={enlace(periodo, !conBajas)} replace scroll={false} aria-pressed={conBajas}>
            <UserMinus className="size-4" /> {conBajas ? "Ocultar dados de baja" : "Ver dados de baja"}
          </Link>
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" aria-label="Totales del mes">
        <TarjetaEstadistica icono={CircleDollarSign} tono="naranja" valor={formatoBs(t.aPagar)} titulo="Total a pagar" detalle={`Sueldos ${formatoBs(t.sueldo)} + bonos ${formatoBs(t.bonos)} − descuentos ${formatoBs(t.descuentos)}`} />
        <TarjetaEstadistica icono={HandCoins} tono="rosa" valor={formatoBs(t.adelantos)} titulo="Adelantos" />
        <TarjetaEstadistica icono={Banknote} tono="verde" valor={formatoBs(t.pagos)} titulo="Pagado" />
        <TarjetaEstadistica icono={Wallet} tono="neutra" valor={formatoBs(t.saldo)} titulo="Falta pagar" />
      </section>

      {filas.length > 0 && <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar trabajadores" placeholder="Nombre, cargo o sucursal" />}
      {filas.length === 0 && <p className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Todavía no hay trabajadores. Agrega el primero con “Nuevo trabajador”.</p>}
      {filas.length > 0 && visibles.length === 0 && <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />}

      <ul className="space-y-3">
        {visibles.map((f) => {
          const r = f.resumen;
          const saldo = aCentavos(r.saldo);
          const deBaja = f.fechaBaja !== null;
          const verMovimientos = abiertos.has(`m${f.empleadoId}`);
          const verHistorial = abiertos.has(`h${f.empleadoId}`);
          const vigentes = f.movimientos.filter((m) => !m.anulado).length;
          const pago = f.fechaIngreso && !deBaja ? proximoPago(f.fechaIngreso, hoy) : null;
          return (
            <li key={f.empleadoId} className={cn("rounded-3xl border bg-card p-4 shadow-sm sm:p-5", deBaja && "border-destructive/30")}>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                    <Resaltar texto={f.nombre} consulta={busqueda} />
                    {deBaja && <Badge variant="destructive">De baja</Badge>}
                    <Button variant="ghost" size="icon" className="size-8" aria-label={`Editar datos de ${f.nombre}`} onClick={() => setDialogo({ tipo: "trabajador", fila: f })}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </p>
                  {puesto(f) && (
                    <p className="text-sm text-muted-foreground">
                      <Resaltar texto={puesto(f)} consulta={busqueda} />
                    </p>
                  )}
                  {deBaja ? (
                    <p className="mt-1 text-sm text-destructive">
                      Baja el {fechaCortaDia(f.fechaBaja!)} · Motivo: {f.motivoBaja}
                    </p>
                  ) : f.fechaIngreso ? (
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">
                        Trabaja desde el {fechaCortaDia(f.fechaIngreso)} ({antiguedad(f.fechaIngreso, hoy)})
                      </span>
                      {pago && (
                        <span className={cn("ml-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", pago.dias <= 3 ? "bg-aviso/30 text-foreground" : "bg-muted text-muted-foreground")}>
                          <CalendarClock className="size-3.5" />
                          {pago.dias === 0 ? "Hoy cumple su mes" : `Cumple su mes el ${fechaCortaDia(pago.fecha)} (${pago.dias === 1 ? "mañana" : `en ${pago.dias} días`})`}
                        </span>
                      )}
                    </p>
                  ) : (
                    <button type="button" className="mt-1 text-sm font-semibold text-primary hover:underline" onClick={() => setDialogo({ tipo: "trabajador", fila: f })}>
                      Poner desde cuándo trabaja
                    </button>
                  )}
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
                {deBaja ? (
                  <Button size="sm" variant="ghost" onClick={() => setDialogo({ tipo: "reincorporar", fila: f })}>
                    <UserPlus className="size-4" /> Reincorporar
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDialogo({ tipo: "baja", fila: f })}>
                    <UserMinus className="size-4" /> Dar de baja
                  </Button>
                )}
                <span className="ml-auto flex items-center gap-4">
                  {f.historial.length > 0 && (
                    <button type="button" aria-expanded={verHistorial} onClick={() => alternar(`h${f.empleadoId}`)} className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
                      <History className="size-4" /> Historial <ChevronDown className={cn("size-4 transition-transform", verHistorial && "rotate-180")} />
                    </button>
                  )}
                  {f.movimientos.length > 0 && (
                    <button type="button" aria-expanded={verMovimientos} onClick={() => alternar(`m${f.empleadoId}`)} className="flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
                      {vigentes} movimiento{vigentes === 1 ? "" : "s"} <ChevronDown className={cn("size-4 transition-transform", verMovimientos && "rotate-180")} />
                    </button>
                  )}
                </span>
              </div>

              {verHistorial && (
                <ol className="mt-3 space-y-1.5" aria-label={`Historial de ${f.nombre}`}>
                  {f.historial.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-muted/60 px-3 py-2 text-sm">
                      <span className={cn("font-bold", e.tipo === "baja" && "text-destructive")}>{NOMBRES_EVENTO[e.tipo]}</span>
                      <span className="cifras font-semibold">{fechaCortaDia(e.fecha)}</span>
                      <span className="min-w-0 flex-1 basis-40 text-muted-foreground">
                        {e.motivo && `Motivo: ${e.motivo} · `}registrado por {e.registradoPor}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {verMovimientos && (
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

      {dialogo?.tipo === "trabajador" && <DialogoTrabajador fila={dialogo.fila} hoy={hoy} sucursales={sucursales} onCerrar={cerrar} />}
      {dialogo?.tipo === "sueldo" && <DialogoSueldo fila={dialogo.fila} periodo={periodo} mes={titulo} onCerrar={cerrar} />}
      {dialogo?.tipo === "movimiento" && <DialogoMovimiento fila={dialogo.fila} tipo={dialogo.movimiento} periodo={periodo} mes={titulo} onCerrar={cerrar} />}
      {dialogo?.tipo === "anular" && <DialogoAnular fila={dialogo.fila} movimiento={dialogo.movimiento} onCerrar={cerrar} />}
      {dialogo?.tipo === "baja" && <DialogoBaja fila={dialogo.fila} hoy={hoy} onCerrar={cerrar} />}
      {dialogo?.tipo === "reincorporar" && <DialogoReincorporar fila={dialogo.fila} hoy={hoy} onCerrar={cerrar} />}
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

function DialogoTrabajador({ fila, hoy, sucursales, onCerrar }: { fila: FilaPlanilla | null; hoy: string; sucursales: Sucursal[]; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(fila?.nombre ?? "");
  const [cargo, setCargo] = useState(fila?.cargo ?? "");
  const [sucursalId, setSucursalId] = useState<number | null>(fila?.sucursalId ?? null);
  const [fechaIngreso, setFechaIngreso] = useState(fila ? (fila.fechaIngreso ?? "") : hoy);
  const [sueldo, setSueldo] = useState(fila && aCentavos(fila.resumen.sueldo) > 0n ? fila.resumen.sueldo : "");
  const guardar = useAccion(guardarTrabajador, { mensajeExito: fila ? "Datos guardados" : "Trabajador agregado", alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={fila ? `Datos de ${fila.nombre}` : "Nuevo trabajador"}
      descripcion={fila ? undefined : "Para la planilla de sueldos. No necesita tener usuario en el sistema (los usuarios ya aparecen solos)."}
      pendiente={guardar.pendiente}
      textoGuardar={fila ? "Guardar" : "Agregar trabajador"}
      onGuardar={() => guardar.ejecutar({ ...(fila ? { id: fila.empleadoId } : {}), nombre, cargo, sucursalId, fechaIngreso, sueldoMensual: (sueldo || "0").replace(",", ".") })}
    >
      <Campo etiqueta="Nombre completo" error={guardar.campos.nombre}>
        {(p) => <Input {...p} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} autoFocus={!fila} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Cargo" opcional error={guardar.campos.cargo}>
          {(p) => <Input {...p} value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={80} placeholder="Ej. Limpieza, reparto" />}
        </Campo>
        <Campo etiqueta="Sucursal" opcional error={guardar.campos.sucursalId}>
          {(p) => (
            <Select value={sucursalId ? String(sucursalId) : "ninguna"} onValueChange={(v) => setSucursalId(v === "ninguna" ? null : Number(v))}>
              <SelectTrigger {...p} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Sin sucursal fija</SelectItem>
                {sucursales.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Campo>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Trabaja desde" error={guardar.campos.fechaIngreso} ayuda="Ese día de cada mes cumple su mes para pagarle.">
          {(p) => <Input {...p} type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} />}
        </Campo>
        <Campo etiqueta="Sueldo mensual (Bs)" error={guardar.campos.sueldoMensual}>
          {(p) => <Input {...p} value={sueldo} onChange={(e) => setSueldo(soloMonto(e.target.value))} inputMode="decimal" placeholder="0,00" className="cifras text-lg font-bold" />}
        </Campo>
      </div>
    </DialogoFormulario>
  );
}

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
      onGuardar={() => guardar.ejecutar({ empleadoId: fila.empleadoId, periodo, monto: monto.replace(",", ".") })}
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
      onGuardar={() => guardar.ejecutar({ empleadoId: fila.empleadoId, periodo, tipo, monto: monto.replace(",", "."), nota })}
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

function DialogoBaja({ fila, hoy, onCerrar }: { fila: FilaPlanilla; hoy: string; onCerrar: () => void }) {
  const [fecha, setFecha] = useState(hoy);
  const [motivo, setMotivo] = useState("");
  const baja = useAccion(darDeBajaTrabajador, { mensajeExito: `${fila.nombre}: baja registrada`, alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Dar de baja a ${fila.nombre}`}
      descripcion={`Queda en su historial con la fecha y el motivo, y deja de salir en la planilla de los meses siguientes.${fila.rol ? " También se desactiva su usuario: ya no podrá ingresar al sistema." : ""}`}
      pendiente={baja.pendiente}
      textoGuardar="Dar de baja"
      onGuardar={() => baja.ejecutar({ id: fila.empleadoId, fecha, motivo })}
    >
      <Campo etiqueta="Último día de trabajo" error={baja.campos.fecha}>
        {(p) => <Input {...p} type="date" value={fecha} max={hoy} min={fila.fechaIngreso ?? undefined} onChange={(e) => setFecha(e.target.value)} />}
      </Campo>
      <Campo etiqueta="Motivo" error={baja.campos.motivo}>
        {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} autoFocus placeholder="Ej. despido por faltas, renuncia…" />}
      </Campo>
      {aCentavos(fila.resumen.saldo) > 0n && <p className="rounded-xl bg-aviso/15 px-3 py-2 text-sm">Este mes todavía falta pagarle {formatoBs(fila.resumen.saldo)}: puedes registrar el pago antes o después de la baja.</p>}
    </DialogoFormulario>
  );
}

function DialogoReincorporar({ fila, hoy, onCerrar }: { fila: FilaPlanilla; hoy: string; onCerrar: () => void }) {
  const [fecha, setFecha] = useState(hoy);
  const volver = useAccion(reincorporarTrabajador, { mensajeExito: `${fila.nombre} volvió a la planilla`, alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Reincorporar a ${fila.nombre}`}
      descripcion={`Vuelve a la planilla y su mes se cuenta desde esta fecha.${fila.rol ? " Su usuario sigue desactivado: actívalo en Personal si debe ingresar al sistema." : ""}`}
      pendiente={volver.pendiente}
      textoGuardar="Reincorporar"
      onGuardar={() => volver.ejecutar({ id: fila.empleadoId, fecha })}
    >
      <Campo etiqueta="Vuelve a trabajar desde" error={volver.campos.fecha}>
        {(p) => <Input {...p} type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />}
      </Campo>
    </DialogoFormulario>
  );
}
