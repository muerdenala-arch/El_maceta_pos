/**
 * Torneo de Pulseada contra la base en memoria: los 3 formatos de punta a punta, reglas (cédula única,
 * sin inscripciones después del sorteo, marcador al mejor de 3, W.O., bajas, correcciones y bloqueo al
 * finalizar) y auditoría.
 */
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { beforeAll, describe, expect, it } from "vitest";
import {
  corregirCombate,
  crearTorneo,
  darDeBajaCompetidor,
  editarCompetidor,
  finalizarTorneo,
  inscribirCompetidor,
  registrarAusencia,
  registrarCombate,
  sortearTorneo,
} from "@/app/admin/eventos/torneo-acciones";
import { guardarPesajes, inscribirParticipante } from "@/app/admin/eventos/acciones";
import { GET as excel } from "@/app/api/admin/eventos/[id]/excel/route";
import { db } from "@/db";
import { auditoria, combates, eventos } from "@/db/schema";
import { clasificacion, porJugar, torneoCompleto, type Formato } from "@/lib/eventos/pulseada";
import { estadoTorneo } from "@/lib/eventos/torneo-datos";
import { comoUsuario, prepararBase, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
  await comoUsuario(b.admin);
});

const ok = <T,>(r: { ok: true; datos: T } | { ok: false; error: string }) => {
  if (!r.ok) throw new Error(r.error);
  return r.datos;
};

let ci = 3000000;
async function torneoCon(formato: Formato, n: number) {
  const { id } = ok(await crearTorneo({ nombre: `Torneo ${formato}`, fechaInicio: "2026-10-10", formato, mejorDe: 3, puntosVictoria: 1, sucursalId: null }));
  const competidores: number[] = [];
  for (let i = 1; i <= n; i++) {
    competidores.push(ok(await inscribirCompetidor({ eventoId: id, nombreCompleto: `Competidor ${i}`, cedulaIdentidad: String(++ci), telefono: `7${String(ci).slice(-7)}`, aceptaParticipar: true })).id);
  }
  return { id, competidores };
}

const idCombate = async (eventoId: number, clave: string) =>
  (await db.select({ id: combates.id, clave: combates.clave }).from(combates).where(eq(combates.eventoId, eventoId))).find((f) => f.clave === clave)!.id;

/** Juega todo desde la "mesa": gana siempre quien se inscribió primero (id menor), 2–1. */
async function jugarTodo(id: number) {
  for (let guarda = 0; guarda < 100; guarda++) {
    const e = (await estadoTorneo(id))!;
    const [c] = porJugar(e.llaves);
    if (!c) return e;
    const ganaA = c.a! < c.b!;
    ok(await registrarCombate({ id: await idCombate(id, c.clave), asaltosA: ganaA ? 2 : 1, asaltosB: ganaA ? 1 : 2, faltasA: 0, faltasB: 1 }));
  }
  throw new Error("no terminó");
}

