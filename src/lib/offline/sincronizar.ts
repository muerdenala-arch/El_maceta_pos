/**
 * Cola de operaciones sin conexión y su sincronización (sección 8 del plan).
 * - Orden cronológico, en lotes; el servidor es idempotente por UUID → reintentar nunca duplica.
 * - Lo que el servidor confirma se borra de la cola; lo rechazado de forma permanente queda
 *   marcado "error" para revisión; los fallos de red se reintentan.
 */
"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { RespuestaSync } from "@/app/api/sync/route";
import { numeroComprobante } from "@/lib/comprobante/datos";
import { baseLocal, type Operacion } from "./base";

export type ResumenSync = {
  enviadas: number;
  conError: number;
  pendientes: number;
  /** La sesión venció: hay que volver a ingresar para enviar. */
  requiereIngreso?: boolean;
  sinConexion?: boolean;
};

const TAMANO_LOTE = 25;
let enCurso: Promise<ResumenSync> | null = null;
let usuarioActual: number | null = null;
const oyentes = new Set<(r: ResumenSync) => void>();

/** El cajero con sesión en este dispositivo (lo fija <Sincronizador>). */
export function fijarUsuarioSync(id: number | null) {
  usuarioActual = id;
}

export function alSincronizar(fn: (r: ResumenSync) => void) {
  oyentes.add(fn);
  return () => void oyentes.delete(fn);
}

export async function encolar(op: Operacion) {
  await baseLocal().cola.put(op);
}

async function pendientesDe(usuarioId: number) {
  return (await baseLocal().cola.where("usuarioId").equals(usuarioId).sortBy("creado")).filter((o) => o.estado === "pendiente");
}

/** Envía la cola del cajero actual. Si ya hay una sincronización en curso, devuelve esa misma. */
export function sincronizarAhora(): Promise<ResumenSync> {
  if (enCurso) return enCurso;
  enCurso = (async (): Promise<ResumenSync> => {
    const usuarioId = usuarioActual;
    if (usuarioId === null) return { enviadas: 0, conError: 0, pendientes: 0 };
    const base = baseLocal();
    if (!navigator.onLine) return { enviadas: 0, conError: 0, pendientes: (await pendientesDe(usuarioId)).length, sinConexion: true };

    let enviadas = 0;
    let conError = 0;
    for (;;) {
      const lote = (await pendientesDe(usuarioId)).slice(0, TAMANO_LOTE);
      if (lote.length === 0) break;

      let respuesta: Response;
      try {
        respuesta = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operaciones: lote.map((o) => ({ uuid: o.uuid, tipo: o.tipo, datos: o.datos })) }),
        });
      } catch {
        return { enviadas, conError, pendientes: (await pendientesDe(usuarioId)).length, sinConexion: true };
      }
      if (respuesta.status === 401) return { enviadas, conError, pendientes: lote.length, requiereIngreso: true };
      if (!respuesta.ok) break; // error del servidor: se reintenta en la próxima vuelta

      const { resultados } = (await respuesta.json()) as RespuestaSync;
      let avance = false;
      for (const r of resultados) {
        const op = lote.find((o) => o.uuid === r.uuid);
        if (!op) continue;
        if (r.ok) {
          avance = true;
          enviadas++;
          await base.transaction("rw", base.cola, base.ventasLocales, async () => {
            await base.cola.delete(r.uuid);
            if ("numero" in r) {
              // El comprobante provisional pasa a tener su número y enlace definitivos.
              const local = await base.ventasLocales.get(r.uuid);
              if (local) {
                await base.ventasLocales.put({
                  ...local,
                  sincronizada: true,
                  comprobante: {
                    ...local.comprobante,
                    venta: { ...local.comprobante.venta, id: r.ventaId, numero: r.numero, tokenPublico: r.tokenPublico, provisional: false },
                  },
                });
              }
            }
          });
        } else if (r.permanente) {
          avance = true;
          conError++;
          await base.cola.update(r.uuid, { estado: "error", error: r.error, intentos: op.intentos + 1 });
        } else {
          await base.cola.update(r.uuid, { intentos: op.intentos + 1, error: r.error });
        }
      }
      if (!avance) break; // todo el lote falló temporalmente: esperar al próximo intento
    }
    return { enviadas, conError, pendientes: (await pendientesDe(usuarioId)).length };
  })()
    .then((r) => {
      oyentes.forEach((fn) => fn(r));
      return r;
    })
    .finally(() => {
      enCurso = null;
    });
  return enCurso;
}

/** Cantidad de operaciones sin enviar en este dispositivo (se actualiza sola). */
export function usePendientes() {
  return useLiveQuery(async () => {
    const todas = await baseLocal().cola.toArray();
    return { pendientes: todas.filter((o) => o.estado === "pendiente").length, conError: todas.filter((o) => o.estado === "error").length };
  }, [], { pendientes: 0, conError: 0 });
}

/** Operaciones rechazadas por el servidor, para mostrarlas al cajero. */
export function useOperacionesConError() {
  return useLiveQuery(() => baseLocal().cola.where("estado").equals("error").toArray(), [], []);
}

export const etiquetaOperacion = (o: Operacion) =>
  o.tipo === "venta" ? `Venta sin conexión ${o.uuid.slice(0, 8).toUpperCase()}` : `Gasto ${o.datos.categoria}`;

export { numeroComprobante };
