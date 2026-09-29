"use client";

import { Trophy } from "lucide-react";
import { useMemo } from "react";
import { ClasificacionTorneo } from "@/components/eventos/clasificacion-torneo";
import { CompartirResultados, type MensajePersonal } from "@/components/eventos/compartir-resultados";
import { fechaCorta } from "@/components/eventos/estado-evento";
import { cargarPdfEventos } from "@/lib/eventos/cargar-pdf";
import { clasificacion, competidoresEnLlaves, type FilaClasificacion } from "@/lib/eventos/pulseada";
import { FORMATOS } from "@/lib/eventos/textos-torneo";
import { nombresDe, type TorneoProps } from "./tipos";

/** Clasificación del torneo (parcial o final) con podio y opciones para compartir. */
export function PestanaClasificacion({ evento, torneo, llaves, participantes, negocio }: TorneoProps) {
  const nombres = useMemo(() => nombresDe(participantes), [participantes]);
  const conPuntos = torneo.formato === "todos_contra_todos";
  const filas = useMemo(
    () =>
      clasificacion({
        formato: torneo.formato,
        combates: llaves,
        competidores: competidoresEnLlaves(llaves),
        retirados: participantes.filter((p) => !p.activo).map((p) => p.id),
        puntosVictoria: torneo.puntosVictoria,
      }),
    [torneo, llaves, participantes],
  );

  if (!torneo.sorteado) return <p className="rounded-2xl bg-muted p-4 text-sm">La clasificación aparece al sortear las llaves.</p>;

  const finalizado = evento.estado === "finalizado";
  const titulo = finalizado ? "Resultados finales" : "Clasificación parcial";
  const telefonos = new Map(participantes.map((p) => [p.id, p.telefono]));
  const enlace = typeof window === "undefined" ? "" : `${window.location.origin}/eventos/${evento.tokenPublico}`;
  const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? "" : "s"}`;
  const mensajes: MensajePersonal[] = filas.map((f) => {
    const nombre = nombres.get(f.competidor) ?? "";
    return {
      id: f.competidor,
      nombre,
      posicion: f.posicion,
      telefono: telefonos.get(f.competidor) ?? "",
      texto:
        `¡Hola ${nombre.split(" ")[0]}! Terminó el torneo de pulseada «${evento.nombre}» de ${negocio.nombre}. ` +
        `${f.posicion ? `Quedaste en el puesto ${f.posicion}` : "Terminaste"} con ${plural(f.victorias, "victoria")} y ${plural(f.derrotas, "derrota")}` +
        `${conPuntos ? ` (${f.puntos} puntos)` : ""}. ¡Gracias por participar! Resultados: ${enlace}`,
    };
  });
  const filasConNombre = filas.map((f) => ({ ...f, nombre: nombres.get(f.competidor) ?? "" }));

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-extrabold">
          <Trophy className="size-6 text-primary" /> {titulo}
        </h2>
        <CompartirResultados
          evento={evento}
          negocio={negocio}
          excelHref={`/api/admin/eventos/${evento.id}/excel`}
          mensajes={mensajes}
          impresion={<Impresion titulo={titulo} evento={evento.nombre} fecha={evento.fechaInicio} negocio={negocio.nombre} filas={filasConNombre} conPuntos={conPuntos} />}
          generarPdf={async () => {
            const { generarPdfTorneo, nombreArchivoResultados } = await cargarPdfEventos();
            const blob = await generarPdfTorneo({
              negocio,
              evento: { nombre: evento.nombre, fecha: evento.fechaInicio, formato: FORMATOS[torneo.formato].titulo, mejorDe: torneo.mejorDe, finalizado, premios: evento.premios, conPuntos },
              filas: filasConNombre,
            });
            return { blob, nombre: nombreArchivoResultados(evento.nombre) };
          }}
        />
      </div>
      {!finalizado && <p className="text-sm text-muted-foreground">Los puestos se completan a medida que se juegan los combates.</p>}
      <ClasificacionTorneo filas={filas} nombres={nombres} conPuntos={conPuntos} />
    </section>
  );
}

type PropsImpresion = { titulo: string; evento: string; fecha: string; negocio: string; filas: (FilaClasificacion & { nombre: string })[]; conPuntos: boolean };

function Impresion({ titulo, evento, fecha, negocio, filas, conPuntos }: PropsImpresion) {
  const celda = { padding: 4, textAlign: "right" as const };
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#000" }}>
      <p style={{ fontSize: 13, fontWeight: 700 }}>{negocio}</p>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 2px" }}>
        {titulo} · {evento}
      </h1>
      <p style={{ fontSize: 11 }}>Torneo de pulseada · {fechaCorta(fecha)}</p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #000", textAlign: "left" }}>
            <th style={{ padding: 4 }}>#</th>
            <th style={{ padding: 4 }}>Competidor</th>
            <th style={celda}>V</th>
            <th style={celda}>D</th>
            <th style={celda}>Asaltos</th>
            {conPuntos && <th style={celda}>Pts</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.competidor} style={{ borderBottom: "1px solid #ccc", fontWeight: f.posicion && f.posicion <= 3 ? 700 : 400 }}>
              <td style={{ padding: 4 }}>{f.posicion ?? "—"}</td>
              <td style={{ padding: 4 }}>{f.nombre}</td>
              <td style={celda}>{f.victorias}</td>
              <td style={celda}>{f.derrotas}</td>
              <td style={celda}>
                {f.asaltosFavor}–{f.asaltosContra}
              </td>
              {conPuntos && <td style={celda}>{f.puntos}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
