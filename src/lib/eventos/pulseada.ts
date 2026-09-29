/**
 * Motor del Torneo de Pulseada (puro y probado en pulseada.test.ts).
 *
 * El estado de las llaves nunca se edita "a mano": se RECONSTRUYE a partir del sorteo (orden de los
 * competidores) y de la lista de resultados jugados. Así corregir un combate o retirar a un competidor
 * no deja llaves a medias: se vuelve a armar todo y, si un combate posterior ya se jugó con otros
 * competidores, la corrección se rechaza.
 *
 * Formatos: eliminación directa (con 3.er lugar), doble eliminación (llave de perdedores, gran final y
 * final de desempate si gana quien viene de perdedores) y todos contra todos (método del círculo).
 * Combates al mejor de N asaltos (3 por defecto).
 */

export type Formato = "eliminacion_directa" | "doble_eliminacion" | "todos_contra_todos";
export type Fase = "ganadores" | "perdedores" | "gran_final" | "desempate" | "tercer_lugar" | "liga";
type Lado = "a" | "b";
type Destino = { clave: string; lado: Lado } | null;

export type Combate = {
  clave: string;
  fase: Fase;
  ronda: number;
  orden: number;
  a: number | null;
  b: number | null;
  /** El lado nunca tendrá competidor (pase libre). */
  aVacio: boolean;
  bVacio: boolean;
  asaltosA: number;
  asaltosB: number;
  faltasA: number;
  faltasB: number;
  ganador: number | null;
  terminado: boolean;
  /** Se resolvió solo: uno (o ambos) lados vacíos. No es un combate jugado. */
  paseLibre: boolean;
  /** Ganado por no presentarse o retirarse el rival. */
  walkover: boolean;
  alGanador: Destino;
  alPerdedor: Destino;
};

export type Resultado = {
  clave: string;
  /** Competidores con que se jugó (para detectar que una corrección anterior cambió el cruce). */
  a: number;
  b: number;
  asaltosA: number;
  asaltosB: number;
  faltasA: number;
  faltasB: number;
  walkover: boolean;
};

/** Asaltos para ganar un combate al mejor de N (3 → 2). */
export const asaltosParaGanar = (mejorDe: number) => Math.floor(mejorDe / 2) + 1;

const potencia2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(n, 2)));

/** Orden estándar de cabezas de serie en la llave: 1 vs último, y los primeros no se cruzan hasta el final. */
export function ordenSiembra(tamano: number): number[] {
  let o = [1];
  while (o.length < tamano) {
    const n = o.length * 2;
    o = o.flatMap((x) => [x, n + 1 - x]);
  }
  return o;
}

function nuevo(clave: string, fase: Fase, ronda: number, orden: number): Combate {
  return {
    clave,
    fase,
    ronda,
    orden,
    a: null,
    b: null,
    aVacio: false,
    bVacio: false,
    asaltosA: 0,
    asaltosB: 0,
    faltasA: 0,
    faltasB: 0,
    ganador: null,
    terminado: false,
    paseLibre: false,
    walkover: false,
    alGanador: null,
    alPerdedor: null,
  };
}

const g = (r: number, i: number) => `G${r}-${i + 1}`;
const p = (q: number, i: number) => `P${q}-${i + 1}`;

/** Llave de ganadores (común a eliminación directa y doble). Siembra con pases libres para los primeros. */
function llaveGanadores(competidores: number[]) {
  const s = potencia2(competidores.length);
  const rondas = Math.log2(s);
  const orden = ordenSiembra(s);
  const combates: Combate[] = [];
  for (let r = 1; r <= rondas; r++) {
    const m = s / 2 ** r;
    for (let i = 0; i < m; i++) {
      const c = nuevo(g(r, i), "ganadores", r, i + 1);
      if (r < rondas) c.alGanador = { clave: g(r + 1, Math.floor(i / 2)), lado: i % 2 === 0 ? "a" : "b" };
      if (r === 1) {
        const [sa, sb] = [orden[2 * i], orden[2 * i + 1]];
        if (sa <= competidores.length) c.a = competidores[sa - 1];
        else c.aVacio = true;
        if (sb <= competidores.length) c.b = competidores[sb - 1];
        else c.bVacio = true;
      }
      combates.push(c);
    }
  }
  return { combates, s, rondas };
}

