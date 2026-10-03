/**
 * Fallos de lógica hallados en la auditoría del sistema, contra una base real en memoria:
 * una caja no puede quedar abierta sin nadie que la cierre, y una categoría en uso por un descuento no se elimina.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { cerrarCajaPendiente } from "@/app/admin/auditoria/acciones";
import { eliminarCategoria, guardarCategoria } from "@/app/admin/catalogo/acciones";
import { cambiarEstadoUsuario, editarUsuario } from "@/app/admin/personal/acciones";
import { guardarPromocion } from "@/app/admin/promociones/acciones";
import { cambiarEstadoSucursal } from "@/app/admin/sucursales/acciones";
import { abrirCaja, cerrarCaja, registrarVenta } from "@/app/cajero/acciones";
import { GET as despachar } from "@/app/api/recordatorios/despachar/route";
import { db } from "@/db";
import { alertas, auditoria, cajas, categorias, cupones, transferencias, usuarios } from "@/db/schema";
import { MENSAJE_CANDADO } from "@/lib/acciones/resultado";
import { destinoAlerta, moduloDeAlerta } from "@/lib/alertas/reglas";
import { conciliarAlertasCajas } from "@/lib/caja/alertas";
import { listarCajasAuditadas } from "@/lib/caja/auditadas";
import { hoyEnBolivia } from "@/lib/formato";
import { cancelarTransferencia, crearTransferencia } from "@/lib/inventario/acciones";
import { comoUsuario, prepararBase, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
});

const dia = (n: number) => hoyEnBolivia(new Date(Date.now() + n * 86_400_000));
const SIN_PERMISO = { ok: false, error: "No tienes permiso para esta acción" };
const cajaDe = async (cajeroId: number) => (await db.select().from(cajas).where(eq(cajas.cajeroId, cajeroId)))[0];

describe("una caja abierta nunca queda sin nadie que pueda cerrarla", () => {
  it("con la caja abierta no se le cambia el rol ni la sucursal al cajero", async () => {
    await comoUsuario(b.cajeroNorte);
    expect(await abrirCaja({ montoInicial: "100" })).toEqual({ ok: true });
    const venta = await registrarVenta({
      uuid: crypto.randomUUID(),
      lineas: [{ productoId: b.creatina.id, cantidad: 1 }],
      combos: [],
      metodoPago: "efectivo",
      montoRecibido: "120",
      qrId: null,
      cliente: null,
      cuponCodigo: null,
    } as never);
    expect(venta.ok).toBe(true);

    await comoUsuario(b.admin);
    const datos = { id: b.cajeroNorte.id, nombre: "Ana", usuario: "ana", rol: "cajero" as const, sucursalId: b.norte.id, activo: true };
    expect(await editarUsuario({ ...datos, sucursalId: b.sur.id } as never)).toMatchObject({ ok: false, error: expect.stringMatching(/Tiene una caja abierta/) });
    expect(await editarUsuario({ ...datos, rol: "encargado" } as never)).toMatchObject({ ok: false, error: expect.stringMatching(/Tiene una caja abierta/) });
    expect(await editarUsuario({ ...datos, nombre: "Ana María" } as never)).toEqual({ ok: true }); // lo demás sí
  });

  it("si el cajero se va sin cerrar, la caja sigue a la vista en Auditoría aunque sea de otro día", async () => {
    await comoUsuario(b.admin);
    expect(await cambiarEstadoUsuario({ id: b.cajeroNorte.id, activo: false })).toEqual({ ok: true });
    await db.update(cajas).set({ apertura: new Date(Date.now() - 6 * 86_400_000) });
    const hoy = hoyEnBolivia();
    const vistas = await listarCajasAuditadas({ desde: hoy, hasta: hoy, sucursalId: null });
    expect(vistas).toHaveLength(1);
    expect(vistas[0]).toMatchObject({ estado: "abierta", esperado: "220.00" }); // 100 iniciales + 120 en efectivo
    expect(await listarCajasAuditadas({ desde: hoy, hasta: hoy, sucursalId: b.sur.id })).toEqual([]); // el filtro de sucursal sigue valiendo
  });

  it("pasadas 24 horas abierta aparece la alerta «Caja sin cerrar» (una sola), que lleva a esa caja", async () => {
    const caja = await cajaDe(b.cajeroNorte.id);
    const abiertas = () => db.select().from(alertas).where(and(eq(alertas.tipo, "caja_abierta"), eq(alertas.resuelta, false)));
    // Con 23 horas todavía no.
    await db.update(cajas).set({ apertura: new Date(Date.now() - 23 * 3_600_000) });
    await conciliarAlertasCajas();
    expect(await abiertas()).toEqual([]);

    await db.update(cajas).set({ apertura: new Date(Date.now() - 25 * 3_600_000) });
    await conciliarAlertasCajas();
    await conciliarAlertasCajas(); // repetir no la duplica
    const [alerta, ...mas] = await abiertas();
    expect(mas).toEqual([]);
    expect(alerta).toMatchObject({ cajaId: caja.id, sucursalId: b.norte.id, mensaje: expect.stringMatching(/^La caja de Ana María \(Sucursal Norte\) sigue abierta desde el .*: ciérrala en Auditoría de caja$/) });
    expect(destinoAlerta({ ...alerta, tipo: "caja_abierta" })).toBe(`/admin/auditoria?vista=cajas&caja=${caja.id}`);
    expect(moduloDeAlerta("caja_abierta")).toBe("/admin/auditoria");
  });

  it("el administrador la cierra desde Auditoría, con motivo, y queda igual que un cierre normal", async () => {
    const caja = await cajaDe(b.cajeroNorte.id);
    await comoUsuario(b.cajeroSur);
    expect(await cerrarCajaPendiente({ id: caja.id, efectivoContado: "220", motivo: "Se fue sin cerrar" })).toEqual(SIN_PERMISO);
    await comoUsuario(b.encargadoNorte);
    expect(await cerrarCajaPendiente({ id: caja.id, efectivoContado: "220", motivo: "Se fue sin cerrar" })).toEqual({ ok: false, error: MENSAJE_CANDADO });

    await comoUsuario(b.admin);
    expect(await cerrarCajaPendiente({ id: caja.id, efectivoContado: "220", motivo: "" })).toMatchObject({ ok: false, campos: { motivo: expect.any(String) } });
    expect(await cerrarCajaPendiente({ id: caja.id, efectivoContado: "200", motivo: "Se fue sin cerrar la caja" })).toEqual({ ok: true });
    expect(await cajaDe(b.cajeroNorte.id)).toMatchObject({ estado: "cerrada", esperado: "220.00", efectivoContado: "200.00", diferencia: "-20.00", ventasEfectivo: "120.00" });
    // Al cerrarse, la alerta de caja sin cerrar se resuelve sola.
    expect(await db.select().from(alertas).where(and(eq(alertas.tipo, "caja_abierta"), eq(alertas.resuelta, false)))).toEqual([]);
    expect(await db.select().from(alertas).where(eq(alertas.tipo, "caja_abierta"))).toHaveLength(1);
    const [alerta] = await db.select().from(alertas).where(eq(alertas.tipo, "caja_diferencia"));
    expect(alerta).toMatchObject({ cajaId: caja.id, mensaje: expect.stringMatching(/faltante de Bs 20,00/) });
    const [a] = await db.select().from(auditoria).where(eq(auditoria.accion, "caja_cerrada_admin"));
    expect(a).toMatchObject({ usuarioId: b.admin.id, detalle: { cajaId: caja.id, motivo: "Se fue sin cerrar la caja", diferencia: "-20.00" } });

    // Ya cerrada: ni se cierra dos veces ni el cajero (reactivado) la puede volver a cerrar.
    expect(await cerrarCajaPendiente({ id: caja.id, efectivoContado: "220", motivo: "Otra vez" })).toEqual({ ok: false, error: "Esa caja ya está cerrada" });
    expect(await cambiarEstadoUsuario({ id: b.cajeroNorte.id, activo: true })).toEqual({ ok: true });
    await comoUsuario(b.cajeroNorte);
    expect(await cerrarCaja({ efectivoContado: "0" })).toEqual({ ok: false, error: "No tienes una caja abierta" });
    // Y ya sin caja abierta sí se lo puede cambiar de sucursal.
    await comoUsuario(b.admin);
    expect(await editarUsuario({ id: b.cajeroNorte.id, nombre: "Ana", usuario: "ana", rol: "cajero", sucursalId: b.sur.id, activo: true } as never)).toEqual({ ok: true });
  });
});

describe("desactivar una sucursal", () => {
  it("no se puede con una caja abierta ni con una transferencia en camino", async () => {
    // Sur: su cajero abre caja y luego lo desactivan; el encargado de Sur también se desactiva.
    await comoUsuario(b.cajeroSur);
    expect(await abrirCaja({ montoInicial: "50" })).toEqual({ ok: true });
    await comoUsuario(b.admin);
    await db.update(usuarios).set({ activo: false }).where(eq(usuarios.sucursalId, b.sur.id));
    expect(await cambiarEstadoSucursal({ id: b.sur.id, activo: false })).toEqual({ ok: false, error: "Tiene una caja abierta: ciérrala primero (Auditoría de caja)" });
    const caja = await cajaDe(b.cajeroSur.id);
    expect(await cerrarCajaPendiente({ id: caja.id, efectivoContado: "50", motivo: "Se cierra la sucursal" })).toEqual({ ok: true });

    expect(await crearTransferencia({ origenId: b.bodega.id, destinoId: b.sur.id, nota: null, lineas: [{ productoId: b.proteina.id, cantidad: 1 }] })).toEqual({ ok: true });
    expect(await cambiarEstadoSucursal({ id: b.sur.id, activo: false })).toEqual({ ok: false, error: "Tiene una transferencia en camino: recíbela o cancélala primero" });
    const [t] = await db.select().from(transferencias);
    expect(await cancelarTransferencia({ id: t.id })).toMatchObject({ ok: true });
    expect(await cambiarEstadoSucursal({ id: b.sur.id, activo: false })).toEqual({ ok: true });
  });
});

describe("categorías en uso", () => {
  it("no se elimina una categoría que usa un descuento automático o un cupón", async () => {
    await comoUsuario(b.admin);
    const nueva = await guardarCategoria({ nombre: "Ofertas" });
    if (!nueva.ok) throw new Error(nueva.error);
    const id = nueva.datos.id;
    expect(
      await guardarPromocion({ nombre: "Semana de ofertas", tipo: "porcentaje", valor: "10", comboLleva: null, comboPaga: null, alcance: "categoria", productoIds: [], categoriaIds: [id], sucursalId: null, desde: dia(-1), hasta: dia(1), requiereCupon: false, activo: true } as never),
    ).toEqual({ ok: true });
    expect(await eliminarCategoria({ id })).toEqual({ ok: false, error: 'La usa el descuento "Semana de ofertas": quítala de ese descuento antes de eliminarla' });

    const { promociones } = await import("@/db/schema");
    await db.delete(promociones);
    await db.insert(cupones).values({ codigo: "OFERTA", tipo: "porcentaje", valor: "5", alcance: "categorias", categoriaIds: [id] });
    expect(await eliminarCategoria({ id })).toEqual({ ok: false, error: "La usa el cupón OFERTA: quítala de ese cupón antes de eliminarla" });

    await db.delete(cupones);
    expect(await eliminarCategoria({ id })).toEqual({ ok: true });
    expect(await db.select().from(categorias).where(eq(categorias.id, id))).toEqual([]);
  });
});

describe("disparador público de avisos", () => {
  it("llamarlo sin parar no hace trabajar a la base cada vez", async () => {
    const respuestas = await Promise.all([despachar(), despachar(), despachar()]);
    expect(respuestas.map((r) => r.status)).toEqual([200, 200, 200]);
  });
});
