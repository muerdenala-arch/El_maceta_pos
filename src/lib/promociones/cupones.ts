/** Reglas puras de los cupones (estado, vigencia, código). Probado en cupones.test.ts. */

export type EstadoCuponAdmin = "activo" | "inactivo" | "programado" | "vencido" | "agotado";

type Vigencia = { activo: boolean; fechaInicio: string | null; fechaFin: string | null; usosMaximos: number | null; usosActuales: number };

/** Estado para la lista del administrador y para decir por qué no se puede usar. Fechas en días de Bolivia, inclusivas. */
export function estadoCupon(c: Vigencia, hoy: string): EstadoCuponAdmin {
  if (!c.activo) return "inactivo";
  if (c.fechaFin && hoy > c.fechaFin) return "vencido";
  if (c.usosMaximos !== null && c.usosActuales >= c.usosMaximos) return "agotado";
  if (c.fechaInicio && hoy < c.fechaInicio) return "programado";
  return "activo";
}

export const NOMBRES_ESTADO_CUPON: Record<EstadoCuponAdmin, string> = {
  activo: "Activo",
  inactivo: "Inactivo",
  programado: "Programado",
  vencido: "Vencido",
  agotado: "Agotado",
};

/** Por qué un cupón no se puede usar ahora (mensaje para el cajero); null si está activo. */
export function motivoNoUsable(c: Vigencia, hoy: string): string | null {
  const fecha = (d: string) => d.split("-").reverse().join("/");
  switch (estadoCupon(c, hoy)) {
    case "activo":
      return null;
    case "inactivo":
      return "Este cupón está desactivado";
    case "vencido":
      return `Cupón vencido: valía hasta el ${fecha(c.fechaFin!)}`;
    case "agotado":
      return "Cupón agotado: ya alcanzó su límite de usos";
    case "programado":
      return `Este cupón vale desde el ${fecha(c.fechaInicio!)}`;
  }
}

/** Código nuevo, fácil de dictar: sin 0/O ni 1/I. `azar` devuelve un entero en [0, n). */
export function generarCodigo(azar: (n: number) => number, largo = 8) {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: largo }, () => letras[azar(letras.length)]).join("");
}

/** "10 %", "Bs 20,00" */
export const textoDescuentoCupon = (c: { tipo: string; valor: string }, formato: (m: string) => string) =>
  c.tipo === "porcentaje" ? `${Number(c.valor).toLocaleString("es-BO")} %` : formato(c.valor);
