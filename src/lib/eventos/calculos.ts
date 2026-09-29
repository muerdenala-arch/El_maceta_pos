/**
 * Cálculos puros del Reto Transformación (probados en calculos.test.ts). Los pesos se manejan en
 * centésimas de kilo (enteros) para no acumular errores de coma flotante, igual que el dinero.
 */

export type Criterio = "porcentaje" | "kilos";

/** "85,5" / "85.50" / 85.5 → 8550 (centésimas de kg). */
export function aCentikg(peso: string | number): number {
  return Math.round(Number(String(peso).replace(",", ".")) * 100);
}

/** 8550 → "85.50" */
export const deCentikg = (c: number) => (c / 100).toFixed(2);

/** Kilos perdidos (en centésimas): positivo si bajó, negativo si subió. */
export const kilosPerdidos = (inicial: number, actual: number) => inicial - actual;

/** Porcentaje perdido en centésimas de punto (325 = 3,25 %), redondeado a 2 decimales. */
export function porcentajePerdido(inicial: number, actual: number): number {
  if (inicial <= 0) return 0;
  const exacto = ((inicial - actual) * 10_000) / inicial;
  return Math.sign(exacto) * Math.round(Math.abs(exacto));
}

/** "3,25 %" o "−1,50 %" */
export function textoPorcentaje(centesimas: number) {
  const t = (Math.abs(centesimas) / 100).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${centesimas < 0 ? "−" : ""}${t} %`;
}

/** "4,50 kg" o "−1,20 kg" */
export function textoKilos(centikg: number) {
  const t = (Math.abs(centikg) / 100).toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${centikg < 0 ? "−" : ""}${t} kg`;
}

/** Un cambio de más de 10 % respecto al pesaje anterior probablemente es un error de digitación. */
export function cambioSospechoso(anterior: number, nuevo: number) {
  return anterior > 0 && Math.abs(nuevo - anterior) * 10 > anterior;
}

