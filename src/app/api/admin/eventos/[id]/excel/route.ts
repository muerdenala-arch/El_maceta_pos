import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventos } from "@/db/schema";
import { obtenerSesion } from "@/lib/auth/sesion";
import { aCentikg, tablaPosiciones } from "@/lib/eventos/calculos";
import { obtenerEvento, participantesDe, pesajesDe, type ParticipanteListado } from "@/lib/eventos/consultas";
import { clasificacion, competidoresEnLlaves, nombreRonda } from "@/lib/eventos/pulseada";
import { FORMATOS } from "@/lib/eventos/textos-torneo";
import { estadoTorneo } from "@/lib/eventos/torneo-datos";

/**
 * Excel del reto para el administrador (incluye cédula y teléfono, a diferencia del PDF público).
 * Reto: Resultados, Pesajes y Participantes (con las bajas). Torneo: Clasificación, Combates y Competidores.
 * Solo admin: proxy + verificación aquí.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/eventos/[id]/excel">) {
  const sesion = await obtenerSesion();
  if (!sesion) return Response.json({ error: "Sesión vencida" }, { status: 401 });
  if (sesion.rol !== "admin") return Response.json({ error: "Sin permiso" }, { status: 403 });

  const id = Number((await ctx.params).id);
  const [tipo] = Number.isInteger(id) && id > 0 ? await db.select({ t: eventos.tipoJuego }).from(eventos).where(eq(eventos.id, id)) : [];
  const evento = tipo ? await obtenerEvento(id, tipo.t) : null;
  if (!evento) return Response.json({ error: "No existe" }, { status: 404 });

  if (evento.tipoJuego === "torneo_pulseada") return excelTorneo(id, evento.nombre, await participantesDe(id));

  const [participantes, pesajes] = await Promise.all([participantesDe(id), pesajesDe(id)]);
  const activos = participantes.filter((p) => p.activo);
  const filas = tablaPosiciones({
    participantes: activos.map((p) => ({ id: p.id, nombre: p.nombreCompleto, pesoInicial: p.pesoInicial })),
    pesajes,
    criterio: evento.criterioGanador,
    finalizado: evento.estado === "finalizado",
  });
  const porId = new Map(participantes.map((p) => [p.id, p]));
  const kg = (c: number | null) => (c === null ? null : c / 100);

  const resultados = XLSX.utils.aoa_to_sheet([
    ["Posición", "Nombre", "Cédula", "Celular", "Peso inicial (kg)", "Peso actual (kg)", "Kilos perdidos", "% perdido", "Estado"],
    ...filas.map((f) => [
      f.posicion,
      f.nombre,
      porId.get(f.participanteId)?.cedulaIdentidad ?? "",
      porId.get(f.participanteId)?.telefono ?? "",
      kg(f.pesoInicial),
      kg(f.pesoActual),
      kg(f.kilos),
      f.porcentaje === null ? null : f.porcentaje / 100,
      f.estado === "clasificado" ? "" : f.estado === "no_completo" ? "No completó" : "Sin pesaje",
    ]),
  ]);
  const nombres = new Map(participantes.map((p) => [p.id, p.nombreCompleto]));
  const hojaPesajes = XLSX.utils.aoa_to_sheet([
    ["Fecha", "Participante", "Peso (kg)", "Final", "Nota"],
    ...pesajes.map((x) => [x.fecha.split("-").reverse().join("/"), nombres.get(x.participanteId) ?? "", aCentikg(x.peso) / 100, x.esPesajeFinal ? "Sí" : "", x.nota ?? ""]),
  ]);
  const hojaParticipantes = XLSX.utils.aoa_to_sheet([
    ["Nombre", "Cédula", "Celular", "Peso inicial (kg)", "Inscripción", "Estado", "Motivo de baja"],
    ...participantes.map((p) => [
      p.nombreCompleto,
      p.cedulaIdentidad,
      p.telefono,
      aCentikg(p.pesoInicial) / 100,
      new Date(p.fechaInscripcion).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" }),
      p.activo ? "Activo" : "De baja",
      p.motivoBaja ?? "",
    ]),
  ]);
  resultados["!cols"] = [8, 28, 16, 12, 16, 16, 14, 11, 14].map((wch) => ({ wch }));
  hojaPesajes["!cols"] = [12, 28, 10, 7, 40].map((wch) => ({ wch }));
  hojaParticipantes["!cols"] = [28, 16, 12, 16, 12, 10, 30].map((wch) => ({ wch }));

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, resultados, "Resultados");
  XLSX.utils.book_append_sheet(libro, hojaPesajes, "Pesajes");
  XLSX.utils.book_append_sheet(libro, hojaParticipantes, "Participantes");
  return descarga(libro, `reto-${slug(evento.nombre)}.xlsx`);
}

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

async function excelTorneo(id: number, nombreEvento: string, participantes: ParticipanteListado[]) {
  const t = await estadoTorneo(id);
  if (!t) return Response.json({ error: "No existe" }, { status: 404 });
  const { torneo, llaves } = t;
  const conPuntos = torneo.formato === "todos_contra_todos";
  const porId = new Map(participantes.map((p) => [p.id, p]));
  const nombre = (x: number | null) => (x === null ? "" : (porId.get(x)?.nombreCompleto ?? ""));
  const filas = clasificacion({
    formato: torneo.formato,
    combates: llaves,
    competidores: competidoresEnLlaves(llaves),
    retirados: participantes.filter((p) => !p.activo).map((p) => p.id),
    puntosVictoria: torneo.puntosVictoria,
  });

  const hojaClasificacion = XLSX.utils.aoa_to_sheet([
    [`${nombreEvento} · ${FORMATOS[torneo.formato].titulo} · al mejor de ${torneo.mejorDe}`],
    [],
    ["Posición", "Nombre", "Cédula", "Celular", "Jugados", "Victorias", "Derrotas", "Asaltos a favor", "Asaltos en contra", "Faltas", ...(conPuntos ? ["Puntos"] : []), "Estado"],
    ...filas.map((f) => [
      f.posicion,
      nombre(f.competidor),
      porId.get(f.competidor)?.cedulaIdentidad ?? "",
      porId.get(f.competidor)?.telefono ?? "",
      f.jugados,
      f.victorias,
      f.derrotas,
      f.asaltosFavor,
      f.asaltosContra,
      f.faltas,
      ...(conPuntos ? [f.puntos] : []),
      f.retirado ? "Retirado" : f.eliminado ? "Eliminado" : "",
    ]),
  ]);
  const rondasG = Math.max(0, ...llaves.filter((c) => c.fase === "ganadores").map((c) => c.ronda));
  const orden = ["ganadores", "perdedores", "liga", "tercer_lugar", "gran_final", "desempate"];
  const jugados = llaves
    .filter((c) => c.terminado && !(c.paseLibre && c.a === null && c.b === null))
    .sort((x, y) => orden.indexOf(x.fase) - orden.indexOf(y.fase) || x.ronda - y.ronda || x.orden - y.orden);
  const hojaCombates = XLSX.utils.aoa_to_sheet([
    ["Ronda", "Competidor A", "Competidor B", "Asaltos A", "Asaltos B", "Faltas A", "Faltas B", "Ganador", "Nota"],
    ...jugados.map((c) => [
      nombreRonda(c, rondasG, torneo.formato),
      c.a === null ? "Pase libre" : nombre(c.a),
      c.b === null ? "Pase libre" : nombre(c.b),
      c.paseLibre ? null : c.asaltosA,
      c.paseLibre ? null : c.asaltosB,
      c.paseLibre ? null : c.faltasA,
      c.paseLibre ? null : c.faltasB,
      nombre(c.ganador),
      c.paseLibre ? "Pase libre" : c.walkover ? "W.O." : "",
    ]),
  ]);
  const hojaCompetidores = XLSX.utils.aoa_to_sheet([
    ["Nombre", "Cédula", "Celular", "Peso (kg)", "Inscripción", "Estado", "Motivo de baja"],
    ...participantes.map((p) => [
      p.nombreCompleto,
      p.cedulaIdentidad,
      p.telefono,
      p.pesoInicial === null ? null : aCentikg(p.pesoInicial) / 100,
      new Date(p.fechaInscripcion).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" }),
      p.activo ? "Activo" : "De baja",
      p.motivoBaja ?? "",
    ]),
  ]);
  hojaClasificacion["!cols"] = [9, 28, 16, 12, 8, 9, 9, 10, 10, 7, 8, 11].map((wch) => ({ wch }));
  hojaCombates["!cols"] = [22, 28, 28, 9, 9, 8, 8, 28, 10].map((wch) => ({ wch }));
  hojaCompetidores["!cols"] = [28, 16, 12, 10, 12, 10, 30].map((wch) => ({ wch }));

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hojaClasificacion, "Clasificación");
  XLSX.utils.book_append_sheet(libro, hojaCombates, "Combates");
  XLSX.utils.book_append_sheet(libro, hojaCompetidores, "Competidores");
  return descarga(libro, `torneo-${slug(nombreEvento)}.xlsx`);
}

function descarga(libro: XLSX.WorkBook, nombre: string) {
  const archivo = XLSX.write(libro, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
