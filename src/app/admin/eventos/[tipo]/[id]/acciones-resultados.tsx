"use client";

import { CompartirResultados, type MensajePersonal } from "@/components/eventos/compartir-resultados";
import { cargarPdfEventos } from "@/lib/eventos/cargar-pdf";
import { textoKilos, textoPorcentaje, type FilaPosicion } from "@/lib/eventos/calculos";
import type { DetalleRetoProps } from "./tipos";

const fechaCorta = (f: string) => f.split("-").reverse().join("/");

type Props = Pick<DetalleRetoProps, "evento" | "participantes" | "negocio"> & { filas: FilaPosicion[] };

/** Imprimir, PDF, Excel y WhatsApp de los resultados del reto (componente común de eventos). */
export function AccionesResultados(props: Props) {
  const { evento, negocio, participantes, filas } = props;
  const telefonos = new Map(participantes.map((p) => [p.id, p.telefono]));
  const enlace = typeof window === "undefined" ? "" : `${window.location.origin}/eventos/${evento.tokenPublico}`;
  const mensajes: MensajePersonal[] = filas.map((f) => {
    const resultado =
      f.posicion === null
        ? "No llegaste a registrar tu pesaje final, pero gracias por ser parte."
        : `Quedaste en el puesto ${f.posicion} con ${textoKilos(f.kilos!)} perdidos (${textoPorcentaje(f.porcentaje!)} de tu peso inicial).`;
    return {
      id: f.participanteId,
      nombre: f.nombre,
      posicion: f.posicion,
      telefono: telefonos.get(f.participanteId) ?? "",
      texto: `¡Hola ${f.nombre.split(" ")[0]}! Terminó el reto «${evento.nombre}» de ${negocio.nombre}. ${resultado} ¡Gracias por participar! Resultados: ${enlace}`,
    };
  });
  return (
    <CompartirResultados
      evento={evento}
      negocio={negocio}
      excelHref={`/api/admin/eventos/${evento.id}/excel`}
      impresion={<Impresion {...props} />}
      mensajes={mensajes}
      generarPdf={async () => {
        const { generarPdfResultados, nombreArchivoResultados } = await cargarPdfEventos();
        const blob = await generarPdfResultados({ negocio, evento: { ...evento, finalizado: evento.estado === "finalizado" }, filas });
        return { blob, nombre: nombreArchivoResultados(evento.nombre) };
      }}
    />
  );
}

/** Versión para imprimir: blanco y negro, sin datos personales. */
function Impresion({ evento, negocio, filas }: Props) {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: "#000" }}>
      <p style={{ fontSize: 13, fontWeight: 700 }}>{negocio.nombre}</p>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: "6px 0 2px" }}>
        {evento.estado === "finalizado" ? "Resultados finales" : "Posiciones parciales"} · {evento.nombre}
      </h1>
      <p style={{ fontSize: 11 }}>
        Del {fechaCorta(evento.fechaInicio)} al {fechaCorta(evento.fechaFin)} · Gana por{" "}
        {evento.criterioGanador === "porcentaje" ? "porcentaje de peso perdido" : "kilos perdidos"}
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #000", textAlign: "left" }}>
            <th style={{ padding: 4 }}>#</th>
            <th style={{ padding: 4 }}>Participante</th>
            <th style={{ padding: 4, textAlign: "right" }}>Kilos perdidos</th>
            <th style={{ padding: 4, textAlign: "right" }}>% perdido</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.participanteId} style={{ borderBottom: "1px solid #ccc", fontWeight: f.posicion && f.posicion <= 3 ? 700 : 400 }}>
              <td style={{ padding: 4 }}>{f.posicion ?? "—"}</td>
              <td style={{ padding: 4 }}>{f.nombre}</td>
              {f.kilos === null ? (
                <td colSpan={2} style={{ padding: 4, textAlign: "right" }}>
                  {f.estado === "no_completo" ? "No completó" : "Sin pesaje"}
                </td>
              ) : (
                <>
                  <td style={{ padding: 4, textAlign: "right" }}>{textoKilos(f.kilos)}</td>
                  <td style={{ padding: 4, textAlign: "right" }}>{textoPorcentaje(f.porcentaje!)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
