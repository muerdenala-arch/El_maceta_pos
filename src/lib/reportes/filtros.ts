/**
 * Filtros de los reportes (sección 4 del plan: fechas, sucursal, cajero, método de pago y producto),
 * leídos de la URL. Puro: lo usan las páginas, la exportación y las pruebas.
 */
import { fechaValida } from "@/lib/formato";

export type MetodoPago = "efectivo" | "qr";

export type FiltrosReporte = {
  desde: string;
  hasta: string;
  /** null = todas las sucursales. */
  sucursalId: number | null;
  cajeroId: number | null;
  metodo: MetodoPago | null;
  productoId: number | null;
  /** Solo en gastos. */
  categoria: string | null;
};

export type Parametros = Record<string, string | string[] | undefined> | URLSearchParams;

/** Rango máximo consultable de una vez (un año): evita consultas y archivos enormes por error. */
export const MAX_DIAS = 366;

const DIA_MS = 86_400_000;

const leer = (p: Parametros, clave: string): string | undefined => {
  const v = p instanceof URLSearchParams ? (p.get(clave) ?? undefined) : p[clave];
  return Array.isArray(v) ? v[0] : v;
};

const entero = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Suma días a "AAAA-MM-DD". */
export function sumarDias(dia: string, dias: number) {
  return new Date(Date.parse(`${dia}T12:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Días del rango, contando ambos extremos. */
export function diasDelRango(desde: string, hasta: string) {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / DIA_MS) + 1;
}

/**
 * Lee los filtros de la URL. Sin fechas → hoy. `?fecha=` (enlaces anteriores) equivale a un solo día.
 * Nunca pasa de hoy, ordena el rango si viene al revés y lo recorta a MAX_DIAS.
 * `sucursal=todas` fuerza todas; sin el parámetro se usa la sucursal que el admin está viendo.
 */
export function leerFiltros(p: Parametros, hoy: string, sucursalPorDefecto: number | null): FiltrosReporte {
  const unDia = fechaValida(leer(p, "fecha"));
  let desde = fechaValida(leer(p, "desde")) ?? unDia ?? hoy;
  let hasta = fechaValida(leer(p, "hasta")) ?? unDia ?? (leer(p, "desde") ? hoy : desde);
  if (hasta > hoy) hasta = hoy;
  if (desde > hoy) desde = hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (diasDelRango(desde, hasta) > MAX_DIAS) desde = sumarDias(hasta, -(MAX_DIAS - 1));

  const s = leer(p, "sucursal");
  const metodo = leer(p, "metodo");
  const categoria = leer(p, "categoria")?.trim();
  return {
    desde,
    hasta,
    sucursalId: s === "todas" ? null : (entero(s) ?? sucursalPorDefecto),
    cajeroId: entero(leer(p, "cajero")),
    metodo: metodo === "efectivo" || metodo === "qr" ? metodo : null,
    productoId: entero(leer(p, "producto")),
    categoria: categoria ? categoria.slice(0, 60) : null,
  };
}

/** Filtros → parámetros de URL (para enlaces, pestañas y exportación). La sucursal va siempre explícita. */
export function aParametros(f: FiltrosReporte, extra: Record<string, string | null | undefined> = {}) {
  const p = new URLSearchParams({ desde: f.desde, hasta: f.hasta, sucursal: f.sucursalId ? String(f.sucursalId) : "todas" });
  if (f.cajeroId) p.set("cajero", String(f.cajeroId));
  if (f.metodo) p.set("metodo", f.metodo);
  if (f.productoId) p.set("producto", String(f.productoId));
  if (f.categoria) p.set("categoria", f.categoria);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p;
}

export type RangoRapido = "hoy" | "ayer" | "semana" | "mes" | "mes_anterior" | "30_dias";

export const RANGOS_RAPIDOS: { valor: RangoRapido; titulo: string }[] = [
  { valor: "hoy", titulo: "Hoy" },
  { valor: "ayer", titulo: "Ayer" },
  { valor: "semana", titulo: "Esta semana" },
  { valor: "mes", titulo: "Este mes" },
  { valor: "mes_anterior", titulo: "Mes anterior" },
  { valor: "30_dias", titulo: "Últimos 30 días" },
];

/** Rangos de un toque. La semana empieza el lunes. */
export function rangoRapido(r: RangoRapido, hoy: string): { desde: string; hasta: string } {
  switch (r) {
    case "hoy":
      return { desde: hoy, hasta: hoy };
    case "ayer": {
      const ayer = sumarDias(hoy, -1);
      return { desde: ayer, hasta: ayer };
    }
    case "semana": {
      const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 = domingo
      return { desde: sumarDias(hoy, -((diaSemana + 6) % 7)), hasta: hoy };
    }
    case "mes":
      return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
    case "mes_anterior": {
      const finAnterior = sumarDias(`${hoy.slice(0, 8)}01`, -1);
      return { desde: `${finAnterior.slice(0, 8)}01`, hasta: finAnterior };
    }
    case "30_dias":
      return { desde: sumarDias(hoy, -29), hasta: hoy };
  }
}

/** Qué rango rápido coincide con las fechas elegidas (para marcarlo en la barra). */
export function rangoActivo(desde: string, hasta: string, hoy: string): RangoRapido | null {
  return RANGOS_RAPIDOS.find(({ valor }) => {
    const r = rangoRapido(valor, hoy);
    return r.desde === desde && r.hasta === hasta;
  })?.valor ?? null;
}

/** "26/09/2026" o "01/09/2026 – 26/09/2026". */
export function textoRango(desde: string, hasta: string) {
  const f = (d: string) => d.split("-").reverse().join("/");
  return desde === hasta ? f(desde) : `${f(desde)} – ${f(hasta)}`;
}