describe("Torneo de Pulseada", () => {
  it.each<[Formato, number]>([
    ["eliminacion_directa", 6],
    ["doble_eliminacion", 5],
    ["todos_contra_todos", 4],
  ])("%s con %i competidores: sorteo, combates, finalizar y podio", async (formato, n) => {
    const { id, competidores } = await torneoCon(formato, n);
    expect((await sortearTorneo({ id })).ok).toBe(true);
    expect((await db.select().from(eventos).where(eq(eventos.id, id)))[0].estado).toBe("en_curso");

    // No se puede finalizar a medias.
    expect(await finalizarTorneo({ id })).toEqual({ ok: false, error: "Todavía hay combates sin resultado" });

    const e = await jugarTodo(id);
    expect(torneoCompleto(e.llaves)).toBe(true);
    expect(await finalizarTorneo({ id })).toEqual({ ok: true });
    const t = clasificacion({ formato, combates: e.llaves, competidores, puntosVictoria: 1 });
    expect(t[0]).toMatchObject({ competidor: competidores[0], posicion: 1 });
    expect(t[1].posicion).toBe(2);

    // Finalizado: resultados bloqueados.
    const cualquiera = (await db.select({ id: combates.id }).from(combates).where(eq(combates.eventoId, id)))[0].id;
    expect(await registrarCombate({ id: cualquiera, asaltosA: 2, asaltosB: 0, faltasA: 0, faltasB: 0 })).toEqual({
      ok: false,
      error: "El torneo está finalizado: los resultados ya no se modifican",
    });
  });

  it("cédula única, sin inscripciones después del sorteo y las acciones del reto no aplican a torneos", async () => {
    const { id } = await torneoCon("eliminacion_directa", 3);
    const repetida = await inscribirCompetidor({ eventoId: id, nombreCompleto: "Otro", cedulaIdentidad: String(ci), telefono: "71111111", aceptaParticipar: true });
    expect(repetida).toMatchObject({ ok: false, campos: { cedulaIdentidad: expect.any(String) } });
    ok(await sortearTorneo({ id }));
    const tarde = await inscribirCompetidor({ eventoId: id, nombreCompleto: "Tardío", cedulaIdentidad: "9999991", telefono: "71111112", aceptaParticipar: true });
    expect(tarde).toEqual({ ok: false, error: "Las llaves ya se sortearon: no se inscriben más competidores" });
    expect((await inscribirParticipante({ eventoId: id, nombreCompleto: "X", cedulaIdentidad: "9999992", telefono: "71111113", pesoInicial: "80", aceptaParticipar: true })).ok).toBe(false);
    expect((await guardarPesajes({ eventoId: id, fecha: "2026-10-10", esPesajeFinal: false, confirmarCambios: true, lineas: [{ participanteId: 1, peso: "80" }] })).ok).toBe(false);
  });

  it("marcador inválido, W.O. por ausencia, corrección bloqueada si ya se jugó lo siguiente", async () => {
    const { id, competidores } = await torneoCon("eliminacion_directa", 4);
    ok(await sortearTorneo({ id }));
    let e = (await estadoTorneo(id))!;
    const [primero, segundo] = porJugar(e.llaves);
    const idPrimero = await idCombate(id, primero.clave);
    expect(await registrarCombate({ id: idPrimero, asaltosA: 2, asaltosB: 2, faltasA: 0, faltasB: 0 })).toEqual({
      ok: false,
      error: "Marcador inválido: al mejor de 3, gana quien llega a 2 asaltos",
    });
    ok(await registrarCombate({ id: idPrimero, asaltosA: 2, asaltosB: 0, faltasA: 1, faltasB: 0 }));
    ok(await registrarAusencia({ id: await idCombate(id, segundo.clave), ausente: "a" }));
    e = (await estadoTorneo(id))!;
    const final = e.llaves.find((c) => c.clave === "G2-1")!;
    expect(final.a).toBe(primero.a);
    expect(final.b).toBe(segundo.b); // ganó por W.O.
    expect(e.llaves.find((c) => c.clave === segundo.clave)).toMatchObject({ walkover: true });

    // Corregir el primero (todavía no se jugó la final): el otro pasa a la final.
    ok(await corregirCombate({ id: idPrimero, asaltosA: 1, asaltosB: 2, faltasA: 0, faltasB: 0, motivo: "Se anotó al revés" }));
    e = (await estadoTorneo(id))!;
    expect(e.llaves.find((c) => c.clave === "G2-1")!.a).toBe(primero.b);

    // Se juega la final: ya no se puede cambiar quién llegó a ella.
    ok(await registrarCombate({ id: await idCombate(id, "G2-1"), asaltosA: 2, asaltosB: 1, faltasA: 0, faltasB: 0 }));
    const r = await corregirCombate({ id: idPrimero, asaltosA: 2, asaltosB: 0, faltasA: 0, faltasB: 0, motivo: "Otra vez" });
    expect(r.ok === false && r.error).toMatch(/ya se jugó con otros competidores/);
    const [a] = await db.select().from(auditoria).where(eq(auditoria.accion, "combate_corregido"));
    expect(a.detalle).toMatchObject({ antes: "2-0", despues: "1-2", motivo: "Se anotó al revés" });
    expect(competidores).toHaveLength(4);
  });

  it("un competidor dado de baja a mitad del torneo pierde por W.O. lo que le queda", async () => {
    const { id, competidores } = await torneoCon("todos_contra_todos", 4);
    ok(await sortearTorneo({ id }));
    ok(await editarCompetidor({ id: competidores[3], nombreCompleto: "Competidor Cuatro", cedulaIdentidad: String(ci), telefono: "71234567", pesoInicial: "82,5" }));
    ok(await darDeBajaCompetidor({ id: competidores[3], motivo: "Se lesionó el brazo" }));
    const e = (await estadoTorneo(id))!;
    const suyos = e.llaves.filter((c) => c.a === competidores[3] || c.b === competidores[3]);
    expect(suyos).toHaveLength(3);
    expect(suyos.every((c) => c.terminado && c.walkover && c.ganador !== competidores[3])).toBe(true);
    expect(porJugar(e.llaves)).toHaveLength(3); // quedan los combates entre los otros 3
  });

  it("se puede volver a sortear mientras no se jugó ningún combate", async () => {
    const { id } = await torneoCon("doble_eliminacion", 4);
    ok(await sortearTorneo({ id }));
    ok(await sortearTorneo({ id }));
    const e = (await estadoTorneo(id))!;
    ok(await registrarCombate({ id: await idCombate(id, porJugar(e.llaves)[0].clave), asaltosA: 2, asaltosB: 0, faltasA: 0, faltasB: 0 }));
    expect(await sortearTorneo({ id })).toEqual({ ok: false, error: "Ya hay combates jugados: el sorteo no se puede repetir" });
  });

  it("Excel del torneo: clasificación con cédula, combates y competidores (solo admin)", async () => {
    const { id, competidores } = await torneoCon("eliminacion_directa", 4);
    ok(await sortearTorneo({ id }));
    await jugarTodo(id);
    const pedir = () => excel(new Request("http://x"), { params: Promise.resolve({ id: String(id) }) });

    await comoUsuario(b.cajeroNorte);
    expect((await pedir()).status).toBe(403);
    await comoUsuario(b.admin);
    const libro = XLSX.read(new Uint8Array(await (await pedir()).arrayBuffer()));
    expect(libro.SheetNames).toEqual(["Clasificación", "Combates", "Competidores"]);
    const [primera] = XLSX.utils.sheet_to_json<Record<string, unknown>>(libro.Sheets["Clasificación"], { range: 2 });
    expect(primera).toMatchObject({ Posición: 1, Nombre: "Competidor 1", Victorias: 2, Derrotas: 0 });
    expect(primera.Cédula).toBeTruthy();
    // 2 semifinales + 3.er lugar + final.
    expect(XLSX.utils.sheet_to_json(libro.Sheets.Combates)).toHaveLength(4);
    expect(XLSX.utils.sheet_to_json(libro.Sheets.Competidores)).toHaveLength(competidores.length);
  });
});
