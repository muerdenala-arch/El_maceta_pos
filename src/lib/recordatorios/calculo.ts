/**
 * Recordatorios: cuándo toca el próximo aviso (puro; probado en calculo.test.ts).
 * Día y hora son de Bolivia (UTC−4 todo el año, sin horario de verano).
 */
export const REPETICIONES = ["ninguna", "diaria", "semanal", "mensual"] as const;
export type Repeticion = (typeof REPETICIONES)[number];

export const NOMBRES_REPETICION: Record<Repeticion, string> = {
  ninguna: "Una sola vez",
  diaria: "Todos los días",
  semanal: "Cada semana",
  mensual: "Cada mes",
};

export const esRepeticion = (v: unknown): v is Repeticion => REPETICIONES.includes(v as Repeticion);

export type Programacion = { fecha: string; hora: string; repeticion: string };

const DIA = 86_400_000;

/** Instante de un día ("AAAA-MM-DD") y hora ("HH:MM") de Bolivia. */
export const instanteBolivia = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-04:00`);

const dos = (n: number) => String(n).padStart(2, "0");

/** El mismo día del mes, `meses` después; si ese mes es más corto, su último día (31 → 30 / 28). */
function mesSiguiente(fecha: string, meses: number) {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const indice = anio * 12 + (mes - 1) + meses;
  const a = Math.floor(indice / 12);
  const m = indice % 12;
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return `${a}-${dos(m + 1)}-${dos(Math.min(dia, ultimo))}`;
}

/**
 * Primer aviso estrictamente posterior a `despues`, o null si no se repite y su hora ya pasó.
 * Si se saltaron varios (nadie abrió la app, el servidor estuvo apagado), no se acumulan: toca el siguiente.
 */
export function proximoAviso(p: Programacion, despues: Date): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha) || !/^\d{2}:\d{2}$/.test(p.hora)) return null;
  const inicio = instanteBolivia(p.fecha, p.hora);
  if (Number.isNaN(inicio.getTime())) return null;
  if (inicio.getTime() > despues.getTime()) return inicio;
  if (p.repeticion === "diaria" || p.repeticion === "semanal") {
    const paso = p.repeticion === "diaria" ? DIA : 7 * DIA;
    const saltos = Math.floor((despues.getTime() - inicio.getTime()) / paso) + 1;
    return new Date(inicio.getTime() + saltos * paso);
  }
  if (p.repeticion === "mensual") {
    const en = new Date(despues.getTime() - 4 * 3_600_000); // "reloj" de Bolivia
    const [anio, mes] = p.fecha.split("-").map(Number);
    let meses = Math.max(0, (en.getUTCFullYear() - anio) * 12 + (en.getUTCMonth() + 1 - mes));
    for (;;) {
      const candidato = instanteBolivia(mesSiguiente(p.fecha, meses), p.hora);
      if (candidato.getTime() > despues.getTime()) return candidato;
      meses++;
    }
  }
  return null;
}

/** "lun 6 oct, 08:30" en hora de Bolivia. */
export function textoAviso(instante: Date) {
  const dia = instante.toLocaleDateString("es-BO", { timeZone: "America/La_Paz", weekday: "short", day: "numeric", month: "short" });
  const hora = instante.toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hour12: false });
  return `${dia}, ${hora}`;
}