/** Arma todas las llaves (sin resultados) a partir del orden del sorteo. */
export function generarLlaves(formato: Formato, competidores: number[]): Combate[] {
  if (competidores.length < 2) throw new Error("Se necesitan al menos 2 competidores");
  if (formato === "todos_contra_todos") return todosContraTodos(competidores);

  const { combates, s, rondas } = llaveGanadores(competidores);
  const porClave = new Map(combates.map((c) => [c.clave, c]));
  const final = porClave.get(g(rondas, 0))!;

  if (formato === "eliminacion_directa") {
    if (s >= 4) {
      const t = nuevo("T3", "tercer_lugar", rondas, 1);
      porClave.get(g(rondas - 1, 0))!.alPerdedor = { clave: "T3", lado: "a" };
      porClave.get(g(rondas - 1, 1))!.alPerdedor = { clave: "T3", lado: "b" };
      combates.push(t);
    }
    return combates;
  }

  // Doble eliminación: llave de perdedores con 2·(rondas − 1) rondas.
  const rondasP = 2 * (rondas - 1);
  const gf = nuevo("GF", "gran_final", 1, 1);
  const gf2 = nuevo("GF2", "desempate", 2, 1);
  final.alGanador = { clave: "GF", lado: "a" };
  const perdedores: Combate[] = [];
  for (let q = 1; q <= rondasP; q++) {
    const k = Math.ceil(q / 2);
    const m = q === 1 ? s / 4 : q % 2 === 0 ? s / 2 ** (k + 1) : s / 2 ** (k + 1);
    for (let j = 0; j < m; j++) {
      const c = nuevo(p(q, j), "perdedores", q, j + 1);
      if (q === rondasP) c.alGanador = { clave: "GF", lado: "b" };
      else if (q % 2 === 1) c.alGanador = { clave: p(q + 1, j), lado: "a" };
      else c.alGanador = { clave: p(q + 1, Math.floor(j / 2)), lado: j % 2 === 0 ? "a" : "b" };
      perdedores.push(c);
    }
  }
  // A dónde caen los perdedores de la llave de ganadores.
  for (const c of combates) {
    if (c.ronda === 1) {
      c.alPerdedor = rondas === 1 ? { clave: "GF", lado: "b" } : { clave: p(1, Math.floor((c.orden - 1) / 2)), lado: (c.orden - 1) % 2 === 0 ? "a" : "b" };
    } else {
      const m = s / 2 ** c.ronda;
      const j = c.orden - 1;
      // Se invierte el orden en rondas alternas para no repetir cruces pronto.
      const idx = c.ronda % 2 === 0 ? m - 1 - j : j;
      c.alPerdedor = { clave: p(2 * (c.ronda - 1), idx), lado: "b" };
    }
  }
  return [...combates, ...perdedores, gf, gf2];
}

function todosContraTodos(competidores: number[]): Combate[] {
  const lista: (number | null)[] = competidores.length % 2 ? [...competidores, null] : [...competidores];
  const n = lista.length;
  const combates: Combate[] = [];
  let rot = lista.slice(1);
  for (let r = 1; r < n; r++) {
    const fila = [lista[0], ...rot];
    let orden = 0;
    for (let i = 0; i < n / 2; i++) {
      const [x, y] = [fila[i], fila[n - 1 - i]];
      if (x === null || y === null) continue; // descansa
      const c = nuevo(`L${r}-${++orden}`, "liga", r, orden);
      [c.a, c.b] = r % 2 ? [x, y] : [y, x];
      combates.push(c);
    }
    rot = [rot[rot.length - 1], ...rot.slice(0, -1)];
  }
  return combates;
}

// ---------------------------------------------------------------- Avance de las llaves

function colocar(porClave: Map<string, Combate>, destino: Destino, competidor: number | null) {
  if (!destino) return;
  const d = porClave.get(destino.clave)!;
  if (destino.lado === "a") {
    d.a = competidor;
    d.aVacio = competidor === null;
  } else {
    d.b = competidor;
    d.bVacio = competidor === null;
  }
}

function cerrar(porClave: Map<string, Combate>, c: Combate, ganador: number | null, perdedor: number | null) {
  c.ganador = ganador;
  c.terminado = true;
  colocar(porClave, c.alGanador, ganador);
  colocar(porClave, c.alPerdedor, perdedor);
  if (c.fase === "gran_final") {
    // Si gana quien viene de perdedores (lado b), se juega la final de desempate; si no, no hace falta.
    const gf2 = porClave.get("GF2")!;
    if (ganador !== null && ganador === c.b) {
      Object.assign(gf2, { a: c.a, b: c.b, aVacio: false, bVacio: false });
    } else {
      Object.assign(gf2, { a: null, b: null, aVacio: true, bVacio: true });
    }
  }
}

