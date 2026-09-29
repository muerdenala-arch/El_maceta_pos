import { Trophy } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Podio, TablaPosiciones } from "@/components/eventos/tabla-posiciones";
import { FondoAmbiental } from "@/components/marca/fondo-ambiental";
import { obtenerMarca } from "@/lib/configuracion";
import { tablaPosiciones } from "@/lib/eventos/calculos";
import { competidoresPublicos, eventoPublico } from "@/lib/eventos/consultas";
import { ClasificacionTorneo } from "@/components/eventos/clasificacion-torneo";
import { Llaves } from "@/components/eventos/llaves-torneo";
import { clasificacion, competidoresEnLlaves } from "@/lib/eventos/pulseada";
import { FORMATOS } from "@/lib/eventos/textos-torneo";
import { estadoTorneo } from "@/lib/eventos/torneo-datos";

export const metadata: Metadata = { title: "Resultados", robots: { index: false } };

const fecha = (f: string) => f.split("-").reverse().join("/");

/**
 * Resultados públicos del reto (enlace de WhatsApp con token aleatorio, como el comprobante).
 * Solo nombres, kilos y porcentaje perdido: nunca cédula ni teléfono.
 */
export default async function ResultadosPublicos(props: PageProps<"/eventos/[token]">) {
  const datos = await eventoPublico((await props.params).token);
  if (!datos || datos.evento.estado === "borrador") notFound();
  const { evento, participantes, pesajes } = datos;
  const marca = await obtenerMarca();
  const finalizado = evento.estado === "finalizado";
  if (evento.tipoJuego === "torneo_pulseada") return <TorneoPublico eventoId={evento.id} negocio={marca.nombre} />;
  const filas = tablaPosiciones({
    participantes: participantes.map((p) => ({ id: p.id, nombre: p.nombre, pesoInicial: p.pesoInicial })),
    pesajes,
    criterio: evento.criterioGanador,
    finalizado,
  });

  return (
    <main className="relative min-h-dvh px-4 py-8">
      <FondoAmbiental />
      <div className="relative mx-auto max-w-3xl space-y-6">
        <header>
          <p className="text-sm font-bold text-muted-foreground">{marca.nombre}</p>
          <h1 className="mt-1 flex items-center gap-2.5 font-display text-2xl font-extrabold sm:text-3xl">
            <Trophy className="size-7 text-primary" /> {finalizado ? "Resultados finales" : "Posiciones parciales"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {evento.nombre} · del {fecha(evento.fechaInicio)} al {fecha(evento.fechaFin)} · gana por{" "}
            {evento.criterioGanador === "porcentaje" ? "porcentaje de peso perdido" : "kilos perdidos"}
          </p>
        </header>
        <Podio filas={filas} criterio={evento.criterioGanador} />
        <TablaPosiciones filas={filas} criterio={evento.criterioGanador} publica />
      </div>
    </main>
  );
}

/** Torneo de pulseada: podio, clasificación y llaves con solo nombres y marcadores. */
async function TorneoPublico({ eventoId, negocio }: { eventoId: number; negocio: string }) {
  const [t, competidores] = await Promise.all([estadoTorneo(eventoId), competidoresPublicos(eventoId)]);
  if (!t) notFound();
  const { evento, torneo, llaves } = t;
  const conPuntos = torneo.formato === "todos_contra_todos";
  const filas = clasificacion({
    formato: torneo.formato,
    combates: llaves,
    competidores: competidoresEnLlaves(llaves),
    retirados: competidores.filter((c) => !c.activo).map((c) => c.id),
    puntosVictoria: torneo.puntosVictoria,
  });
  const nombres = new Map(competidores.map((c) => [c.id, c.nombre]));
  const finalizado = evento.estado === "finalizado";

  return (
    <main className="relative min-h-dvh px-4 py-8">
      <FondoAmbiental />
      <div className="relative mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-sm font-bold text-muted-foreground">{negocio}</p>
          <h1 className="mt-1 flex items-center gap-2.5 font-display text-2xl font-extrabold sm:text-3xl">
            <Trophy className="size-7 text-primary" /> {finalizado ? "Resultados finales" : "Clasificación parcial"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {evento.nombre} · torneo de pulseada · {fecha(evento.fechaInicio)} · {FORMATOS[torneo.formato].titulo}, al mejor de {torneo.mejorDe}
          </p>
        </header>
        <ClasificacionTorneo filas={filas} nombres={nombres} conPuntos={conPuntos} />
        <section className="space-y-3">
          <h2 className="font-display text-xl font-extrabold">{conPuntos ? "Fechas" : "Llaves"}</h2>
          <Llaves llaves={llaves} formato={torneo.formato} nombres={nombres} />
        </section>
      </div>
    </main>
  );
}
