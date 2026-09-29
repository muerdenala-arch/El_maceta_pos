import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pestanas } from "@/components/inventario/pestanas";
import { idsCombates, obtenerEvento, participantesDe } from "@/lib/eventos/consultas";
import { estadoTorneo } from "@/lib/eventos/torneo-datos";
import type { DefinicionJuego } from "@/lib/eventos/tipos";
import { PestanaClasificacion } from "./clasificacion";
import { PestanaCombates } from "./combates";
import { PestanaCompetidores } from "./competidores";
import { EncabezadoTorneo } from "./encabezado-torneo";
import { PestanaLlaves } from "./llaves";
import type { TorneoProps } from "./tipos";

const VISTAS = ["competidores", "combates", "llaves", "clasificacion"] as const;

/** Detalle del Torneo de Pulseada: cabecera y pestañas Competidores, Combates, Llaves/Tabla y Clasificación. */
export async function PaginaTorneo({ juego, eventoId, vista: pedida, negocio }: { juego: DefinicionJuego; eventoId: number; vista: unknown; negocio: TorneoProps["negocio"] }) {
  const [evento, estado, participantes, ids] = await Promise.all([
    obtenerEvento(eventoId, "torneo_pulseada"),
    estadoTorneo(eventoId),
    participantesDe(eventoId),
    idsCombates(eventoId),
  ]);
  if (!evento || !estado) notFound();

  const datos: TorneoProps = {
    evento,
    torneo: { formato: estado.torneo.formato, mejorDe: estado.torneo.mejorDe, puntosVictoria: estado.torneo.puntosVictoria, sorteado: !!estado.torneo.sorteo },
    participantes,
    llaves: estado.llaves,
    ids,
    negocio,
  };
  const porDefecto = evento.estado === "finalizado" ? "clasificacion" : evento.estado === "en_curso" ? "combates" : "competidores";
  const vista = VISTAS.find((v) => v === pedida) ?? porDefecto;
  const base = `/admin/eventos/${juego.slug}/${evento.id}`;
  const liga = datos.torneo.formato === "todos_contra_todos";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href={`/admin/eventos/${juego.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {juego.titulo}
      </Link>
      <EncabezadoTorneo {...datos} />
      <Pestanas
        actual={vista}
        opciones={[
          { valor: "competidores", titulo: "Competidores", href: `${base}?vista=competidores`, contador: participantes.filter((p) => p.activo).length },
          { valor: "combates", titulo: "Combates", href: `${base}?vista=combates` },
          { valor: "llaves", titulo: liga ? "Fechas" : "Llaves", href: `${base}?vista=llaves` },
          { valor: "clasificacion", titulo: evento.estado === "finalizado" ? "Resultados" : "Clasificación", href: `${base}?vista=clasificacion` },
        ]}
      />
      {vista === "competidores" && <PestanaCompetidores {...datos} />}
      {vista === "combates" && <PestanaCombates {...datos} />}
      {vista === "llaves" && <PestanaLlaves {...datos} />}
      {vista === "clasificacion" && <PestanaClasificacion {...datos} />}
    </div>
  );
}
