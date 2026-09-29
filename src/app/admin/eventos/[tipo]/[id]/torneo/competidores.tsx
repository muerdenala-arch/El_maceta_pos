"use client";

import { Pencil, UserMinus, UserPlus, Users } from "lucide-react";
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
import { darDeBajaCompetidor, editarCompetidor, inscribirCompetidor } from "../../../torneo-acciones";
import type { TorneoProps } from "./tipos";

export function PestanaCompetidores({ evento, torneo, participantes }: TorneoProps) {
  const [editando, setEditando] = useState<ParticipanteListado | "nuevo" | null>(null);
  const [baja, setBaja] = useState<ParticipanteListado | null>(null);
  const inscripcionAbierta = evento.estado === "borrador" && !torneo.sorteado;
  const activos = participantes.filter((p) => p.activo).length;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="size-4" /> {activos} competidor{activos === 1 ? "" : "es"}
          {participantes.length > activos && ` · ${participantes.length - activos} de baja`}
        </p>
        {inscripcionAbierta ? (
          <Button className="rounded-full font-bold" onClick={() => setEditando("nuevo")}>
            <UserPlus className="size-4" /> Inscribir competidor
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            {evento.estado === "finalizado" ? "El torneo terminó." : "Las llaves ya se sortearon: no se inscriben más competidores."}
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {participantes.map((p) => (
          <li key={p.id} className={cn("flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm sm:px-4", !p.activo && "opacity-60")}>
            <div className="min-w-0 flex-1 basis-56">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {p.nombreCompleto}
                {!p.activo && <Badge variant="destructive">De baja</Badge>}
              </p>
              <p className="cifras text-sm text-muted-foreground">
                CI {p.cedulaIdentidad} · {p.telefono}
                {p.pesoInicial !== null && ` · ${textoKilos(aCentikg(p.pesoInicial))}`}
              </p>
              {!p.activo && p.motivoBaja && <p className="text-sm text-destructive">Motivo: {p.motivoBaja}</p>}
            </div>
            {evento.estado !== "finalizado" && p.activo && (
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
          <li className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Todavía no hay competidores. Se necesitan al menos 2 para sortear.</li>
        )}
      </ul>

      {editando && <DialogoCompetidor eventoId={evento.id} competidor={editando === "nuevo" ? null : editando} onCerrar={() => setEditando(null)} />}
      {baja && <DialogoBaja competidor={baja} sorteado={torneo.sorteado} onCerrar={() => setBaja(null)} />}
    </section>
  );
}

function DialogoCompetidor({ eventoId, competidor, onCerrar }: { eventoId: number; competidor: ParticipanteListado | null; onCerrar: () => void }) {
  const [d, setD] = useState({
    nombreCompleto: competidor?.nombreCompleto ?? "",
    cedulaIdentidad: competidor?.cedulaIdentidad ?? "",
    telefono: competidor?.telefono ?? "",
    pesoInicial: competidor?.pesoInicial ? String(Number(competidor.pesoInicial)) : "",
  });
  const [acepta, setAcepta] = useState(false);
  const opciones = { mensajeExito: competidor ? "Datos actualizados" : "Competidor inscrito", alExito: onCerrar };
  const inscribir = useAccion(inscribirCompetidor, opciones);
  const editar = useAccion(editarCompetidor, opciones);
  const accion = competidor ? editar : inscribir;
  const poner = (k: keyof typeof d, v: string) => {
    setD((x) => ({ ...x, [k]: v }));
    accion.limpiarCampo(k);
  };

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={competidor ? "Editar competidor" : "Inscribir competidor"}
      pendiente={accion.pendiente}
      textoGuardar={competidor ? "Guardar" : "Inscribir"}
      onGuardar={() => (competidor ? editar.ejecutar({ id: competidor.id, ...d }) : inscribir.ejecutar({ eventoId, ...d, aceptaParticipar: acepta as true }))}
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
      <Campo etiqueta="Peso (kg)" opcional error={accion.campos.pesoInicial} ayuda="Solo como dato: la categoría es libre.">
        {(p) => <Input {...p} value={d.pesoInicial} onChange={(e) => poner("pesoInicial", e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" placeholder="Ej. 82,5" className="cifras w-40" />}
      </Campo>
      {!competidor && (
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
            <strong>El competidor acepta participar en el torneo.</strong>
            {accion.campos.aceptaParticipar && <span className="mt-1 block text-destructive">{accion.campos.aceptaParticipar}</span>}
          </span>
        </label>
      )}
    </DialogoFormulario>
  );
}

function DialogoBaja({ competidor, sorteado, onCerrar }: { competidor: ParticipanteListado; sorteado: boolean; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const baja = useAccion(darDeBajaCompetidor, { mensajeExito: "Competidor dado de baja", alExito: onCerrar });
  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Dar de baja"
      descripcion={
        sorteado
          ? `${competidor.nombreCompleto} pierde por W.O. todos los combates que le queden; lo ya jugado se respeta. No se borra.`
          : `${competidor.nombreCompleto} no entrará al sorteo. No se borra: queda en el historial.`
      }
      pendiente={baja.pendiente}
      textoGuardar="Dar de baja"
      onGuardar={() => baja.ejecutar({ id: competidor.id, motivo })}
    >
      <Campo etiqueta="Motivo" error={baja.campos.motivo}>
        {(p) => <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} autoFocus placeholder="Ej. se lesionó el brazo" />}
      </Campo>
    </DialogoFormulario>
  );
}
