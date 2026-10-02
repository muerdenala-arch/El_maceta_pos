"use client";

import { ArrowLeft, BicepsFlexed, CalendarDays, ChevronRight, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";
import { useState } from "react";
import { EstadoEventoBadge, fechaCorta, NOMBRES_ESTADO } from "@/components/eventos/estado-evento";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TorneoListado } from "@/lib/eventos/consultas";
import { FORMATOS } from "@/lib/eventos/textos-torneo";
import type { DefinicionJuego } from "@/lib/eventos/tipos";
import type { Formato } from "@/lib/eventos/pulseada";
import type { DatosTorneo } from "@/lib/validaciones/eventos";
import { cn } from "@/lib/utils";
import { crearTorneo } from "../torneo-acciones";

export function ListaTorneos({
  juego,
  torneos,
  sucursales,
  hoy,
}: {
  juego: DefinicionJuego;
  torneos: TorneoListado[];
  sucursales: { id: number; nombre: string }[];
  hoy: string;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const visibles = torneos.filter((t) => coincide(busqueda, [t.nombre, t.sucursal, FORMATOS[t.formato].titulo, NOMBRES_ESTADO[t.estado]]));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/eventos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Eventos
      </Link>
      <EncabezadoPagina icono={BicepsFlexed} titulo={juego.titulo} descripcion={`${torneos.length} ${torneos.length === 1 ? juego.singular : juego.plural}`}>
        <Button size="lg" className="rounded-full font-bold" onClick={() => setNuevo(true)}>
          <Plus className="size-5" /> Nuevo torneo
        </Button>
      </EncabezadoPagina>

      {torneos.length > 0 && <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar torneos" placeholder="Nombre, formato, sucursal o estado" />}
      <ul className="space-y-3">
        {torneos.length > 0 && visibles.length === 0 && (
          <li>
            <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />
          </li>
        )}
        {visibles.map((t) => (
          <li key={t.id}>
            <Link
              href={`/admin/eventos/${juego.slug}/${t.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent sm:px-5"
            >
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-display text-lg font-extrabold">
                    <Resaltar texto={t.nombre} consulta={busqueda} />
                  </span>
                  <EstadoEventoBadge estado={t.estado} />
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-4" />
                    <span className="cifras">{fechaCorta(t.fechaInicio)}</span>
                  </span>
                  <span>
                    {FORMATOS[t.formato].titulo} · al mejor de {t.mejorDe}
                  </span>
                  {t.sucursal && (
                    <span>
                      <Resaltar texto={t.sucursal} consulta={busqueda} />
                    </span>
                  )}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                <Users className="size-4 text-primary" />
                <span className="cifras">{t.competidores}</span> competidor{t.competidores === 1 ? "" : "es"}
              </span>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          </li>
        ))}
        {torneos.length === 0 && (
          <li className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Todavía no hay torneos. Crea el primero con “Nuevo torneo”.</li>
        )}
      </ul>

      {nuevo && <DialogoNuevoTorneo juego={juego} sucursales={sucursales} hoy={hoy} onCerrar={() => setNuevo(false)} />}
    </div>
  );
}

function DialogoNuevoTorneo({ juego, sucursales, hoy, onCerrar }: { juego: DefinicionJuego; sucursales: { id: number; nombre: string }[]; hoy: string; onCerrar: () => void }) {
  const router = useRouter();
  const [d, setD] = useState<DatosTorneo>({
    nombre: "",
    descripcion: "",
    fechaInicio: hoy,
    formato: "eliminacion_directa",
    mejorDe: 3,
    puntosVictoria: 1,
    sucursalId: null,
    premios: "",
  });
  const crear = useAccion(crearTorneo, {
    mensajeExito: "Torneo creado",
    alExito: ({ id }) => {
      onCerrar();
      router.push(`/admin/eventos/${juego.slug}/${id}`);
    },
  });
  const poner = <K extends keyof DatosTorneo>(k: K, v: DatosTorneo[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    crear.limpiarCampo(k);
  };

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Nuevo torneo de pulseada"
      descripcion="Categoría libre: todos en una sola llave. Inscribes a los competidores y luego sorteas las llaves."
      pendiente={crear.pendiente}
      textoGuardar="Crear torneo"
      onGuardar={() => crear.ejecutar(d)}
    >
      <Campo etiqueta="Nombre" error={crear.campos.nombre}>
        {(p) => <Input {...p} value={d.nombre} onChange={(e) => poner("nombre", e.target.value)} maxLength={120} placeholder="Ej. Torneo de Pulseada El Maseta" autoFocus />}
      </Campo>
      <Campo etiqueta="Descripción" opcional error={crear.campos.descripcion}>
        {(p) => <Textarea {...p} value={d.descripcion ?? ""} onChange={(e) => poner("descripcion", e.target.value)} rows={2} maxLength={1000} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha" error={crear.campos.fechaInicio}>
          {(p) => <Input {...p} type="date" value={d.fechaInicio} onChange={(e) => poner("fechaInicio", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Cada combate al mejor de" error={crear.campos.mejorDe}>
          {(p) => (
            <Select value={String(d.mejorDe)} onValueChange={(v) => poner("mejorDe", Number(v) as 1 | 3 | 5)}>
              <SelectTrigger {...p} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 asalto</SelectItem>
                <SelectItem value="3">3 asaltos (gana con 2)</SelectItem>
                <SelectItem value="5">5 asaltos (gana con 3)</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Campo>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Formato</legend>
        {(Object.keys(FORMATOS) as Formato[]).map((f) => (
          <label key={f} className={cn("flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors", d.formato === f ? "border-primary bg-primary/8" : "hover:bg-accent")}>
            <input type="radio" name="formato" className="mt-1 accent-primary" checked={d.formato === f} onChange={() => poner("formato", f)} />
            <span>
              <span className="block text-sm font-bold">{FORMATOS[f].titulo}</span>
              <span className="block text-xs text-muted-foreground">{FORMATOS[f].ayuda}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {d.formato === "todos_contra_todos" && (
        <Campo etiqueta="Puntos por victoria" error={crear.campos.puntosVictoria} ayuda="Empates en puntos: resultado entre ellos, diferencia de asaltos, asaltos a favor y menos faltas.">
          {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={10} value={String(d.puntosVictoria)} onChange={(e) => poner("puntosVictoria", e.target.value)} className="w-24" />}
        </Campo>
      )}

      <Campo etiqueta="Sucursal" opcional error={crear.campos.sucursalId}>
        {(p) => (
          <Select value={d.sucursalId ? String(d.sucursalId) : "todas"} onValueChange={(v) => poner("sucursalId", v === "todas" ? null : Number(v))}>
            <SelectTrigger {...p} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas las sucursales</SelectItem>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Campo>
      <Campo etiqueta="Premios" opcional error={crear.campos.premios}>
        {(p) => <Textarea {...p} value={d.premios ?? ""} onChange={(e) => poner("premios", e.target.value)} rows={2} maxLength={1000} placeholder="Ej. 1.º: trofeo y un mes de proteína · 2.º: creatina · 3.º: shaker" />}
      </Campo>
    </DialogoFormulario>
  );
}
