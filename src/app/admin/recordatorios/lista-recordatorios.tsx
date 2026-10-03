"use client";

import { AlarmClock, BellOff, CheckCircle2, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { useState } from "react";
import { ActivarNotificaciones } from "@/components/barra/activar-notificaciones";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { coincide } from "@/lib/busqueda";
import { esRepeticion, NOMBRES_REPETICION, REPETICIONES, textoAviso, type Repeticion } from "@/lib/recordatorios/calculo";
import { cn } from "@/lib/utils";
import type { DatosRecordatorio } from "@/lib/validaciones/recordatorios";
import { eliminarRecordatorio, guardarRecordatorio } from "./acciones";

type Recordatorio = {
  id: number;
  titulo: string;
  nota: string | null;
  fecha: string;
  hora: string;
  repeticion: string;
  /** Próximo aviso (ISO); null = ya se avisó y no se repite. */
  proximaEn: string | null;
  enviadoEn: string | null;
  dispositivos: number;
};

const repeticionDe = (r: Recordatorio): Repeticion => (esRepeticion(r.repeticion) ? r.repeticion : "ninguna");
const cuando = (r: Recordatorio) => (r.proximaEn ? textoAviso(new Date(r.proximaEn)) : r.enviadoEn ? `Avisado el ${textoAviso(new Date(r.enviadoEn))}` : "Sin fecha");

export function ListaRecordatorios({ hoy, recordatorios, avisosDisponibles }: { hoy: string; recordatorios: Recordatorio[]; avisosDisponibles: boolean }) {
  const [editando, setEditando] = useState<Recordatorio | "nuevo" | null>(null);
  const [porBorrar, setPorBorrar] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const eliminar = useAccion(eliminarRecordatorio, { mensajeExito: "Recordatorio eliminado", alExito: () => setPorBorrar(null) });
  const visibles = recordatorios.filter((r) => coincide(busqueda, [r.titulo, r.nota, cuando(r), NOMBRES_REPETICION[repeticionDe(r)], r.proximaEn ? "Pendiente" : "Avisado"]));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <EncabezadoPagina icono={AlarmClock} titulo="Recordatorios" descripcion="Anota lo que no quieres olvidar: al día y la hora que elijas te llega la notificación a tu celular.">
        <Button size="lg" className="rounded-full font-bold" onClick={() => setEditando("nuevo")}>
          <Plus className="size-5" /> Nuevo recordatorio
        </Button>
      </EncabezadoPagina>

      {avisosDisponibles ? (
        <div className="overflow-hidden rounded-2xl border bg-card [&>*]:border-t-0">
          <ActivarNotificaciones />
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <BellOff className="size-4 shrink-0" /> Las notificaciones al celular todavía no están configuradas en este servidor.
        </p>
      )}

      {recordatorios.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
          <AlarmClock className="size-10" />
          <p>Crea tu primer recordatorio: por ejemplo, “Pagar el alquiler” el día 5 a las 09:00, cada mes.</p>
        </div>
      ) : (
        <>
          <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar recordatorios" placeholder="Texto, fecha o estado" />
          {visibles.length === 0 && <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />}
          <ul className="space-y-3">
            {visibles.map((r) => {
              const pendiente = r.proximaEn !== null;
              const repeticion = repeticionDe(r);
              return (
                <li key={r.id} className={cn("flex items-start gap-3 rounded-3xl border bg-card p-4 shadow-sm sm:p-5", !pendiente && "opacity-70")}>
                  <span
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl",
                      pendiente ? "bg-ficha-naranja text-ficha-naranja-foreground" : "bg-ficha-verde text-ficha-verde-foreground",
                    )}
                  >
                    {pendiente ? <AlarmClock className="size-5" /> : <CheckCircle2 className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-bold leading-snug break-words">
                      <Resaltar texto={r.titulo} consulta={busqueda} />
                    </p>
                    {r.nota && (
                      <p className="text-sm break-words whitespace-pre-line text-muted-foreground">
                        <Resaltar texto={r.nota} consulta={busqueda} />
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="cifras text-sm font-semibold">
                        <Resaltar texto={cuando(r)} consulta={busqueda} />
                      </span>
                      {repeticion !== "ninguna" && (
                        <Badge variant="outline" className="gap-1">
                          <Repeat className="size-3" /> {NOMBRES_REPETICION[repeticion]}
                        </Badge>
                      )}
                      <Badge className={pendiente ? "bg-ficha-neutra text-ficha-neutra-foreground" : "bg-exito text-exito-foreground"}>{pendiente ? "Pendiente" : "Avisado"}</Badge>
                    </div>
                    {r.enviadoEn && r.dispositivos === 0 && (
                      <p className="text-xs text-destructive">
                        El último aviso ({textoAviso(new Date(r.enviadoEn))}) no llegó a ningún equipo: activa las notificaciones en tu celular.
                      </p>
                    )}
                  </div>
                  {porBorrar === r.id ? (
                    <div className="flex shrink-0 flex-col gap-1.5">
                      <Button size="sm" variant="destructive" disabled={eliminar.pendiente} onClick={() => eliminar.ejecutar({ id: r.id })}>
                        Eliminar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPorBorrar(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex shrink-0 gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Editar ${r.titulo}`} onClick={() => setEditando(r)}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Eliminar ${r.titulo}`} onClick={() => setPorBorrar(r.id)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editando && (
        <FormularioRecordatorio key={editando === "nuevo" ? "nuevo" : editando.id} recordatorio={editando === "nuevo" ? null : editando} hoy={hoy} onCerrar={() => setEditando(null)} />
      )}
    </div>
  );
}

function FormularioRecordatorio({ recordatorio, hoy, onCerrar }: { recordatorio: Recordatorio | null; hoy: string; onCerrar: () => void }) {
  // Uno ya avisado se vuelve a programar: por defecto, para hoy.
  const [d, setD] = useState<DatosRecordatorio>(() => ({
    titulo: recordatorio?.titulo ?? "",
    nota: recordatorio?.nota ?? "",
    fecha: recordatorio && recordatorio.fecha >= hoy ? recordatorio.fecha : hoy,
    hora: recordatorio?.hora ?? "09:00",
    repeticion: recordatorio ? repeticionDe(recordatorio) : "ninguna",
  }));
  const guardar = useAccion(guardarRecordatorio, { mensajeExito: recordatorio ? "Recordatorio actualizado" : "Recordatorio creado", alExito: onCerrar });
  const poner = <K extends keyof DatosRecordatorio>(k: K, v: DatosRecordatorio[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    guardar.limpiarCampo(k);
  };

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={recordatorio ? "Editar recordatorio" : "Nuevo recordatorio"}
      descripcion="La notificación llega a los equipos donde activaste los avisos."
      pendiente={guardar.pendiente}
      onGuardar={() => guardar.ejecutar(recordatorio ? { ...d, id: recordatorio.id } : d)}
    >
      <Campo etiqueta="¿Qué quieres recordar?" error={guardar.campos.titulo}>
        {(p) => <Input {...p} value={d.titulo} onChange={(e) => poner("titulo", e.target.value)} maxLength={120} placeholder="Ej. Pagar al proveedor de proteínas" autoFocus={!recordatorio} />}
      </Campo>
      <Campo etiqueta="Nota" opcional error={guardar.campos.nota}>
        {(p) => <Textarea {...p} value={d.nota ?? ""} onChange={(e) => poner("nota", e.target.value)} maxLength={500} rows={2} placeholder="Detalles que quieras ver en el aviso" />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Día" error={guardar.campos.fecha}>
          {(p) => <Input {...p} type="date" value={d.fecha} min={hoy} onChange={(e) => poner("fecha", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Hora" error={guardar.campos.hora} ayuda="Hora de Bolivia">
          {(p) => <Input {...p} type="time" value={d.hora} onChange={(e) => poner("hora", e.target.value)} />}
        </Campo>
      </div>
      <Campo etiqueta="Se repite" error={guardar.campos.repeticion}>
        {(p) => (
          <Select value={d.repeticion} onValueChange={(v) => poner("repeticion", v as Repeticion)}>
            <SelectTrigger {...p} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPETICIONES.map((r) => (
                <SelectItem key={r} value={r}>
                  {NOMBRES_REPETICION[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Campo>
    </DialogoFormulario>
  );
}
