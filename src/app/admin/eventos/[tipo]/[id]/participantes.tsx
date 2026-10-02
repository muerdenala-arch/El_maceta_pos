"use client";

import { Pencil, UserMinus, UserPlus, Users } from "lucide-react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";
import { useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { useAccion } from "@/components/formularios/use-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { aCentikg, textoKilos } from "@/lib/eventos/calculos";
import type { ParticipanteListado } from "@/lib/eventos/consultas";
import { cn } from "@/lib/utils";
import { darDeBajaParticipante, editarParticipante, inscribirParticipante } from "../../acciones";
import type { DetalleRetoProps } from "./tipos";

const kg = (p: string | null) => textoKilos(aCentikg(p));

export function PestanaParticipantes({ evento, participantes }: Pick<DetalleRetoProps, "evento" | "participantes">) {
  const [editando, setEditando] = useState<ParticipanteListado | "nuevo" | null>(null);
  const [baja, setBaja] = useState<ParticipanteListado | null>(null);
  const abierto = evento.estado !== "finalizado";
  const activos = participantes.filter((p) => p.activo).length;
  const [busqueda, setBusqueda] = useState("");
  const visibles = participantes.filter((p) => coincide(busqueda, [p.nombreCompleto, p.cedulaIdentidad, p.telefono, p.activo ? null : "De baja"]));

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" /> {activos} activo{activos === 1 ? "" : "s"}
          {participantes.length > activos && ` · ${participantes.length - activos} de baja`}
        </p>
        {abierto ? (
          <Button className="rounded-full font-bold" onClick={() => setEditando("nuevo")}>
            <UserPlus className="size-4" /> Inscribir participante
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">El reto terminó: ya no se inscriben participantes.</p>
        )}
      </div>

      {participantes.length > 0 && <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar participantes" placeholder="Nombre, cédula o celular" />}
      <ul className="space-y-2">
        {participantes.length > 0 && visibles.length === 0 && (
          <li>
            <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />
          </li>
        )}
        {visibles.map((p) => (
          <li key={p.id} className={cn("flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:px-4", !p.activo && "opacity-60")}>
            <div className="min-w-0 flex-1 basis-56">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                <Resaltar texto={p.nombreCompleto} consulta={busqueda} />
                {!p.activo && <Badge variant="destructive">De baja</Badge>}
              </p>
              <p className="cifras text-sm text-muted-foreground">
                CI <Resaltar texto={p.cedulaIdentidad} consulta={busqueda} /> · <Resaltar texto={p.telefono} consulta={busqueda} /> · inicial {kg(p.pesoInicial)}
              </p>
              {!p.activo && p.motivoBaja && <p className="text-sm text-destructive">Motivo: {p.motivoBaja}</p>}
            </div>
            {abierto && p.activo && (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setEditando(p)}>
                  <Pencil className="size-4" /> Editar
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setBaja(p)}>
                  <UserMinus className="size-4" /> Dar de baja
                </Button>
              </div>
            )}
          </li>
        ))}
        {participantes.length === 0 && (
          <li className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Todavía no hay participantes inscritos.</li>
        )}
      </ul>

      {editando && <DialogoParticipante eventoId={evento.id} participante={editando === "nuevo" ? null : editando} onCerrar={() => setEditando(null)} />}
      {baja && <DialogoBaja participante={baja} onCerrar={() => setBaja(null)} />}
    </section>
  );
}

function DialogoParticipante({ eventoId, participante, onCerrar }: { eventoId: number; participante: ParticipanteListado | null; onCerrar: () => void }) {
  const [d, setD] = useState({
    nombreCompleto: participante?.nombreCompleto ?? "",
    cedulaIdentidad: participante?.cedulaIdentidad ?? "",
    telefono: participante?.telefono ?? "",
    pesoInicial: participante ? String(Number(participante.pesoInicial)) : "",
  });
  const [acepta, setAcepta] = useState(false);
  const opciones = { mensajeExito: participante ? "Datos actualizados" : "Participante inscrito", alExito: onCerrar };
  const inscribir = useAccion(inscribirParticipante, opciones);
  const editar = useAccion(editarParticipante, opciones);
  const accion = participante ? editar : inscribir;
  const poner = (k: keyof typeof d, v: string) => {
    setD((x) => ({ ...x, [k]: v }));
    accion.limpiarCampo(k);
  };

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={participante ? "Editar participante" : "Inscribir participante"}
      pendiente={accion.pendiente}
      textoGuardar={participante ? "Guardar" : "Inscribir"}
      onGuardar={() =>
        participante
          ? editar.ejecutar({ id: participante.id, ...d })
          : inscribir.ejecutar({ eventoId, ...d, aceptaParticipar: acepta as true })
      }
    >
      <Campo etiqueta="Nombre completo" error={accion.campos.nombreCompleto}>
        {(p) => <Input {...p} value={d.nombreCompleto} onChange={(e) => poner("nombreCompleto", e.target.value)} maxLength={160} autoFocus autoComplete="off" />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Cédula de identidad" error={accion.campos.cedulaIdentidad} ayuda="Ej. 1234567 o 1234567-1A LP">
          {(p) => <Input {...p} value={d.cedulaIdentidad} onChange={(e) => poner("cedulaIdentidad", e.target.value)} maxLength={20} autoComplete="off" className="uppercase" />}
        </Campo>
        <Campo etiqueta="Celular" error={accion.campos.telefono}>
          {(p) => <Input {...p} value={d.telefono} onChange={(e) => poner("telefono", e.target.value)} type="tel" inputMode="tel" maxLength={20} placeholder="71234567" />}
        </Campo>
      </div>
      <Campo etiqueta="Peso inicial (kg)" error={accion.campos.pesoInicial} ayuda="Entre 30 y 300 kg, con hasta 2 decimales.">
        {(p) => (
          <Input {...p} value={d.pesoInicial} onChange={(e) => poner("pesoInicial", e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="85,5" className="cifras text-lg font-bold" />
        )}
      </Campo>
      {!participante && (
        <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-3", accion.campos.aceptaParticipar && "border-destructive")}>
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-primary"
            checked={acepta}
            onChange={(e) => {
              setAcepta(e.target.checked);
              accion.limpiarCampo("aceptaParticipar");
            }}
          />
          <span className="text-sm">
            <strong>El participante acepta participar y que se registre su peso.</strong>
            {accion.campos.aceptaParticipar && <span className="mt-1 block text-destructive">{accion.campos.aceptaParticipar}</span>}
          </span>
        </label>
      )}
    </DialogoFormulario>
  );
}

function DialogoBaja({ participante, onCerrar }: { participante: ParticipanteListado; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const baja = useAccion(darDeBajaParticipante, { mensajeExito: "Participante dado de baja", alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Dar de baja"
      descripcion={`${participante.nombreCompleto} sale de la tabla de posiciones. No se borra: queda en el historial.`}
      pendiente={baja.pendiente}
      textoGuardar="Dar de baja"
      onGuardar={() => baja.ejecutar({ id: participante.id, motivo })}
    >
      <Campo etiqueta="Motivo" error={baja.campos.motivo}>
        {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} autoFocus placeholder="Ej. dejó de asistir por viaje" />}
      </Campo>
    </DialogoFormulario>
  );
}
