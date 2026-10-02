"use client";

import { ArrowLeft, CalendarDays, ChevronRight, Plus, Scale, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";
import { useState } from "react";
import { fechaCorta, EstadoEventoBadge, NOMBRES_ESTADO } from "@/components/eventos/estado-evento";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { EventoListado } from "@/lib/eventos/consultas";
import type { DefinicionJuego } from "@/lib/eventos/tipos";
import type { DatosReto } from "@/lib/validaciones/eventos";
import { cn } from "@/lib/utils";
import { crearReto } from "../acciones";

const DURACIONES = [21, 30, 60];

export const CRITERIOS = {
  porcentaje: {
    titulo: "Porcentaje de peso perdido",
    ayuda: "Justo para todos: compara cuánto bajó cada uno respecto a su propio peso inicial.",
  },
  kilos: {
    titulo: "Kilos perdidos",
    ayuda: "Gana quien baje más kilos en total. Favorece a quienes empiezan con más peso.",
  },
} as const;

export function ListaRetos({
  juego,
  retos,
  sucursales,
  hoy,
}: {
  juego: DefinicionJuego;
  retos: EventoListado[];
  sucursales: { id: number; nombre: string }[];
  hoy: string;
}) {
  const [nuevo, setNuevo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const visibles = retos.filter((r) => coincide(busqueda, [r.nombre, r.sucursal, NOMBRES_ESTADO[r.estado]]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/admin/eventos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Eventos
      </Link>
      <EncabezadoPagina
        icono={Scale}
        titulo={juego.titulo}
        descripcion={`${retos.length} ${retos.length === 1 ? juego.singular : juego.plural}`}
      >
        <Button size="lg" className="rounded-full font-bold" onClick={() => setNuevo(true)}>
          <Plus className="size-5" /> Nuevo {juego.singular}
        </Button>
      </EncabezadoPagina>

      {retos.length > 0 && <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta={`Buscar ${juego.plural}`} placeholder="Nombre, sucursal o estado" />}
      <ul className="space-y-3">
        {retos.length > 0 && visibles.length === 0 && (
          <li>
            <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />
          </li>
        )}
        {visibles.map((r) => (
          <li key={r.id}>
            <Link
              href={`/admin/eventos/${juego.slug}/${r.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-3xl border bg-card p-4 shadow-sm transition-colors hover:bg-accent sm:px-5"
            >
              <div className="min-w-0 flex-1 basis-56">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-display text-lg font-extrabold">
                    <Resaltar texto={r.nombre} consulta={busqueda} />
                  </span>
                  <EstadoEventoBadge estado={r.estado} />
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-4" />
                    <span className="cifras">
                      {fechaCorta(r.fechaInicio)} – {fechaCorta(r.fechaFin)}
                    </span>
                    · {r.duracionDias} días
                  </span>
                  {r.sucursal && (
                    <span>
                      <Resaltar texto={r.sucursal} consulta={busqueda} />
                    </span>
                  )}
                  <span>Gana por {r.criterioGanador === "porcentaje" ? "% perdido" : "kilos perdidos"}</span>
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                <Users className="size-4 text-primary" />
                <span className="cifras">{r.participantes}</span> participante{r.participantes === 1 ? "" : "s"}
              </span>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          </li>
        ))}
        {retos.length === 0 && (
          <li className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">
            Todavía no hay {juego.plural}. Crea el primero con “Nuevo {juego.singular}”.
          </li>
        )}
      </ul>

      {nuevo && <DialogoNuevoReto juego={juego} sucursales={sucursales} hoy={hoy} onCerrar={() => setNuevo(false)} />}
    </div>
  );
}

function DialogoNuevoReto({
  juego,
  sucursales,
  hoy,
  onCerrar,
}: {
  juego: DefinicionJuego;
  sucursales: { id: number; nombre: string }[];
  hoy: string;
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<DatosReto>({
    nombre: "",
    descripcion: "",
    fechaInicio: hoy,
    duracionDias: 30,
    criterioGanador: "porcentaje",
    sucursalId: null,
    premios: "",
  });
  const crear = useAccion(crearReto, {
    mensajeExito: `${juego.singular[0].toUpperCase()}${juego.singular.slice(1)} creado`,
    alExito: ({ id }) => {
      onCerrar();
      router.push(`/admin/eventos/${juego.slug}/${id}`);
    },
  });
  const poner = <K extends keyof DatosReto>(k: K, v: DatosReto[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    crear.limpiarCampo(k);
  };

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={`Nuevo ${juego.singular}`}
      descripcion="Queda como borrador: inscribes a los participantes y luego lo inicias."
      pendiente={crear.pendiente}
      textoGuardar={`Crear ${juego.singular}`}
      onGuardar={() => crear.ejecutar(d)}
    >
      <Campo etiqueta="Nombre" error={crear.campos.nombre}>
        {(p) => <Input {...p} value={d.nombre} onChange={(e) => poner("nombre", e.target.value)} maxLength={120} placeholder="Ej. Reto Transformación Octubre" autoFocus />}
      </Campo>
      <Campo etiqueta="Descripción" opcional error={crear.campos.descripcion}>
        {(p) => <Textarea {...p} value={d.descripcion ?? ""} onChange={(e) => poner("descripcion", e.target.value)} rows={2} maxLength={1000} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Fecha de inicio" error={crear.campos.fechaInicio}>
          {(p) => <Input {...p} type="date" value={d.fechaInicio} onChange={(e) => poner("fechaInicio", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Duración (días)" error={crear.campos.duracionDias}>
          {(p) => (
            <div className="space-y-2">
              <Input {...p} type="number" inputMode="numeric" min={1} max={365} value={String(d.duracionDias)} onChange={(e) => poner("duracionDias", e.target.value)} />
              <div className="flex gap-2">
                {DURACIONES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => poner("duracionDias", n)}
                    className={cn(
                      "h-8 flex-1 rounded-full border text-xs font-bold transition-colors",
                      Number(d.duracionDias) === n ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {n} días
                  </button>
                ))}
              </div>
            </div>
          )}
        </Campo>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Criterio de ganador</legend>
        {(Object.keys(CRITERIOS) as (keyof typeof CRITERIOS)[]).map((c) => (
          <label
            key={c}
            className={cn(
              "flex cursor-pointer gap-3 rounded-2xl border p-3 transition-colors",
              d.criterioGanador === c ? "border-primary bg-primary/8" : "hover:bg-accent",
            )}
          >
            <input type="radio" name="criterio" className="mt-1 accent-primary" checked={d.criterioGanador === c} onChange={() => poner("criterioGanador", c)} />
            <span>
              <span className="block text-sm font-bold">{CRITERIOS[c].titulo}</span>
              <span className="block text-xs text-muted-foreground">{CRITERIOS[c].ayuda}</span>
            </span>
          </label>
        ))}
      </fieldset>

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
        {(p) => (
          <Textarea {...p} value={d.premios ?? ""} onChange={(e) => poner("premios", e.target.value)} rows={2} maxLength={1000} placeholder="Ej. 1.º: un año de suplementos · 2.º: pack de proteína · 3.º: shaker y creatina" />
        )}
      </Campo>
    </DialogoFormulario>
  );
}
