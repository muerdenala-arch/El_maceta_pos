import { describe, expect, it } from "vitest";
import {
  clasificacion,
  ErrorTorneo,
  generarLlaves,
  ordenSiembra,
  porJugar,
  reconstruir,
  torneoCompleto,
  validarMarcador,
  type Formato,
  type Suceso,
} from "./pulseada";

const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** Juega todo el torneo: en cada combate gana quien devuelve `gana(a, b)` (2–1). */
function jugarTodo(formato: Formato, n: number, gana: (a: number, b: number) => number = Math.min, sucesos: Suceso[] = []) {
  for (let guarda = 0; guarda < 500; guarda++) {
    const combates = reconstruir({ formato, sorteo: ids(n), sucesos });
    const [c] = porJugar(combates);
    if (!c) return { combates, sucesos };
    const ganaA = gana(c.a!, c.b!) === c.a;
    sucesos.push({ tipo: "resultado", clave: c.clave, a: c.a!, b: c.b!, asaltosA: ganaA ? 2 : 1, asaltosB: ganaA ? 1 : 2, faltasA: 0, faltasB: 1, walkover: false });
  }
  throw new Error("No terminó");
}

const derrotas = (combates: ReturnType<typeof generarLlaves>, x: number) =>
  combates.filter((c) => c.terminado && !c.paseLibre && (c.a === x || c.b === x) && c.ganador !== x).length;

