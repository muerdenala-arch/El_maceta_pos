import "server-only";
import { opcionesFiltros, type OpcionesFiltros } from "@/lib/reportes/opciones";

/** Opciones de los filtros para el encargado: solo su sucursal y quienes venden en ella. */
export async function opcionesEncargado(sucursal: { id: number; nombre: string }, { conProductos = true } = {}): Promise<OpcionesFiltros> {
  const o = await opcionesFiltros({ conProductos });
  return { sucursales: [sucursal], cajeros: o.cajeros.filter((c) => c.sucursalId === sucursal.id), productos: o.productos };
}
