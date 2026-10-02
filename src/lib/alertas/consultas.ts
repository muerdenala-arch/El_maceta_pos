import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { alertas, sucursales } from "@/db/schema";
import { destinoAlerta, destinoAlertaEncargado, moduloDeAlerta, TIPOS_AUTOMATICOS, TIPOS_ENCARGADO, type TipoAlerta } from "./reglas";

/** A quién se le muestran: al administrador (todas) o al encargado (solo stock de su sucursal, con su propio "leída"). */
export type VistaAlertas = { rol: "admin" | "encargado" | "cajero"; sucursalId: number | null };
const esEncargado = (v?: VistaAlertas) => !!v && v.rol !== "admin";
const filtroEncargado = (v: VistaAlertas) => and(eq(alertas.sucursalId, v.sucursalId ?? -1), inArray(alertas.tipo, TIPOS_ENCARGADO));

export type AlertaCampanita = {
  id: number;
  tipo: TipoAlerta;
  mensaje: string;
  sucursal: string | null;
  leida: boolean;
  fecha: string;
  destino: string;
  /** Se resuelve sola (stock, vencimientos); si no, el admin la marca como revisada. */
  automatica: boolean;
};

export async function listarAlertasPendientes(limite = 50, vista?: VistaAlertas): Promise<AlertaCampanita[]> {
  const leida = esEncargado(vista) ? alertas.leidaEncargado : alertas.leida;
  const filas = await db
    .select({
      id: alertas.id,
      tipo: alertas.tipo,
      mensaje: alertas.mensaje,
      sucursal: sucursales.nombre,
      tipoSucursal: sucursales.tipo,
      leida,
      fecha: alertas.fecha,
      productoId: alertas.productoId,
      sucursalId: alertas.sucursalId,
      cajaId: alertas.cajaId,
      ventaId: alertas.ventaId,
      eventoId: alertas.eventoId,
    })
    .from(alertas)
    .leftJoin(sucursales, eq(sucursales.id, alertas.sucursalId))
    .where(and(eq(alertas.resuelta, false), esEncargado(vista) ? filtroEncargado(vista!) : undefined))
    // Sin leer primero, luego las más recientes.
    .orderBy(leida, desc(alertas.fecha))
    .limit(limite);

  return filas.map((f) => ({
    id: f.id,
    tipo: f.tipo,
    mensaje: f.mensaje,
    sucursal: f.sucursal,
    leida: f.leida,
    fecha: f.fecha.toISOString(),
    destino: esEncargado(vista) ? destinoAlertaEncargado(f.productoId) : destinoAlerta({ ...f, enBodega: f.tipoSucursal === "bodega" }),
    automatica: TIPOS_AUTOMATICOS.includes(f.tipo),
  }));
}

/** Contador de la campanita y numeritos por módulo del menú. */
export async function resumenAlertas(vista?: VistaAlertas): Promise<{ noLeidas: number; porModulo: Record<string, number> }> {
  const leida = esEncargado(vista) ? alertas.leidaEncargado : alertas.leida;
  const filas = await db
    .select({ tipo: alertas.tipo, total: sql<number>`count(*)::int`, noLeidas: sql<number>`count(*) filter (where not ${leida})::int` })
    .from(alertas)
    .where(and(eq(alertas.resuelta, false), esEncargado(vista) ? filtroEncargado(vista!) : undefined))
    .groupBy(alertas.tipo);
  const porModulo: Record<string, number> = {};
  let noLeidas = 0;
  for (const f of filas) {
    noLeidas += f.noLeidas;
    const m = esEncargado(vista) ? "/cajero/bodega" : moduloDeAlerta(f.tipo);
    porModulo[m] = (porModulo[m] ?? 0) + f.total;
  }
  return { noLeidas, porModulo };
}