describe("llaves", () => {
  it("siembra estándar: los primeros no se cruzan hasta el final", () => {
    expect(ordenSiembra(4)).toEqual([1, 4, 2, 3]);
    expect(ordenSiembra(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("marcador al mejor de 3: gana quien llega a 2 asaltos", () => {
    expect(() => validarMarcador(2, 1, 3)).not.toThrow();
    expect(() => validarMarcador(0, 2, 3)).not.toThrow();
    for (const [a, b] of [[2, 2], [1, 0], [3, 0], [1, 1]]) expect(() => validarMarcador(a, b, 3)).toThrow(ErrorTorneo);
  });

  it("eliminación directa con 5: pases libres automáticos y solo quedan por jugar los cruces reales", () => {
    const c = reconstruir({ formato: "eliminacion_directa", sorteo: ids(5), sucesos: [] });
    expect(c.filter((x) => x.fase === "ganadores")).toHaveLength(7);
    expect(c.filter((x) => x.paseLibre).map((x) => x.clave)).toEqual(["G1-1", "G1-3", "G1-4"]);
    expect(porJugar(c).map((x) => [x.clave, x.a, x.b])).toEqual([
      ["G1-2", 4, 5],
      ["G2-2", 2, 3],
    ]);
  });

  it("todos contra todos: cada par se enfrenta una sola vez (y con impares alguien descansa cada fecha)", () => {
    for (const n of [2, 3, 4, 5, 8]) {
      const c = generarLlaves("todos_contra_todos", ids(n));
      expect(c).toHaveLength((n * (n - 1)) / 2);
      const pares = new Set(c.map((x) => [x.a, x.b].sort().join("-")));
      expect(pares.size).toBe(c.length);
      for (const fecha of new Set(c.map((x) => x.ronda))) {
        const jugadores = c.filter((x) => x.ronda === fecha).flatMap((x) => [x.a, x.b]);
        expect(new Set(jugadores).size).toBe(jugadores.length); // nadie juega dos veces en la misma fecha
      }
    }
  });
});

describe("eliminación directa", () => {
  it.each([2, 3, 5, 8, 13])("con %i competidores termina con campeón, 2.º y 3.º correctos", (n) => {
    const { combates } = jugarTodo("eliminacion_directa", n);
    expect(torneoCompleto(combates)).toBe(true);
    const t = clasificacion({ formato: "eliminacion_directa", combates, competidores: ids(n) });
    expect(t[0]).toMatchObject({ competidor: 1, posicion: 1 });
    expect(t[1]).toMatchObject({ competidor: 2, posicion: 2 });
    if (n >= 3) expect(t[2]).toMatchObject({ competidor: 3, posicion: 3 });
    expect(t.every((f) => f.posicion !== null)).toBe(true);
  });

  it("con 8: 4.º el perdedor del 3.er lugar y 5.º compartido por los de cuartos", () => {
    const { combates } = jugarTodo("eliminacion_directa", 8);
    const t = clasificacion({ formato: "eliminacion_directa", combates, competidores: ids(8) });
    expect(t.map((f) => [f.competidor, f.posicion])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 5],
      [7, 5],
      [8, 5],
    ]);
    expect(t[0]).toMatchObject({ victorias: 3, derrotas: 0, asaltosFavor: 6, asaltosContra: 3 });
  });

  it("a mitad del torneo, quienes siguen en carrera aparecen primero y sin puesto", () => {
    const sucesos: Suceso[] = [];
    let combates = reconstruir({ formato: "eliminacion_directa", sorteo: ids(8), sucesos });
    const [c] = porJugar(combates);
    sucesos.push({ tipo: "resultado", clave: c.clave, a: c.a!, b: c.b!, asaltosA: 2, asaltosB: 0, faltasA: 0, faltasB: 0, walkover: false });
    combates = reconstruir({ formato: "eliminacion_directa", sorteo: ids(8), sucesos });
    const t = clasificacion({ formato: "eliminacion_directa", combates, competidores: ids(8) });
    expect(t.slice(0, 7).every((f) => f.posicion === null)).toBe(true);
    expect(t[7]).toMatchObject({ competidor: 8, posicion: 5 });
  });
});

describe("doble eliminación", () => {
  it.each([2, 3, 4, 5, 6, 8, 11, 16])("con %i: todos menos el campeón quedan fuera con 2 derrotas", (n) => {
    const { combates } = jugarTodo("doble_eliminacion", n);
    expect(torneoCompleto(combates)).toBe(true);
    const t = clasificacion({ formato: "doble_eliminacion", combates, competidores: ids(n) });
    expect(t[0]).toMatchObject({ competidor: 1, posicion: 1 });
    expect(t[1].posicion).toBe(2);
    expect(derrotas(combates, 1)).toBe(0);
    for (const x of ids(n).slice(1)) expect(derrotas(combates, x)).toBe(2);
    // Sin sorpresas no hace falta la final de desempate.
    expect(combates.find((c) => c.clave === "GF2")?.paseLibre).toBe(true);
  });

  it("si gana la gran final quien viene de perdedores, se juega la final de desempate", () => {
    // El 2 le gana a todos salvo al 1; el 1 cae con el 2 en la llave de ganadores… pero lo invertimos:
    // el 1 pierde la final de ganadores con el 2, gana la de perdedores y luego gana dos veces al 2.
    const gana = (a: number, b: number) => ((a === 1 && b === 2) || (a === 2 && b === 1) ? 0 : Math.min(a, b));
    let finales = 0;
    const { combates } = jugarTodo("doble_eliminacion", 4, (a, b) => {
      if ((a === 1 && b === 2) || (a === 2 && b === 1)) return ++finales === 1 ? 2 : 1;
      return gana(a, b);
    });
    const gf2 = combates.find((c) => c.clave === "GF2")!;
    expect(gf2.paseLibre).toBe(false);
    expect(gf2.ganador).toBe(1);
    expect(clasificacion({ formato: "doble_eliminacion", combates, competidores: ids(4) }).slice(0, 2).map((f) => f.competidor)).toEqual([1, 2]);
  });
});

describe("todos contra todos", () => {
  it("ordena por puntos y desempata por el resultado entre los empatados", () => {
    // 4 competidores: 1 gana todo; 2 le gana a 3, 3 a 4 y 4 a 2 (triple empate con 1 victoria)…
    // …pero 2 gana todos sus combates 2–0: mejor diferencia de asaltos.
    const gana = (a: number, b: number) => {
      if (a === 1 || b === 1) return 1;
      const par = [a, b].sort().join("-");
      return par === "2-3" ? 2 : par === "3-4" ? 3 : 4;
    };
    const sucesos: Suceso[] = [];
    for (let guarda = 0; guarda < 20; guarda++) {
      const combates = reconstruir({ formato: "todos_contra_todos", sorteo: ids(4), sucesos });
      const [c] = porJugar(combates);
      if (!c) break;
      const ganaA = gana(c.a!, c.b!) === c.a;
      const limpio = gana(c.a!, c.b!) === 2; // el 2 gana 2–0
      sucesos.push({ tipo: "resultado", clave: c.clave, a: c.a!, b: c.b!, asaltosA: ganaA ? 2 : limpio ? 0 : 1, asaltosB: ganaA ? (limpio ? 0 : 1) : 2, faltasA: 0, faltasB: 0, walkover: false });
    }
    const combates = reconstruir({ formato: "todos_contra_todos", sorteo: ids(4), sucesos });
    const t = clasificacion({ formato: "todos_contra_todos", combates, competidores: ids(4), puntosVictoria: 1 });
    expect(t[0]).toMatchObject({ competidor: 1, posicion: 1, puntos: 3 });
    expect(t.slice(1).map((f) => f.puntos)).toEqual([1, 1, 1]);
    expect(t[1]).toMatchObject({ competidor: 2, posicion: 2 }); // mejor diferencia de asaltos
  });

  it("empate total: comparten puesto", () => {
    const { combates } = jugarTodo("todos_contra_todos", 3, (a, b) => (a + b === 3 ? 1 : a + b === 5 ? 2 : 3));
    const t = clasificacion({ formato: "todos_contra_todos", combates, competidores: ids(3) });
    expect(t.map((f) => f.posicion)).toEqual([1, 1, 1]); // 1>2, 2>3, 3>1, todos 2–1
  });
});

describe("correcciones y retiros", () => {
  it("se puede corregir un combate si el siguiente no se jugó; si ya se jugó, se rechaza", () => {
    const { sucesos } = jugarTodo("eliminacion_directa", 4);
    // G1-1 (1 vs 4) ya llevó al 1 a la final, que se jugó: invertirlo es imposible.
    const corregido = sucesos.map((s) => (s.tipo === "resultado" && s.clave === "G1-1" ? { ...s, asaltosA: 0, asaltosB: 2 } : s));
    expect(() => reconstruir({ formato: "eliminacion_directa", sorteo: ids(4), sucesos: corregido })).toThrow(/ya se jugó/);

    const soloPrimero = [sucesos[0]].map((s) => (s.tipo === "resultado" ? { ...s, asaltosA: 0, asaltosB: 2 } : s));
    const c = reconstruir({ formato: "eliminacion_directa", sorteo: ids(4), sucesos: soloPrimero });
    expect(c.find((x) => x.clave === "G1-1")?.ganador).toBe(4);
    expect(c.find((x) => x.clave === "G2-1")?.a).toBe(4);
  });

  it("un competidor que se retira pierde por W.O. lo que le queda; lo ya jugado se respeta", () => {
    const sucesos: Suceso[] = [{ tipo: "resultado", clave: "L1-1", a: 1, b: 4, asaltosA: 1, asaltosB: 2, faltasA: 0, faltasB: 0, walkover: false }];
    sucesos.push({ tipo: "retiro", competidor: 4 });
    const c = reconstruir({ formato: "todos_contra_todos", sorteo: ids(4), sucesos });
    const del4 = c.filter((x) => x.a === 4 || x.b === 4);
    expect(del4.find((x) => x.clave === "L1-1")).toMatchObject({ ganador: 4, walkover: false });
    expect(del4.filter((x) => x.clave !== "L1-1").every((x) => x.terminado && x.walkover && x.ganador !== 4)).toBe(true);
  });

  it("en eliminación, quien le tocaba al retirado avanza por W.O. apenas se define el cruce", () => {
    const c = reconstruir({ formato: "eliminacion_directa", sorteo: ids(4), sucesos: [{ tipo: "retiro", competidor: 3 }] });
    expect(c.find((x) => x.clave === "G1-2")).toMatchObject({ terminado: true, walkover: true, ganador: 2 });
    expect(porJugar(c).map((x) => x.clave)).toEqual(["G1-1"]);
  });
});
