/**
 * Rol Encargado contra una base real (en memoria): vende como un cajero, supervisa solo su sucursal, recibe las
 * transferencias que le llegan, anula ventas con la caja abierta y autoriza con su PIN descuentos y anulaciones
 * en la pantalla del cajero. Nada de otra sucursal, ni pasando ids a mano.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { abrirCaja, cerrarCaja, registrarVenta, verComprobante } from "@/app/cajero/acciones";
import { anularVentaEnSucursal } from "@/app/cajero/ventas/acciones";
import { db } from "@/db";
import { alertas, auditoria, configuracion, inventario, transferencias, ventas } from "@/db/schema";
import { marcarAlertaLeida, marcarAlertaRevisada, marcarTodasLeidas, obtenerAlertas } from "@/lib/alertas/acciones";
import { conciliarAlertasStock } from "@/lib/alertas/motor";
import { pedirAutorizacion } from "@/lib/auth/autorizacion-acciones";
import { listarCajasAuditadas } from "@/lib/caja/auditadas";
import { cancelarTransferencia, crearTransferencia, recibirTransferencia } from "@/lib/inventario/acciones";
import { hoyEnBolivia } from "@/lib/formato";
import { comoUsuario, PINES, prepararBase, stock, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
  // Cajero hasta 5 %, encargado hasta 15 %.
  await db.update(configuracion).set({ descuentoManualMaximo: "5", descuentoManualMaximoEncargado: "15" }).where(eq(configuracion.id, 1));
  for (const u of [b.cajeroNorte, b.cajeroSur, b.encargadoNorte]) {
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
const ultimaAuditoria = async (accion: string) => (await db.select().from(auditoria).where(eq(auditoria.accion, accion))).at(-1)?.detalle as Record<string, unknown>;

describe("el encargado opera una caja como un cajero", () => {
  it("abre caja, vende en su sucursal y la venta sale de su stock", async () => {
    await comoUsuario(b.encargadoNorte);
    const antes = await stock(b.proteina.id, b.norte.id);
    const v = await ventaOk();
    expect(v.total).toBe("350.00");
    expect(await stock(b.proteina.id, b.norte.id)).toBe(antes - 1);
    const [fila] = await db.select().from(ventas).where(eq(ventas.id, v.ventaId));
    expect(fila).toMatchObject({ sucursalId: b.norte.id, cajeroId: b.encargadoNorte.id });
  });
});

describe("solo su sucursal", () => {
  it("ve los comprobantes de cualquier cajero de su sucursal, pero no los de otra", async () => {
    await comoUsuario(b.cajeroNorte);
    const norte = await ventaOk();
    await comoUsuario(b.cajeroSur);
    const sur = await ventaOk();

    await comoUsuario(b.encargadoNorte);
    expect((await verComprobante(norte.ventaId)).ok).toBe(true);
    expect(await verComprobante(sur.ventaId)).toEqual({ ok: false, error: "No puedes ver este comprobante" });
  });

  it("supervisa las cajas de su sucursal (abiertas en vivo); las de otra sucursal no aparecen", async () => {
    const hoy = hoyEnBolivia();
    const cajas = await listarCajasAuditadas({ desde: hoy, hasta: hoy, sucursalId: b.norte.id });
    expect(cajas.map((c) => c.cajero).sort()).toEqual(["Ana Norte", "Elsa Encargada Norte"]);
    expect(cajas.every((c) => c.estado === "abierta" && c.sucursal === "Sucursal Norte")).toBe(true);
  });

  it("recibe la transferencia que llega a su sucursal; la de otra sucursal \"no existe\" y no puede cancelar ninguna", async () => {
    await comoUsuario(b.admin);
    for (const destinoId of [b.norte.id, b.sur.id]) {
      expect(await crearTransferencia({ origenId: b.bodega.id, destinoId, nota: null, lineas: [{ productoId: b.proteina.id, cantidad: 3 }] })).toEqual({ ok: true });
    }
    const enCamino = await db.select().from(transferencias).where(eq(transferencias.estado, "enviada"));
    const paraNorte = enCamino.find((t) => t.destinoId === b.norte.id)!;
    const paraSur = enCamino.find((t) => t.destinoId === b.sur.id)!;

    await comoUsuario(b.encargadoNorte);
    const [norteAntes, surAntes] = [await stock(b.proteina.id, b.norte.id), await stock(b.proteina.id, b.sur.id)];
    expect(await recibirTransferencia({ id: paraSur.id })).toEqual({ ok: false, error: "La transferencia no existe" });
    expect(await stock(b.proteina.id, b.sur.id)).toBe(surAntes);
    expect((await cancelarTransferencia({ id: paraNorte.id })).ok).toBe(false);

    expect(await recibirTransferencia({ id: paraNorte.id })).toEqual({ ok: true });
    expect(await stock(b.proteina.id, b.norte.id)).toBe(norteAntes + 3);
    const [recibida] = await db.select().from(transferencias).where(eq(transferencias.id, paraNorte.id));
    expect(recibida).toMatchObject({ estado: "recibida", usuarioRecibeId: b.encargadoNorte.id });
    expect(await ultimaAuditoria("transferencia_recibida")).toMatchObject({ id: paraNorte.id, rol: "encargado" });
    // Un cajero no recibe transferencias.
    await comoUsuario(b.cajeroSur);
    expect((await recibirTransferencia({ id: paraSur.id })).ok).toBe(false);
  });
});

describe("campanita del encargado", () => {
  it("recibe solo las alertas de stock de su sucursal, que llevan a su inventario con el producto resaltado", async () => {
    await db.update(inventario).set({ cantidad: 0 }).where(and(eq(inventario.productoId, b.creatina.id), eq(inventario.ubicacionId, b.norte.id)));
    await db.update(inventario).set({ cantidad: 0 }).where(and(eq(inventario.productoId, b.proteina.id), eq(inventario.ubicacionId, b.sur.id)));
    await conciliarAlertasStock(db);
    await db.insert(alertas).values({ tipo: "caja_diferencia", sucursalId: b.norte.id, mensaje: "Caja con faltante" });

    await comoUsuario(b.encargadoNorte);
    const r = await obtenerAlertas();
    if (!r.ok) throw new Error(r.error);
    expect(r.datos.alertas.length).toBeGreaterThan(0);
    expect(r.datos.alertas.every((a) => ["stock_bajo", "agotado", "stock_negativo"].includes(a.tipo) && a.sucursal === "Sucursal Norte")).toBe(true);
    expect(r.datos.alertas.find((a) => a.tipo === "agotado")?.destino).toBe(`/cajero/bodega?resaltar=${b.creatina.id}`);
    expect(Object.keys(r.datos.porModulo)).toEqual(["/cajero/bodega"]);
  });

  it("su \"leída\" es independiente de la del administrador y no alcanza a las alertas de otra sucursal", async () => {
    await comoUsuario(b.encargadoNorte);
    const antes = await obtenerAlertas();
    if (!antes.ok) throw new Error(antes.error);
    const mia = antes.datos.alertas[0];
    const [ajena] = await db.select().from(alertas).where(and(eq(alertas.sucursalId, b.sur.id), eq(alertas.resuelta, false)));
    const [deCaja] = await db.select().from(alertas).where(eq(alertas.tipo, "caja_diferencia"));

    expect(await marcarAlertaLeida({ id: mia.id })).toEqual({ ok: true });
    await marcarAlertaLeida({ id: ajena.id });
    await marcarAlertaLeida({ id: deCaja.id });
    expect((await marcarAlertaRevisada({ id: deCaja.id })).ok).toBe(false);

    const filas = await db.select().from(alertas);
    expect(filas.find((a) => a.id === mia.id)).toMatchObject({ leidaEncargado: true, leida: false });
    expect(filas.find((a) => a.id === ajena.id)).toMatchObject({ leidaEncargado: false, leida: false });
    expect(filas.find((a) => a.id === deCaja.id)).toMatchObject({ leidaEncargado: false, leida: false, resuelta: false });

    expect(await marcarTodasLeidas()).toEqual({ ok: true });
    const despues = await obtenerAlertas();
    expect(despues.ok && despues.datos.noLeidas).toBe(0);
    // El administrador sigue teniéndolas sin leer.
    expect((await db.select().from(alertas).where(eq(alertas.resuelta, false))).every((a) => !a.leida)).toBe(true);
    expect((await db.select().from(alertas).where(eq(alertas.id, ajena.id)))[0].leidaEncargado).toBe(false);
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
    // Otro usuario.
    await comoUsuario(b.encargadoNorte);
    expect((await vender({ uuid, descuentoManual: descuento("20"), autorizacion: token })).ok).toBe(false);
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

  it("el encargado, cuando vende él, da hasta su máximo sin PIN y no más", async () => {
    await comoUsuario(b.encargadoNorte);
    const v = await ventaOk({ descuentoManual: descuento("15") });
    expect(v.total).toBe("297.50");
    expect((await db.select().from(ventas).where(eq(ventas.id, v.ventaId)))[0].descuentoAutorizadoPor).toBeNull();
    expect((await vender({ descuentoManual: descuento("16") })).ok).toBe(false);
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

  it("el cajero solo anula sus propias ventas, aunque tenga el PIN", async () => {
    await comoUsuario(b.encargadoNorte);
    const delEncargado = await ventaOk();
    await comoUsuario(b.cajeroNorte);
    const permiso = await pedirAutorizacion({ pin: PINES.elsa, proposito: "anulacion", ref: String(delEncargado.ventaId) });
    if (!permiso.ok) throw new Error(permiso.error);
    expect(await anularVentaEnSucursal({ id: delEncargado.ventaId, motivo, autorizacion: permiso.datos.token })).toEqual({ ok: false, error: "Solo puedes anular tus propias ventas" });
  });

  it("el encargado anula directamente las ventas de su sucursal, nunca las de otra", async () => {
    await comoUsuario(b.cajeroNorte);
    const norte = await ventaOk();
    const [surFila] = await db.select().from(ventas).where(and(eq(ventas.sucursalId, b.sur.id), eq(ventas.estado, "completada")));

    await comoUsuario(b.encargadoNorte);
    expect(await anularVentaEnSucursal({ id: surFila.id, motivo })).toEqual({ ok: false, error: "La venta no existe o ya estaba anulada" });
    expect((await db.select().from(ventas).where(eq(ventas.id, surFila.id)))[0].estado).toBe("completada");
    expect((await anularVentaEnSucursal({ id: norte.ventaId, motivo: "x" })).ok).toBe(false); // motivo obligatorio

    expect(await anularVentaEnSucursal({ id: norte.ventaId, motivo })).toEqual({ ok: true });
    expect(await ultimaAuditoria("venta_anulada")).toMatchObject({ ventaId: norte.ventaId, rol: "encargado", autorizadoPor: null });
    expect(await anularVentaEnSucursal({ id: norte.ventaId, motivo })).toEqual({ ok: false, error: "La venta no existe o ya estaba anulada" });
  });

  it("con la caja ya cerrada, ni el encargado: solo el administrador", async () => {
    await comoUsuario(b.cajeroNorte);
    const v = await ventaOk();
    const cierre = await cerrarCaja({ efectivoContado: "0" });
    expect(cierre.ok).toBe(true);

    await comoUsuario(b.encargadoNorte);
    expect(await anularVentaEnSucursal({ id: v.ventaId, motivo })).toEqual({ ok: false, error: "La caja de esta venta ya se cerró: solo el administrador puede anularla" });
    expect((await db.select().from(ventas).where(eq(ventas.id, v.ventaId)))[0].estado).toBe("completada");
  });
});
