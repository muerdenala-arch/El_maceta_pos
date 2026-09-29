/**
 * Módulo Eventos contra la base en memoria: flujo completo de un Reto Transformación de 21 días con
 * 10 participantes, 3 pesajes intermedios y uno final; reglas (cédula única, bloqueo al finalizar,
 * confirmación de cambios > 10 %), auditoría, alerta de la campanita y datos públicos sin cédula ni teléfono.
 */
import { and, eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { beforeAll, describe, expect, it } from "vitest";
import {
  corregirPesaje,
  crearReto,
  darDeBajaParticipante,
  editarParticipante,
  finalizarReto,
  guardarPesajes,
  iniciarReto,
  inscribirParticipante,
} from "@/app/admin/eventos/acciones";
import { GET as excel } from "@/app/api/admin/eventos/[id]/excel/route";
import { db } from "@/db";
import { alertas, auditoria, eventos, pesajes } from "@/db/schema";
import { conciliarAlertasEventos } from "@/lib/eventos/alertas";
import { tablaPosiciones } from "@/lib/eventos/calculos";
import { eventoPublico, obtenerEvento, participantesDe, pesajesDe } from "@/lib/eventos/consultas";
import { comoUsuario, prepararBase, type Base } from "./base";

let b: Base;
let retoId: number;
const ids: Record<string, number> = {};

/** 10 participantes: nombre, cédula, celular, peso inicial y pesos de las 4 jornadas (3 intermedias + final). */
const PARTICIPANTES = [
  ["Ana Rojas", "1000001", "71000001", "100", ["98", "96", "94", "90"]], // −10 kg · 10,00 %
  ["Bruno Salas", "1000002", "71000002", "80", ["79", "78", "76", "72"]], // −8 kg · 10,00 % (empata % con Ana, menos kilos)
  ["Carla Vaca", "1000003", "71000003", "60", ["59", "57", "56", "54.6"]], // −5,4 kg · 9,00 %
  ["Diego Paz", "1000004", "71000004", "120", ["118", "115", "112", "110"]], // −10 kg · 8,33 %
  ["Elena Cruz", "1000005", "71000005", "70", ["69", "68", "67", "66"]], // −4 kg · 5,71 %
  ["Fabio Luna", "1000006", "71000006", "90", ["89", "88", "87.5", "86"]], // −4 kg · 4,44 %
  ["Gina Mendez", "1000007", "71000007", "65", ["64", "63.5", "63", "62"]], // −3 kg · 4,62 %
  ["Hugo Arce", "1000008", "71000008", "110", ["109", "108", "107", "106"]], // −4 kg · 3,64 %
  ["Iris Soto", "1000009", "71000009", "55", ["55", "54.5", "54", "53"]], // −2 kg · 3,64 %
  ["Juan Toro", "1000010", "71000010", "95", ["94", "93", "92", "91"]], // −4 kg · 4,21 %
] as const;
const JORNADAS = ["2026-10-07", "2026-10-14", "2026-10-20", "2026-10-21"];

beforeAll(async () => {
  b = await prepararBase();
});

const ok = <T,>(r: { ok: true; datos: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.datos;
};

describe("Reto Transformación: flujo completo", () => {
  it("crea un reto de 21 días (fecha de fin calculada) e inscribe 10 participantes", async () => {
    await comoUsuario(b.admin);
    retoId = ok(
      await crearReto({
        nombre: "Reto Octubre",
        descripcion: "21 días",
        fechaInicio: "2026-10-01",
        duracionDias: 21,
        criterioGanador: "porcentaje",
        sucursalId: b.norte.id,
        premios: "1.º: suplementos por un mes",
      }),
    ).id;
    const e = await obtenerEvento(retoId, "reto_transformacion");
    expect(e).toMatchObject({ estado: "borrador", fechaFin: "2026-10-21", criterioGanador: "porcentaje" });

    for (const [nombre, ci, tel, peso] of PARTICIPANTES) {
      ids[nombre] = ok(
        await inscribirParticipante({ eventoId: retoId, nombreCompleto: nombre, cedulaIdentidad: ci, telefono: tel, pesoInicial: peso, aceptaParticipar: true }),
      ).id;
    }
    expect(await participantesDe(retoId)).toHaveLength(10);
  });

  it("la cédula no se repite dentro del mismo reto (sí en otro reto)", async () => {
    await comoUsuario(b.admin);
    const repetida = await inscribirParticipante({
      eventoId: retoId,
      nombreCompleto: "Otra Persona",
      cedulaIdentidad: "1000001",
      telefono: "72000000",
      pesoInicial: "70",
      aceptaParticipar: true,
    });
    expect(repetida).toMatchObject({ ok: false, campos: { cedulaIdentidad: "Ya hay un participante con esta cédula en este reto" } });

    const otroReto = ok(await crearReto({ nombre: "Reto Noviembre", fechaInicio: "2026-11-01", duracionDias: 30, criterioGanador: "kilos", sucursalId: null }));
    const enOtro = await inscribirParticipante({ eventoId: otroReto.id, nombreCompleto: "Ana Rojas", cedulaIdentidad: "1000001", telefono: "71000001", pesoInicial: "90", aceptaParticipar: true });
    expect(enOtro.ok).toBe(true);

    // Al editar tampoco se puede usar la cédula de otro participante del reto.
    const edicion = await editarParticipante({ id: ids["Bruno Salas"], nombreCompleto: "Bruno Salas", cedulaIdentidad: "1000001", telefono: "71000002", pesoInicial: "80" });
    expect(edicion).toMatchObject({ ok: false, campos: { cedulaIdentidad: expect.any(String) } });
  });

  it("sin iniciar no se registran pesajes; al iniciar pasa a 'en curso'", async () => {
    await comoUsuario(b.admin);
    const antes = await guardarPesajes({ eventoId: retoId, fecha: "2026-10-07", esPesajeFinal: false, confirmarCambios: false, lineas: [{ participanteId: ids["Ana Rojas"], peso: "98" }] });
    expect(antes).toEqual({ ok: false, error: "Inicia el reto antes de registrar pesajes" });
    expect(await iniciarReto({ id: retoId })).toEqual({ ok: true });
    expect((await obtenerEvento(retoId, "reto_transformacion"))?.estado).toBe("en_curso");
  });

  it("registra 3 jornadas intermedias y la final, cada una en una sola transacción", async () => {
    await comoUsuario(b.admin);
    for (const [j, fecha] of JORNADAS.entries()) {
      const r = await guardarPesajes({
        eventoId: retoId,
        fecha,
        esPesajeFinal: j === 3,
        confirmarCambios: false,
        lineas: PARTICIPANTES.map(([nombre, , , , pesos]) => ({ participanteId: ids[nombre], peso: pesos[j] })),
      });
      expect(ok(r).guardados).toBe(10);
    }
    expect(await pesajesDe(retoId)).toHaveLength(40);
  });

  it("no acepta un segundo pesaje el mismo día ni un segundo pesaje final", async () => {
    await comoUsuario(b.admin);
    const mismoDia = await guardarPesajes({ eventoId: retoId, fecha: "2026-10-14", esPesajeFinal: false, confirmarCambios: false, lineas: [{ participanteId: ids["Ana Rojas"], peso: "95" }] });
    expect(mismoDia.ok === false && mismoDia.error).toMatch(/ya tiene un pesaje el 14\/10\/2026/);
    const otroFinal = await guardarPesajes({ eventoId: retoId, fecha: "2026-10-22", esPesajeFinal: true, confirmarCambios: false, lineas: [{ participanteId: ids["Ana Rojas"], peso: "90" }] });
    expect(otroFinal.ok === false && otroFinal.error).toMatch(/ya tiene pesaje final/);
  });

  it("un cambio de más de 10 % exige confirmación", async () => {
    await comoUsuario(b.admin);
    const intento = { eventoId: retoId, fecha: "2026-10-22", esPesajeFinal: false, lineas: [{ participanteId: ids["Carla Vaca"], peso: "45" }] };
    const sin = await guardarPesajes({ ...intento, confirmarCambios: false });
    expect(sin).toEqual({ ok: false, error: "Cambios de más de 10 % sin confirmar: Carla Vaca" });
    expect(await pesajesDe(retoId)).toHaveLength(40); // no se guardó nada
  });

  it("corregir un pesaje queda en la auditoría con el valor anterior y quién lo hizo", async () => {
    await comoUsuario(b.admin);
    const [p] = await db.select().from(pesajes).where(and(eq(pesajes.participanteId, ids["Hugo Arce"]), eq(pesajes.fecha, "2026-10-07")));
    expect(await corregirPesaje({ id: p.id, peso: "109.5", motivo: "Se anotó mal" })).toEqual({ ok: true });
    const [a] = await db.select().from(auditoria).where(eq(auditoria.accion, "pesaje_corregido"));
    expect(a.usuarioId).toBe(b.admin.id);
    expect(a.detalle).toMatchObject({ antes: "109.00", despues: "109.50", participante: "Hugo Arce", motivo: "Se anotó mal" });
  });

  it("la tabla y el podio son correctos (por %; en empate de % gana quien bajó más kilos)", async () => {
    const participantes = (await participantesDe(retoId)).map((p) => ({ id: p.id, nombre: p.nombreCompleto, pesoInicial: p.pesoInicial }));
    const t = tablaPosiciones({ participantes, pesajes: await pesajesDe(retoId), criterio: "porcentaje", finalizado: false });
    expect(t.map((f) => [f.posicion, f.nombre, f.kilos, f.porcentaje])).toEqual([
      [1, "Ana Rojas", 1000, 1000],
      [2, "Bruno Salas", 800, 1000],
      [3, "Carla Vaca", 540, 900],
      [4, "Diego Paz", 1000, 833],
      [5, "Elena Cruz", 400, 571],
      [6, "Gina Mendez", 300, 462],
      [7, "Fabio Luna", 400, 444],
      [8, "Juan Toro", 400, 421],
      [9, "Hugo Arce", 400, 364], // 3,636… → 3,64 (le gana a Iris en kilos)
      [10, "Iris Soto", 200, 364],
    ]);
    // Con criterio "kilos" el orden cambia: Ana y Diego (10 kg) empatan en kilos y decide el %.
    const porKilos = tablaPosiciones({ participantes, pesajes: await pesajesDe(retoId), criterio: "kilos", finalizado: false });
    expect(porKilos.slice(0, 3).map((f) => [f.posicion, f.nombre])).toEqual([
      [1, "Ana Rojas"],
      [2, "Diego Paz"],
      [3, "Bruno Salas"],
    ]);
  });

  it("al cumplirse la duración aparece la alerta en la campanita", async () => {
    await db.update(eventos).set({ fechaInicio: "2026-01-01" }).where(eq(eventos.id, retoId)); // fecha_fin pasa a 21/01/2026
    await conciliarAlertasEventos();
    const [a] = await db.select().from(alertas).where(and(eq(alertas.tipo, "evento_por_finalizar"), eq(alertas.resuelta, false)));
    expect(a).toMatchObject({ eventoId: retoId });
    expect(a.mensaje).toMatch(/Reto Octubre/);
    await db.update(eventos).set({ fechaInicio: "2026-10-01" }).where(eq(eventos.id, retoId));
  });

  it("finalizar con participantes sin pesaje final pide confirmar; luego quedan como 'No completó'", async () => {
    await comoUsuario(b.admin);
    const nuevo = ok(
      await inscribirParticipante({ eventoId: retoId, nombreCompleto: "Karen Tardía", cedulaIdentidad: "1000011", telefono: "71000011", pesoInicial: "75", aceptaParticipar: true }),
    );
    const sinForzar = await finalizarReto({ id: retoId, forzar: false });
    expect(sinForzar).toEqual({ ok: false, error: "1 participante sin pesaje final: Karen Tardía" });
    expect(ok(await finalizarReto({ id: retoId, forzar: true })).sinFinal).toEqual([]);

    const participantes = (await participantesDe(retoId)).map((p) => ({ id: p.id, nombre: p.nombreCompleto, pesoInicial: p.pesoInicial }));
    const t = tablaPosiciones({ participantes, pesajes: await pesajesDe(retoId), criterio: "porcentaje", finalizado: true });
    expect(t.slice(0, 3).map((f) => f.nombre)).toEqual(["Ana Rojas", "Bruno Salas", "Carla Vaca"]);
    expect(t.at(-1)).toMatchObject({ participanteId: nuevo.id, posicion: null, estado: "no_completo" });
    // La alerta de la campanita se resolvió sola.
    expect(await db.select().from(alertas).where(and(eq(alertas.tipo, "evento_por_finalizar"), eq(alertas.resuelta, false)))).toHaveLength(0);
  });

  it("con el reto finalizado no se registran ni corrigen pesajes, ni se inscribe o da de baja a nadie", async () => {
    await comoUsuario(b.admin);
    const pesaje = await guardarPesajes({ eventoId: retoId, fecha: "2026-10-25", esPesajeFinal: false, confirmarCambios: true, lineas: [{ participanteId: ids["Iris Soto"], peso: "52" }] });
    expect(pesaje).toEqual({ ok: false, error: "El reto está finalizado: los pesajes ya no se modifican" });
    const [p] = await db.select().from(pesajes).where(eq(pesajes.participanteId, ids["Ana Rojas"]));
    expect(await corregirPesaje({ id: p.id, peso: "99", motivo: "Intento tardío" })).toEqual({ ok: false, error: "El reto está finalizado: los pesajes ya no se modifican" });
    expect((await inscribirParticipante({ eventoId: retoId, nombreCompleto: "Tarde", cedulaIdentidad: "1000099", telefono: "71000099", pesoInicial: "70", aceptaParticipar: true })).ok).toBe(false);
    expect((await darDeBajaParticipante({ id: ids["Iris Soto"], motivo: "Intento tardío" })).ok).toBe(false);
    expect(await pesajesDe(retoId)).toHaveLength(40);
  });

  it("auditoría de creación, inscripciones, ediciones y bajas", async () => {
    await comoUsuario(b.admin);
    const otro = ok(await crearReto({ nombre: "Reto Diciembre", fechaInicio: "2026-12-01", duracionDias: 30, criterioGanador: "porcentaje", sucursalId: null }));
    const p = ok(await inscribirParticipante({ eventoId: otro.id, nombreCompleto: "Luis Rivas", cedulaIdentidad: "2000001", telefono: "+591 7200-0001", pesoInicial: "88,4", aceptaParticipar: true }));
    expect(await editarParticipante({ id: p.id, nombreCompleto: "Luis Rivas Soria", cedulaIdentidad: "2000001", telefono: "72000001", pesoInicial: "88.4" })).toEqual({ ok: true });
    expect(await darDeBajaParticipante({ id: p.id, motivo: "Se mudó de ciudad" })).toEqual({ ok: true });
    const acciones = (await db.select({ a: auditoria.accion }).from(auditoria)).map((x) => x.a);
    for (const a of ["evento_creado", "evento_iniciado", "participante_inscrito", "participante_editado", "participante_baja", "pesajes_registrados", "pesaje_corregido", "evento_finalizado"]) {
      expect(acciones).toContain(a);
    }
    const [edicion] = await db.select().from(auditoria).where(eq(auditoria.accion, "participante_editado"));
    expect(edicion.detalle).toMatchObject({ cambios: { nombreCompleto: { antes: "Luis Rivas", despues: "Luis Rivas Soria" } } });
  });

  it("la vista pública no expone cédula ni teléfono; el Excel del admin sí los incluye", async () => {
    const [e] = await db.select({ token: eventos.tokenPublico }).from(eventos).where(eq(eventos.id, retoId));
    const publico = await eventoPublico(e.token);
    const texto = JSON.stringify(publico);
    expect(texto).not.toMatch(/1000001|71000001|cedula|telefono/i);
    expect(publico?.participantes).toHaveLength(11);

    await comoUsuario(b.cajeroNorte);
    expect((await excel(new Request("http://x"), { params: Promise.resolve({ id: String(retoId) }) })).status).toBe(403);
    await comoUsuario(b.admin);
    const r = await excel(new Request("http://x"), { params: Promise.resolve({ id: String(retoId) }) });
    const libro = XLSX.read(new Uint8Array(await r.arrayBuffer()));
    expect(libro.SheetNames).toEqual(["Resultados", "Pesajes", "Participantes"]);
    const [primera] = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets.Resultados);
    expect(primera).toMatchObject({ Posición: 1, Nombre: "Ana Rojas", Cédula: "1000001", Celular: "71000001", "Kilos perdidos": 10, "% perdido": 10 });
  });
});
