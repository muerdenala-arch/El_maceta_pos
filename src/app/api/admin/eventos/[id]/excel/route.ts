import * as XLSX from "xlsx";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { eventos } from "@/db/schema";
import { obtenerSesion } from "@/lib/auth/sesion";
import { aCentikg, tablaPosiciones } from "@/lib/eventos/calculos";
import { obtenerEvento, participantesDe, pesajesDe } from "@/lib/eventos/consultas";

/**
 * Excel del reto para el administrador (incluye cédula y teléfono, a diferencia del PDF público).
 * Hojas: Resultados, Pesajes y Participantes (con las bajas). Solo admin: proxy + verificación aquí.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/admin/eventos/[id]/excel">) {
  const sesion = await obtenerSesion();
  if (!sesion) return Response.json({ error: "Sesión vencida" }, { status: 401 });
  if (sesion.rol !== "admin") return Response.json({ error: "Sin permiso" }, { status: 403 });

  const id = Number((await ctx.params).id);
  const [tipo] = Number.isInteger(id) && id > 0 ? await db.select({ t: eventos.tipoJuego }).from(eventos).where(eq(eventos.id, id)) : [];
  const evento = tipo ? await obtenerEvento(id, tipo.t) : null;
  if (!evento) return Response.json({ error: "No existe" }, { status: 404 });

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
  const archivo = XLSX.write(libro, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
  const nombre = `reto-${evento.nombre.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.xlsx`;
  return new Response(new Uint8Array(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
