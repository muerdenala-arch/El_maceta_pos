/**
 * El encargado en la caja (contra una base real en memoria): no vende; autoriza con su PIN, en la pantalla del cajero de su
 * sucursal, los descuentos mayores al máximo del cajero y las anulaciones con la caja aún abierta. (Sus apartados de
 * administración, con candado, se prueban en candados.integracion.test.ts).
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { abrirCaja, cerrarCaja, registrarVenta } from "@/app/cajero/acciones";
import { anularVentaEnSucursal } from "@/app/cajero/ventas/acciones";
import { db } from "@/db";
import { auditoria, configuracion, ventas } from "@/db/schema";
import { pedirAutorizacion } from "@/lib/auth/autorizacion-acciones";
import { comoUsuario, PINES, prepararBase, stock, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
  // Cajero hasta 5 %, encargado hasta 15 %.
  await db.update(configuracion).set({ descuentoManualMaximo: "5", descuentoManualMaximoEncargado: "15" }).where(eq(configuracion.id, 1));
  for (const u of [b.cajeroNorte, b.cajeroSur]) {
    await comoUsuario(u);
    expect(await abrirCaja({ montoInicial: "100" })).toEqual({ ok: true });
  }
});

type Extra = Partial<Parameters<typeof registrarVenta>[0]>;
const vender = (extra: Extra = {}) =>
  registrarVenta({ uuid: randomUUID(), lineas: [{ productoId: b.proteina.id, cantidad: 1 }], metodoPago: "efectivo", montoRecibido: "1000", clienteNombre: null, clienteTelefono: null, cuponCodigo: null, ...extra });
const ventaOk = async (extra: Extra = {}) => {
  const r = await vender(extra);
  if (!r.ok) throw new Error(r.error);
  return r.datos;
};
const descuento = (porcentaje: string) => ({ porcentaje, motivo: "Cliente frecuente" });
const SIN_PERMISO = { ok: false, error: "No tienes permiso para esta acción" };
const ultimaAuditoria = async (accion: string) => (await db.select().from(auditoria).where(eq(auditoria.accion, accion))).at(-1)?.detalle as Record<string, unknown>;

describe("el encargado no opera una caja", () => {
  it("no abre caja, no vende, no anula ni sincroniza ventas (eso es del cajero)", async () => {
    await comoUsuario(b.encargadoNorte);
    expect(await abrirCaja({ montoInicial: "100" })).toEqual(SIN_PERMISO);
    expect(await vender()).toEqual(SIN_PERMISO);
    expect(await anularVentaEnSucursal({ id: 1, motivo: "Prueba de permisos" })).toEqual(SIN_PERMISO);
    expect(await pedirAutorizacion({ pin: PINES.admin, proposito: "anulacion", ref: "1" })).toEqual(SIN_PERMISO);
  });
});

describe("autorización con PIN en la pantalla del cajero", () => {
  const pedir = (pin: string, ref: string, porcentaje: string | null = "10", proposito: "descuento" | "anulacion" = "descuento") => pedirAutorizacion({ pin, proposito, ref, porcentaje });

  it("solo vale el PIN del encargado de esa sucursal o de un administrador", async () => {
    await comoUsuario(b.cajeroNorte);
    const ref = randomUUID();
    for (const pin of [PINES.ana, PINES.beto, PINES.saul, "0000"]) {
      const r = await pedir(pin, ref);
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error).toMatch(/no es de un encargado de esta sucursal/);
    }
    expect(await ultimaAuditoria("autorizacion_fallida")).toMatchObject({ proposito: "descuento", sucursalId: b.norte.id });
    const deEncargado = await pedir(PINES.elsa, ref);
    expect(deEncargado.ok && deEncargado.datos).toMatchObject({ autorizador: "Elsa Encargada Norte", rol: "encargado" });
    const deAdmin = await pedir(PINES.admin, ref);
    expect(deAdmin.ok && deAdmin.datos.rol).toBe("admin");
  });

  it("5 PIN incorrectos seguidos bloquean las autorizaciones de ese usuario (ni el PIN correcto pasa)", async () => {
    await comoUsuario(b.cajeroSur);
    const ref = randomUUID();
    let ultimo = await pedir("0000", ref);
    for (let i = 0; i < 4; i++) ultimo = await pedir("0000", ref);
    expect(!ultimo.ok && ultimo.error).toMatch(/Demasiados intentos/);
    const conElBueno = await pedir(PINES.saul, ref);
    expect(!conElBueno.ok && conElBueno.error).toMatch(/Demasiados intentos/);
  });
});

describe("descuento manual por encima del máximo del cajero", () => {
  const autorizar = async (pin: string, uuid: string, porcentaje: string) => {
    const r = await pedirAutorizacion({ pin, proposito: "descuento", ref: uuid, porcentaje });
    if (!r.ok) throw new Error(r.error);
    return r.datos.token;
  };

  it("hasta su máximo el cajero no necesita PIN; por encima, sí", async () => {
    await comoUsuario(b.cajeroNorte);
    const libre = await ventaOk({ descuentoManual: descuento("5") });
    expect(libre.total).toBe("332.50");
    const sinPin = await vender({ descuentoManual: descuento("10") });
    expect(sinPin).toEqual({ ok: false, error: "Un descuento mayor a 5 % necesita el PIN del encargado o de un administrador" });
  });

  it("con el PIN del encargado se cobra, queda quién autorizó y va a auditoría", async () => {
    await comoUsuario(b.cajeroNorte);
    const uuid = randomUUID();
    const token = await autorizar(PINES.elsa, uuid, "10");
    const v = await ventaOk({ uuid, descuentoManual: descuento("10"), autorizacion: token });
    expect(v.total).toBe("315.00");
    const [fila] = await db.select().from(ventas).where(eq(ventas.id, v.ventaId));
    expect(fila).toMatchObject({ descuentoManual: "35.00", porcentajeDescuentoManual: "10.00", descuentoAutorizadoPor: b.encargadoNorte.id });
    expect(await ultimaAuditoria("descuento_manual")).toMatchObject({ ventaId: v.ventaId, autorizadoPor: "Elsa Encargada Norte", autorizadoPorId: b.encargadoNorte.id });
  });

  it("el permiso vale solo para ese cobro, ese porcentaje y ese cajero", async () => {
    await comoUsuario(b.cajeroNorte);
    const uuid = randomUUID();
    const token = await autorizar(PINES.elsa, uuid, "10");
    // Otro cobro con el mismo permiso.
    expect((await vender({ descuentoManual: descuento("10"), autorizacion: token })).ok).toBe(false);
    // Otro porcentaje.
    const otro = await vender({ uuid, descuentoManual: descuento("12"), autorizacion: token });
    expect(otro).toEqual({ ok: false, error: "Se autorizó otro porcentaje de descuento. Pide el PIN otra vez." });
    // Otro cajero.
    await comoUsuario(b.cajeroSur);
    expect((await vender({ uuid, descuentoManual: descuento("10"), autorizacion: token })).ok).toBe(false);
    // Algo que no es un permiso (p. ej. basura o una sesión).
    await comoUsuario(b.cajeroNorte);
    expect((await vender({ uuid, descuentoManual: descuento("10"), autorizacion: "x.y.z" })).ok).toBe(false);
  });

  it("el encargado autoriza hasta su máximo; por encima solo un administrador", async () => {
    await comoUsuario(b.cajeroNorte);
    const uuid = randomUUID();
    const deEncargado = await autorizar(PINES.elsa, uuid, "20");
    expect(await vender({ uuid, descuentoManual: descuento("20"), autorizacion: deEncargado })).toEqual({ ok: false, error: "El encargado puede autorizar hasta 15 %" });
    const deAdmin = await autorizar(PINES.admin, uuid, "20");
    const v = await ventaOk({ uuid, descuentoManual: descuento("20"), autorizacion: deAdmin });
    expect(v.total).toBe("280.00");
    expect((await db.select().from(ventas).where(eq(ventas.id, v.ventaId)))[0].descuentoAutorizadoPor).toBe(b.admin.id);
  });
});

describe("anulación en la sucursal", () => {
  const motivo = "El cliente devolvió el producto";

  it("el cajero no anula sin PIN; con el PIN del encargado sí, y el stock vuelve", async () => {
    await comoUsuario(b.cajeroNorte);
    const v = await ventaOk();
    const antes = await stock(b.proteina.id, b.norte.id);
    expect(await anularVentaEnSucursal({ id: v.ventaId, motivo })).toEqual({ ok: false, error: "Anular una venta necesita el PIN del encargado o de un administrador" });

    // Un permiso para otra venta no sirve.
    const paraOtra = await pedirAutorizacion({ pin: PINES.elsa, proposito: "anulacion", ref: String(v.ventaId + 1000) });
    expect((await anularVentaEnSucursal({ id: v.ventaId, motivo, autorizacion: paraOtra.ok ? paraOtra.datos.token : "" })).ok).toBe(false);
    // Ni uno de descuento.
    const deDescuento = await pedirAutorizacion({ pin: PINES.elsa, proposito: "descuento", ref: String(v.ventaId), porcentaje: "10" });
    expect((await anularVentaEnSucursal({ id: v.ventaId, motivo, autorizacion: deDescuento.ok ? deDescuento.datos.token : "" })).ok).toBe(false);
    expect((await db.select().from(ventas).where(eq(ventas.id, v.ventaId)))[0].estado).toBe("completada");

    const permiso = await pedirAutorizacion({ pin: PINES.elsa, proposito: "anulacion", ref: String(v.ventaId) });
    if (!permiso.ok) throw new Error(permiso.error);
    expect(await anularVentaEnSucursal({ id: v.ventaId, motivo, autorizacion: permiso.datos.token })).toEqual({ ok: true });
    expect((await db.select().from(ventas).where(eq(ventas.id, v.ventaId)))[0]).toMatchObject({ estado: "anulada", motivoAnulacion: motivo });
    expect(await stock(b.proteina.id, b.norte.id)).toBe(antes + 1);
    expect(await ultimaAuditoria("venta_anulada")).toMatchObject({ ventaId: v.ventaId, rol: "cajero", autorizadoPor: "Elsa Encargada Norte" });
  });

  it("el cajero solo anula sus propias ventas y de su sucursal, aunque tenga el PIN", async () => {
    await comoUsuario(b.cajeroNorte);
    const ajena = await ventaOk();
    await db.update(ventas).set({ cajeroId: b.admin.id }).where(eq(ventas.id, ajena.ventaId)); // como si la hubiera hecho otro
    const permiso = await pedirAutorizacion({ pin: PINES.elsa, proposito: "anulacion", ref: String(ajena.ventaId) });
    if (!permiso.ok) throw new Error(permiso.error);
    expect(await anularVentaEnSucursal({ id: ajena.ventaId, motivo, autorizacion: permiso.datos.token })).toEqual({ ok: false, error: "Solo puedes anular tus propias ventas" });

    // De otra sucursal: "no existe", aunque el encargado de esa sucursal dé su PIN.
    const [surFila] = await db.select().from(ventas).where(eq(ventas.sucursalId, b.sur.id));
    await comoUsuario(b.cajeroNorte);
    const deSaul = await pedirAutorizacion({ pin: PINES.saul, proposito: "anulacion", ref: String(surFila?.id ?? 999) });
    expect(deSaul.ok).toBe(false); // el encargado de Sur no autoriza en Norte
  });

  it("con la caja ya cerrada no se anula desde la caja, ni con PIN: solo desde Reportes de venta", async () => {
    await comoUsuario(b.cajeroNorte);
    const v = await ventaOk();
    const permiso = await pedirAutorizacion({ pin: PINES.elsa, proposito: "anulacion", ref: String(v.ventaId) });
    if (!permiso.ok) throw new Error(permiso.error);
    const cierre = await cerrarCaja({ efectivoContado: "0" });
    expect(cierre.ok).toBe(true);
    expect(await anularVentaEnSucursal({ id: v.ventaId, motivo, autorizacion: permiso.datos.token })).toEqual({ ok: false, error: "La caja de esta venta ya se cerró: solo el administrador puede anularla" });
    expect((await db.select().from(ventas).where(eq(ventas.id, v.ventaId)))[0].estado).toBe("completada");
  });
});
