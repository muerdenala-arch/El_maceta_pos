/**
 * Base local del dispositivo (IndexedDB con Dexie) para funcionar sin internet (sección 8 del plan).
 * Solo se usa en el navegador.
 */
import Dexie, { type Table } from "dexie";
import type { ProductoPos, QrCobro } from "@/lib/caja/consultas";
import type { ComboPos } from "@/lib/combos/calculo";
import type { DatosComprobante } from "@/lib/comprobante/datos";
import type { Promocion } from "@/lib/promociones/motor";
import type { DatosGastoOffline, DatosVentaOffline } from "@/lib/validaciones/caja";

/** Copia local de lo necesario para vender: se actualiza cada vez que el POS carga con conexión. */
export type Instantanea = {
  /** `pos:<usuarioId>` */
  clave: string;
  usuarioId: number;
  cajaId: number;
  sucursalId: number;
  cajero: string;
  productos: ProductoPos[];
  qrs: QrCobro[];
  promociones: Promocion[];
  /** Combos vigentes (las copias guardadas antes de que existieran no lo traen). */
  combos?: ComboPos[];
  /** Máximo descuento manual del cajero, en % ("0" = no puede). Las copias antiguas no lo traen. */
  descuentoManualMaximo?: string;
  /** Hasta qué % puede autorizar el encargado con su PIN (con conexión). */
  descuentoManualConPin?: string;
  /** Datos del negocio y la sucursal para imprimir comprobantes sin conexión. */
  baseComprobante: Pick<DatosComprobante, "negocio" | "sucursal">;
  /** ms: momento en que el servidor generó estos datos (o de la última venta local). */
  actualizado: number;
};

export type Operacion =
  | { uuid: string; tipo: "venta"; usuarioId: number; creado: number; datos: DatosVentaOffline; estado: EstadoOperacion; intentos: number; error?: string }
  | { uuid: string; tipo: "gasto"; usuarioId: number; creado: number; datos: DatosGastoOffline; estado: EstadoOperacion; intentos: number; error?: string };
/** pendiente: se enviará; error: el servidor la rechazó y necesita revisión. */
export type EstadoOperacion = "pendiente" | "error";

/** Comprobante de una venta hecha en este dispositivo (provisional hasta sincronizar). */
export type VentaLocal = {
  uuid: string;
  usuarioId: number;
  creado: number;
  comprobante: DatosComprobante;
  sincronizada: boolean;
};

/** Verificador del PIN para desbloquear sin conexión (nunca el PIN en texto). */
export type CredencialLocal = {
  usuario: string;
  usuarioId: number;
  sal: string;
  hash: string;
  iteraciones: number;
  intentosFallidos: number;
};

class BaseLocal extends Dexie {
  instantaneas!: Table<Instantanea, string>;
  cola!: Table<Operacion, string>;
  ventasLocales!: Table<VentaLocal, string>;
  credenciales!: Table<CredencialLocal, string>;

  constructor() {
    super("el-maseta");
    this.version(1).stores({
      instantaneas: "clave",
      cola: "uuid, creado, usuarioId, estado",
      ventasLocales: "uuid, creado, usuarioId",
      credenciales: "usuario",
    });
  }
}

let instancia: BaseLocal | null = null;
/** La base se abre recién en el navegador (en el servidor no existe IndexedDB). */
export function baseLocal() {
  instancia ??= new BaseLocal();
  return instancia;
}