/** Días que faltan hasta el último día del reto (0 = hoy es el último día; negativo = ya terminó). */
export function diasRestantes(fechaFin: string, hoy: string) {
  return Math.round((Date.parse(`${fechaFin}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
}

/** El reto cumplió su duración: desde el último día ya se pueden registrar los pesajes finales. */
export const plazoCumplido = (fechaFin: string, hoy: string) => diasRestantes(fechaFin, hoy) <= 0;

// ---------------------------------------------------------------- Tabla de posiciones

export type ParticipanteCalculo = { id: number; nombre: string; pesoInicial: string };
export type PesajeCalculo = { id: number; participanteId: number; fecha: string; peso: string; esPesajeFinal: boolean };

export type EstadoFila = "clasificado" | "sin_pesaje" | "no_completo";
export type Movimiento = "sube" | "baja" | "igual" | "nuevo" | null;

export type FilaPosicion = {
  participanteId: number;
  nombre: string;
  pesoInicial: number;
  pesoActual: number | null;
  /** Centésimas de kg. */
  kilos: number | null;
  /** Centésimas de punto porcentual. */
  porcentaje: number | null;
  /** Compartida en empates (1, 1, 3…); null si no clasifica. */
  posicion: number | null;
  estado: EstadoFila;
  /** Respecto a la jornada de pesaje anterior. */
  movimiento: Movimiento;
  /** Puestos ganados (+) o perdidos (−). */
  cambioPuestos: number;
};

const ordenar = <T>(xs: T[], comparar: (a: T, b: T) => number) => [...xs].sort(comparar);

/** Último pesaje de cada participante (por fecha y, en la misma fecha, el registrado después). */
function ultimos(pesajes: PesajeCalculo[], filtro: (p: PesajeCalculo) => boolean) {
  const m = new Map<number, PesajeCalculo>();
  for (const p of ordenar(pesajes.filter(filtro), (a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)) m.set(p.participanteId, p);
  return m;
}

function clasificar(participantes: ParticipanteCalculo[], actuales: Map<number, PesajeCalculo>, criterio: Criterio) {
  const filas = participantes.flatMap((p) => {
    const u = actuales.get(p.id);
    if (!u) return [];
    const inicial = aCentikg(p.pesoInicial);
    const actual = aCentikg(u.peso);
    return [{ p, inicial, actual, kilos: kilosPerdidos(inicial, actual), porcentaje: porcentajePerdido(inicial, actual) }];
  });
  const clave = (f: (typeof filas)[number]) => (criterio === "porcentaje" ? [f.porcentaje, f.kilos] : [f.kilos, f.porcentaje]);
  const ordenadas = ordenar(filas, (a, b) => {
    const [a1, a2] = clave(a);
    const [b1, b2] = clave(b);
    return b1 - a1 || b2 - a2 || a.p.nombre.localeCompare(b.p.nombre, "es");
  });
  // Ranking de competición: en empate total (ambos criterios) comparten puesto y se salta el siguiente.
  const posiciones = new Map<number, number>();
  ordenadas.forEach((f, i) => {
    const anterior = ordenadas[i - 1];
    const empata = anterior && clave(anterior).every((v, k) => v === clave(f)[k]);
    posiciones.set(f.p.id, empata ? posiciones.get(anterior.p.id)! : i + 1);
  });
  return { ordenadas, posiciones };
}

/**
 * Tabla de posiciones del reto. En curso: se usa el último pesaje de cada participante activo.
 * Finalizado: solo cuenta el pesaje final; quien no lo tiene queda como "No completó".
 * El movimiento compara con la clasificación de la jornada de pesaje anterior.
 */
export function tablaPosiciones({
  participantes,
  pesajes,
  criterio,
  finalizado,
}: {
  participantes: ParticipanteCalculo[];
  pesajes: PesajeCalculo[];
  criterio: Criterio;
  finalizado: boolean;
}): FilaPosicion[] {
  const ids = new Set(participantes.map((p) => p.id));
  const propios = pesajes.filter((p) => ids.has(p.participanteId));
  const actuales = ultimos(propios, (p) => !finalizado || p.esPesajeFinal);
  const { ordenadas, posiciones } = clasificar(participantes, actuales, criterio);

  // Clasificación de la jornada anterior (todas las fechas menos la última).
  const fechas = [...new Set(propios.map((p) => p.fecha))].sort();
  const previa =
    fechas.length > 1 ? clasificar(participantes, ultimos(propios, (p) => p.fecha < fechas.at(-1)!), criterio).posiciones : null;

  const filas: FilaPosicion[] = ordenadas.map((f) => {
    const posicion = posiciones.get(f.p.id)!;
    const antes = previa?.get(f.p.id);
    const cambioPuestos = antes === undefined ? 0 : antes - posicion;
    return {
      participanteId: f.p.id,
      nombre: f.p.nombre,
      pesoInicial: f.inicial,
      pesoActual: f.actual,
      kilos: f.kilos,
      porcentaje: f.porcentaje,
      posicion,
      estado: "clasificado",
      movimiento: previa === null ? null : antes === undefined ? "nuevo" : cambioPuestos > 0 ? "sube" : cambioPuestos < 0 ? "baja" : "igual",
      cambioPuestos,
    };
  });

  // Al final: quienes no clasifican (sin pesaje, o sin pesaje final si el reto terminó).
  const resto = ordenar(
    participantes.filter((p) => !posiciones.has(p.id)),
    (a, b) => a.nombre.localeCompare(b.nombre, "es"),
  ).map(
    (p): FilaPosicion => ({
      participanteId: p.id,
      nombre: p.nombre,
      pesoInicial: aCentikg(p.pesoInicial),
      pesoActual: null,
      kilos: null,
      porcentaje: null,
      posicion: null,
      estado: finalizado ? "no_completo" : "sin_pesaje",
      movimiento: null,
      cambioPuestos: 0,
    }),
  );
  return [...filas, ...resto];
}

/** Puntos de la evolución de cada participante (peso inicial en la fecha de inicio + cada pesaje). */
export function evolucion(participantes: ParticipanteCalculo[], pesajes: PesajeCalculo[], fechaInicio: string) {
  return participantes.map((p) => {
    const inicial = aCentikg(p.pesoInicial);
    const puntos = ordenar(
      pesajes.filter((x) => x.participanteId === p.id),
      (a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id,
    ).map((x) => ({ fecha: x.fecha, peso: aCentikg(x.peso), porcentaje: porcentajePerdido(inicial, aCentikg(x.peso)) }));
    return { participanteId: p.id, nombre: p.nombre, puntos: [{ fecha: fechaInicio, peso: inicial, porcentaje: 0 }, ...puntos] };
  });
}