/** Resuelve solos los combates con pase libre (y los de competidores retirados) hasta que no haya cambios. */
function propagar(porClave: Map<string, Combate>, combates: Combate[], retirados: Set<number>, ganar: number) {
  let cambio = true;
  while (cambio) {
    cambio = false;
    for (const c of combates) {
      if (c.terminado) continue;
      const aListo = c.a !== null || c.aVacio;
      const bListo = c.b !== null || c.bVacio;
      if (!aListo || !bListo) continue;
      if (c.aVacio || c.bVacio) {
        const unico = c.aVacio ? c.b : c.a;
        c.paseLibre = true;
        cerrar(porClave, c, unico, null);
        cambio = true;
      } else if (retirados.has(c.a!) || retirados.has(c.b!)) {
        const ganaA = !retirados.has(c.a!) || (retirados.has(c.a!) && retirados.has(c.b!) ? c.a! < c.b! : false);
        const [gano, perdio] = ganaA ? [c.a!, c.b!] : [c.b!, c.a!];
        Object.assign(c, { walkover: true, asaltosA: ganaA ? ganar : 0, asaltosB: ganaA ? 0 : ganar });
        cerrar(porClave, c, gano, retirados.has(perdio) ? null : perdio);
        cambio = true;
      }
    }
  }
}

export class ErrorTorneo extends Error {}

/** Valida el marcador de un combate al mejor de N: exactamente uno llega a los asaltos para ganar. */
export function validarMarcador(asaltosA: number, asaltosB: number, mejorDe: number) {
  const ganar = asaltosParaGanar(mejorDe);
  const ok = [asaltosA, asaltosB].every((x) => Number.isInteger(x) && x >= 0 && x <= ganar) && (asaltosA === ganar) !== (asaltosB === ganar);
  if (!ok) throw new ErrorTorneo(`Marcador inválido: al mejor de ${mejorDe}, gana quien llega a ${ganar} asaltos`);
}

/** Lo que pasó en el torneo, en orden: resultados de combates y retiros de competidores. */
export type Suceso = ({ tipo: "resultado" } & Resultado) | { tipo: "retiro"; competidor: number };

/**
 * Estado completo del torneo: llaves del sorteo + sucesos en el orden en que ocurrieron. Un retirado
 * pierde por W.O. lo que le quede por jugar desde ese momento (lo ya jugado se respeta).
 * Lanza ErrorTorneo si un resultado ya no corresponde al cruce (p. ej. tras corregir un combate anterior).
 */
export function reconstruir({
  formato,
  sorteo,
  sucesos,
  mejorDe = 3,
}: {
  formato: Formato;
  sorteo: number[];
  sucesos: Suceso[];
  mejorDe?: number;
}): Combate[] {
  const ganar = asaltosParaGanar(mejorDe);
  const combates = generarLlaves(formato, sorteo);
  const porClave = new Map(combates.map((c) => [c.clave, c]));
  const fuera = new Set<number>();
  propagar(porClave, combates, fuera, ganar);
  for (const s of sucesos) {
    if (s.tipo === "retiro") {
      fuera.add(s.competidor);
    } else {
      const c = porClave.get(s.clave);
      if (!c) throw new ErrorTorneo(`El combate ${s.clave} no existe`);
      if (c.terminado) throw new ErrorTorneo(`El combate ${s.clave} ya tiene resultado`);
      if (c.a !== s.a || c.b !== s.b) {
        throw new ErrorTorneo("Ese cambio altera un combate que ya se jugó con otros competidores: corrige primero los combates posteriores");
      }
      if (!s.walkover) validarMarcador(s.asaltosA, s.asaltosB, mejorDe);
      Object.assign(c, { asaltosA: s.asaltosA, asaltosB: s.asaltosB, faltasA: s.faltasA, faltasB: s.faltasB, walkover: s.walkover });
      const ganaA = s.asaltosA > s.asaltosB;
      cerrar(porClave, c, ganaA ? c.a : c.b, ganaA ? c.b : c.a);
    }
    propagar(porClave, combates, fuera, ganar);
  }
  return combates;
}

/** Combates listos para jugarse (los dos competidores definidos y sin resultado). */
export const porJugar = (combates: Combate[]) =>
  combates.filter((c) => !c.terminado && c.a !== null && c.b !== null).sort((x, y) => ordenFase(x) - ordenFase(y) || x.ronda - y.ronda || x.orden - y.orden);

const FASES: Fase[] = ["liga", "ganadores", "perdedores", "tercer_lugar", "gran_final", "desempate"];
const ordenFase = (c: Combate) => (c.fase === "ganadores" || c.fase === "perdedores" ? c.ronda * 10 + FASES.indexOf(c.fase) : 1000 + FASES.indexOf(c.fase));

