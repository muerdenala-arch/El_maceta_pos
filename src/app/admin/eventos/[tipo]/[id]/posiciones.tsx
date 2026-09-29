"use client";

import { Trophy } from "lucide-react";
import { useMemo } from "react";
import { Podio, TablaPosiciones } from "@/components/eventos/tabla-posiciones";
import { evolucion, tablaPosiciones } from "@/lib/eventos/calculos";
import { AccionesResultados } from "./acciones-resultados";
import { GraficoEvolucion } from "./grafico-evolucion";
import type { DetalleRetoProps } from "./tipos";

/** Tabla de posiciones: podio, tabla, gráfico de evolución y (con resultados) imprimir/PDF/Excel/WhatsApp. */
export function PestanaPosiciones({ evento, participantes, pesajes, negocio }: Pick<DetalleRetoProps, "evento" | "participantes" | "pesajes" | "negocio">) {
  const finalizado = evento.estado === "finalizado";
  const { filas, series } = useMemo(() => {
    const activos = participantes.filter((p) => p.activo).map((p) => ({ id: p.id, nombre: p.nombreCompleto, pesoInicial: p.pesoInicial }));
    const filas = tablaPosiciones({ participantes: activos, pesajes, criterio: evento.criterioGanador, finalizado });
    // Series en el orden de la tabla: los primeros puestos se llevan los primeros colores.
    const orden = new Map(filas.map((f, i) => [f.participanteId, i]));
    const series = evolucion(activos, pesajes, evento.fechaInicio).sort((a, b) => orden.get(a.participanteId)! - orden.get(b.participanteId)!);
    return { filas, series };
  }, [participantes, pesajes, evento.criterioGanador, evento.fechaInicio, finalizado]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Trophy className="size-6 text-primary" />
          {finalizado ? "Resultados finales" : "Posiciones parciales"}
        </h2>
        {evento.estado !== "borrador" && <AccionesResultados evento={evento} participantes={participantes} negocio={negocio} filas={filas} />}
      </div>
      {!finalizado && evento.estado === "en_curso" && (
        <p className="text-sm text-muted-foreground">Se calculan con el último pesaje de cada participante; cambian con cada jornada.</p>
      )}
      <Podio filas={filas} criterio={evento.criterioGanador} />
      <TablaPosiciones filas={filas} criterio={evento.criterioGanador} />
      <GraficoEvolucion series={series} fechaInicio={evento.fechaInicio} fechaFin={evento.fechaFin} />
    </section>
  );
}