/** ¿Terminó el torneo? (todos los combates resueltos). */
export const torneoCompleto = (combates: Combate[]) => combates.every((c) => c.terminado);

/** Nombre de la ronda para mostrar ("Final", "Semifinal", "Perdedores · ronda 2"…). */
export function nombreRonda(c: Pick<Combate, "fase" | "ronda">, rondasGanadores: number, formato: Formato) {
  if (c.fase === "liga") return `Fecha ${c.ronda}`;
  if (c.fase === "tercer_lugar") return "3.er lugar";
  if (c.fase === "gran_final") return "Gran final";
  if (c.fase === "desempate") return "Final de desempate";
  if (c.fase === "perdedores") return `Perdedores · ronda ${c.ronda}`;
  const faltan = rondasGanadores - c.ronda;
  const base = faltan === 0 ? "Final" : faltan === 1 ? "Semifinal" : faltan === 2 ? "Cuartos de final" : faltan === 3 ? "Octavos de final" : `Ronda ${c.ronda}`;
  return formato === "doble_eliminacion" ? (faltan === 0 ? "Final de ganadores" : `${base} (ganadores)`) : base;
}

// ---------------------------------------------------------------- Clasificación

export type FilaClasificacion = {
  competidor: number;
  posicion: number | null;
  jugados: number;
  victorias: number;
  derrotas: number;
  asaltosFavor: number;
  asaltosContra: number;
  faltas: number;
  puntos: number;
  retirado: boolean;
  /** Ya quedó fuera del torneo (en doble eliminación su puesto se conoce al terminar). */
  eliminado: boolean;
};

function estadisticas(combates: Combate[], competidores: number[], puntosVictoria: number, retirados: Set<number>) {
  const e = new Map<number, FilaClasificacion>(
    competidores.map((c) => [c, { competidor: c, posicion: null, jugados: 0, victorias: 0, derrotas: 0, asaltosFavor: 0, asaltosContra: 0, faltas: 0, puntos: 0, retirado: retirados.has(c), eliminado: false }]),
  );
  for (const c of combates) {
    if (!c.terminado || c.paseLibre || c.a === null || c.b === null) continue;
    for (const [yo, rival, af, ac, f] of [
      [c.a, c.b, c.asaltosA, c.asaltosB, c.faltasA],
      [c.b, c.a, c.asaltosB, c.asaltosA, c.faltasB],
    ] as const) {
      const s = e.get(yo);
      if (!s) continue;
      s.jugados++;
      s.asaltosFavor += af;
      s.asaltosContra += ac;
      s.faltas += f;
      if (c.ganador === yo) {
        s.victorias++;
        s.puntos += puntosVictoria;
      } else if (c.ganador === rival) s.derrotas++;
    }
  }
  return e;
}

/** Posiciones compartidas en empate total (1, 2, 3, 3, 5…). */
function asignarPuestos<T>(ordenados: T[][], fila: (x: T) => FilaClasificacion) {
  let puesto = 1;
  for (const grupo of ordenados) {
    for (const x of grupo) fila(x).posicion = puesto;
    puesto += grupo.length;
  }
}

/**
 * Clasificación del torneo. Eliminación: por ronda en que quedó fuera (final, 3.er lugar, etc.); las
 * posiciones solo se fijan para quien ya quedó eliminado o ganó. Todos contra todos: puntos; desempate
 * por resultado entre los empatados, diferencia de asaltos, asaltos a favor y menos faltas.
 */
export function clasificacion({
  formato,
  combates,
  competidores,
  retirados = [],
  puntosVictoria = 1,
}: {
  formato: Formato;
  combates: Combate[];
  competidores: number[];
  retirados?: number[];
  puntosVictoria?: number;
}): FilaClasificacion[] {
  const fuera = new Set(retirados);
  const e = estadisticas(combates, competidores, puntosVictoria, fuera);
  const filas = [...e.values()];

  if (formato === "todos_contra_todos") {
    const dif = (f: FilaClasificacion) => f.asaltosFavor - f.asaltosContra;
    const porPuntos = new Map<number, FilaClasificacion[]>();
    for (const f of filas) porPuntos.set(f.puntos, [...(porPuntos.get(f.puntos) ?? []), f]);
    const grupos: FilaClasificacion[][] = [];
    for (const puntos of [...porPuntos.keys()].sort((x, y) => y - x)) {
      const empatados = porPuntos.get(puntos)!;
      const ids = new Set(empatados.map((f) => f.competidor));
      // Mini-liga entre los empatados (resultado directo).
      const entreEllos = estadisticas(
        combates.filter((c) => c.a !== null && c.b !== null && ids.has(c.a) && ids.has(c.b)),
        [...ids],
        puntosVictoria,
        fuera,
      );
      const clave = (f: FilaClasificacion) => [entreEllos.get(f.competidor)!.puntos, dif(f), f.asaltosFavor, -f.faltas];
      const ordenados = [...empatados].sort((x, y) => {
        const [a, b] = [clave(x), clave(y)];
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
        return x.competidor - y.competidor;
      });
      let grupo: FilaClasificacion[] = [];
      for (const f of ordenados) {
        if (grupo.length && clave(grupo[0]).some((v, i) => v !== clave(f)[i])) {
          grupos.push(grupo);
          grupo = [];
        }
        grupo.push(f);
      }
      if (grupo.length) grupos.push(grupo);
    }
    asignarPuestos(grupos, (f) => f);
    return grupos.flat();
  }

  // Eliminación: "nivel" = qué tan lejos llegó cada eliminado (mayor = mejor). Quien sigue en carrera no
  // tiene puesto todavía. Puesto = 1 + cantidad de competidores que llegaron más lejos (incluye a los que
  // siguen en carrera), así sirve también a mitad del torneo y con pases libres.
  const porClave = new Map(combates.map((c) => [c.clave, c]));
  const nivel = new Map<number, number>();
  const perdedorDe = (c: Combate) => (c.ganador === c.a ? c.b : c.a);
  const jugado = (c: Combate | undefined): c is Combate => !!c && c.terminado && !c.paseLibre;

  if (formato === "eliminacion_directa") {
    const rondas = Math.max(...combates.filter((c) => c.fase === "ganadores").map((c) => c.ronda));
    for (const c of combates) {
      // Los perdedores de semifinal no quedan ubicados aquí: van al combate por el 3.er lugar.
      if (jugado(c) && c.fase === "ganadores" && c.ronda < rondas - 1 && perdedorDe(c) !== null) nivel.set(perdedorDe(c)!, c.ronda);
    }
    const t3 = porClave.get("T3");
    if (t3?.terminado) {
      if (t3.ganador !== null) nivel.set(t3.ganador, 1000);
      if (!t3.paseLibre && perdedorDe(t3) !== null) nivel.set(perdedorDe(t3)!, 999);
    }
    const final = porClave.get(`G${rondas}-1`)!;
    if (final.terminado && final.ganador !== null) {
      nivel.set(final.ganador, 1002);
      if (perdedorDe(final) !== null) nivel.set(perdedorDe(final)!, 1001);
    }
  } else {
    for (const c of combates) if (jugado(c) && c.fase === "perdedores" && perdedorDe(c) !== null) nivel.set(perdedorDe(c)!, c.ronda);
    const [gf, gf2] = [porClave.get("GF")!, porClave.get("GF2")!];
    if (gf.terminado && gf2.terminado) {
      const campeon = gf2.paseLibre ? gf.ganador! : gf2.ganador!;
      nivel.set(campeon, 1002);
      nivel.set(campeon === gf.a ? gf.b! : gf.a!, 1001);
    }
  }

  const completo = torneoCompleto(combates);
  const tamano = 2 ** Math.max(...combates.filter((c) => c.fase === "ganadores").map((c) => c.ronda));
  for (const f of filas) {
    const n = nivel.get(f.competidor);
    if (n === undefined) continue;
    f.eliminado = n < 1001;
    if (formato === "eliminacion_directa" && n < 999) {
      // Quedó fuera en la ronda n: detrás de todos los que pasan a la ronda siguiente (fijo desde el sorteo).
      f.posicion = tamano / 2 ** n + 1;
    } else if (completo || n >= 999) {
      f.posicion = filas.length - filas.filter((x) => (nivel.get(x.competidor) ?? Infinity) <= n).length + 1;
    }
  }
  // Primero los que siguen en carrera (sin puesto aún), luego por puesto.
  const orden = (f: FilaClasificacion) => f.posicion ?? (f.eliminado ? Number.MAX_SAFE_INTEGER : 0);
  return filas.sort((x, y) => orden(x) - orden(y) || y.victorias - x.victorias || x.competidor - y.competidor);
}

/** Competidores que entraron al sorteo (aparecen en alguna llave), incluidos los que se retiraron después. */
export const competidoresEnLlaves = (combates: Combate[]) => [...new Set(combates.flatMap((c) => [c.a, c.b]).filter((x): x is number => x !== null))];
