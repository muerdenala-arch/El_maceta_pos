/**
 * Lo crítico de la sección 10 del plan contra una base real (en memoria):
 * venta (una transacción, idempotente, precios de la BD), cierre de caja (diferencia y alerta),
 * anulación y sincronización sin conexión sin duplicados.
 */
import { randomUUID } from "node:crypto";
import { and, count, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { anularVenta, confirmarPagoQr } from "@/app/admin/reportes/acciones";
import { POST as sincronizar } from "@/app/api/sync/route";
import { abrirCaja, cerrarCaja, registrarGasto, registrarVenta } from "@/app/cajero/acciones";
import { db } from "@/db";
import { alertas, auditoria, cajas, detalleVenta, movimientosInventario, ventas } from "@/db/schema";
import { comoUsuario, prepararBase, stock, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
});

const venta = (lineas: { productoId: number; cantidad: number }[], extra: Partial<Parameters<typeof registrarVenta>[0]> = {}) =>
  registrarVenta({ uuid: randomUUID(), lineas, metodoPago: "efectivo", montoRecibido: "1000", clienteNombre: null, clienteTelefono: null, cuponCodigo: null, ...extra });

const cantidadVentas = async () => (await db.select({ n: count() }).from(ventas))[0].n;

describe("venta", () => {
  it("un cajero no puede vender sin haber abierto caja", async () => {
    await comoUsuario(b.cajeroNorte);
    const r = await venta([{ productoId: b.proteina.id, cantidad: 1 }]);
    expect(r).toEqual({ ok: false, error: "Tu caja está cerrada. Ábrela antes de vender." });
    expect(await cantidadVentas()).toBe(0);
  });

  it("registra la venta con precios de la BD, cambio, número correlativo, stock y costo", async () => {
    await comoUsuario(b.cajeroNorte);
    expect(await abrirCaja({ montoInicial: "100" })).toEqual({ ok: true });

    const r = await venta([{ productoId: b.proteina.id, cantidad: 2 }], { montoRecibido: "750" });
    if (!r.ok) throw new Error(r.error);
    expect(r.datos).toMatchObject({ numero: 1, total: "700.00", cambio: "50.00", metodoPago: "efectivo" });
    expect(r.datos.comprobante?.venta.lineas).toHaveLength(1);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(8);

    const [linea] = await db.select().from(detalleVenta).where(eq(detalleVenta.ventaId, r.datos.ventaId));
    expect(linea).toMatchObject({ cantidad: 2, precioUnitario: "350.00", costoUnitario: "280.50" });
    const movs = await db.select().from(movimientosInventario).where(eq(movimientosInventario.referencia, "Venta #1"));
    expect(movs.map((m) => m.cantidad)).toEqual([-2]);

    const otra = await venta([{ productoId: b.creatina.id, cantidad: 1 }]);
    expect(otra.ok && otra.datos.numero).toBe(2);
  });

  it("el efectivo recibido tiene que alcanzar", async () => {
    await comoUsuario(b.cajeroNorte);
    const r = await venta([{ productoId: b.proteina.id, cantidad: 1 }], { montoRecibido: "300" });
    expect(r.ok).toBe(false);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(8);
  });

  it("sin stock suficiente no se guarda nada (ni venta, ni detalle, ni movimiento)", async () => {
    await comoUsuario(b.cajeroNorte);
    const antes = await cantidadVentas();
    const r = await venta([
      { productoId: b.creatina.id, cantidad: 1 },
      { productoId: b.proteina.id, cantidad: 99 },
    ]);
    expect(r.ok).toBe(false);
    expect(await cantidadVentas()).toBe(antes);
    expect(await stock(b.creatina.id, b.norte.id)).toBe(4);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(8);
  });

  it("el mismo cobro enviado 3 veces a la vez es una sola venta", async () => {
    await comoUsuario(b.cajeroNorte);
    const uuid = randomUUID();
    const antes = await cantidadVentas();
    const envio = () => venta([{ productoId: b.proteina.id, cantidad: 1 }], { uuid });
    const rs = await Promise.all([envio(), envio(), envio()]);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(new Set(rs.map((r) => r.ok && r.datos.ventaId)).size).toBe(1);
    expect(await cantidadVentas()).toBe(antes + 1);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(7);
  });

  it("la numeración es por sucursal y cada cajero vende solo en la suya", async () => {
    await comoUsuario(b.cajeroSur);
    await abrirCaja({ montoInicial: "0" });
    const r = await venta([{ productoId: b.proteina.id, cantidad: 1 }]);
    expect(r.ok && r.datos.numero).toBe(1);
    expect(await stock(b.proteina.id, b.sur.id)).toBe(3);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(7);
  });
});

describe("cierre de caja", () => {
  it("esperado = inicial + efectivo − gastos (el QR no entra); si no cuadra, alerta", async () => {
    await comoUsuario(b.cajeroNorte);
    const qr = await venta([{ productoId: b.creatina.id, cantidad: 1 }], { metodoPago: "qr", montoRecibido: null });
    expect(qr.ok).toBe(true);
    expect(await registrarGasto({ uuid: randomUUID(), categoria: "Transporte", monto: "20", descripcion: "Taxi", fotoUrl: null })).toEqual({ ok: true });

    // 100 inicial + 700 + 120 + 350 en efectivo − 20 de gasto = 1250 (la venta QR de 120 no suma).
    const r = await cerrarCaja({ efectivoContado: "1245" });
    expect(r).toEqual({ ok: true, datos: { esperado: "1250.00", contado: "1245", diferencia: "-5.00" } });

    const [alerta] = await db.select().from(alertas).where(eq(alertas.tipo, "caja_diferencia"));
    expect(alerta.mensaje).toBe("Caja de Ana Norte (Sucursal Norte) cerrada con faltante de Bs 5,00");
    const [caja] = await db.select().from(cajas).where(eq(cajas.id, alerta.cajaId!));
    expect(caja).toMatchObject({ estado: "cerrada", esperado: "1250.00", efectivoContado: "1245.00", diferencia: "-5.00", ventasQr: "120.00" });
  });

  it("con la caja cerrada ya no se vende ni se vuelve a cerrar", async () => {
    await comoUsuario(b.cajeroNorte);
    expect((await venta([{ productoId: b.proteina.id, cantidad: 1 }])).ok).toBe(false);
    expect(await cerrarCaja({ efectivoContado: "0" })).toEqual({ ok: false, error: "No tienes una caja abierta" });
  });

  it("si cuadra, no hay alerta", async () => {
    await comoUsuario(b.cajeroSur);
    const r = await cerrarCaja({ efectivoContado: "350" });
    expect(r.ok && r.datos.diferencia).toBe("0.00");
    expect(await db.select().from(alertas).where(eq(alertas.tipo, "caja_diferencia"))).toHaveLength(1);
  });
});

describe("anular venta (admin)", () => {
  it("devuelve el stock, deja la venta anulada con motivo y queda en auditoría", async () => {
    await comoUsuario(b.cajeroNorte);
    await abrirCaja({ montoInicial: "0" });
    const r = await venta([{ productoId: b.proteina.id, cantidad: 3 }], { montoRecibido: "1050" });
    if (!r.ok) throw new Error(r.error);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(4);

    await comoUsuario(b.admin);
    expect(await anularVenta({ id: r.datos.ventaId, motivo: "x" })).toMatchObject({ ok: false });
    expect(await anularVenta({ id: r.datos.ventaId, motivo: "Devolución del cliente" })).toEqual({ ok: true });
    expect(await stock(b.proteina.id, b.norte.id)).toBe(7);
    const [v] = await db.select().from(ventas).where(eq(ventas.id, r.datos.ventaId));
    expect(v).toMatchObject({ estado: "anulada", motivoAnulacion: "Devolución del cliente" });
    expect(await db.select().from(auditoria).where(eq(auditoria.accion, "venta_anulada"))).toHaveLength(1);

    // Anular dos veces no devuelve el stock dos veces.
    expect((await anularVenta({ id: r.datos.ventaId, motivo: "Otra vez" })).ok).toBe(false);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(7);
  });
});

describe("sincronización sin conexión", () => {
  const pedido = (operaciones: unknown[]) =>
    sincronizar(new Request("http://localhost/api/sync", { method: "POST", body: JSON.stringify({ operaciones }) }));

  it("reenviar el mismo lote no duplica ventas ni gastos", async () => {
    await comoUsuario(b.cajeroNorte);
    const [caja] = await db.select().from(cajas).where(and(eq(cajas.cajeroId, b.cajeroNorte.id), eq(cajas.estado, "abierta")));
    const uv = randomUUID();
    const ug = randomUUID();
    const lote = [
      {
        uuid: uv,
        tipo: "venta",
        datos: {
          uuid: uv,
          cajaId: caja.id,
          fecha: Date.now() - 60_000,
          lineas: [{ productoId: b.proteina.id, cantidad: 1, precioUnitario: "350.00", descuento: "0.00", promocionId: null }],
          metodoPago: "efectivo",
          montoRecibido: "400",
          clienteNombre: null,
          clienteTelefono: null,
        },
      },
      { uuid: ug, tipo: "gasto", datos: { uuid: ug, cajaId: caja.id, fecha: Date.now() - 30_000, categoria: "Limpieza", monto: "15", descripcion: null } },
    ];
    const antes = await cantidadVentas();
    const r1 = await (await pedido(lote)).json();
    const r2 = await (await pedido(lote)).json();
    expect(r1.resultados.every((x: { ok: boolean }) => x.ok)).toBe(true);
    expect(r2.resultados[0].numero).toBe(r1.resultados[0].numero);
    expect(await cantidadVentas()).toBe(antes + 1);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(6);
  });

  it("stock negativo, QR sin verificar y precio distinto se registran con sus alertas", async () => {
    await comoUsuario(b.cajeroNorte);
    const [caja] = await db.select().from(cajas).where(and(eq(cajas.cajeroId, b.cajeroNorte.id), eq(cajas.estado, "abierta")));
    const uuid = randomUUID();
    const r = await (
      await pedido([
        {
          uuid,
          tipo: "venta",
          datos: {
            uuid,
            cajaId: caja.id,
            fecha: Date.now(),
            lineas: [{ productoId: b.proteina.id, cantidad: 8, precioUnitario: "340.00", descuento: "0.00", promocionId: null }],
            metodoPago: "qr",
            montoRecibido: null,
            clienteNombre: null,
            clienteTelefono: null,
          },
        },
      ])
    ).json();
    expect(r.resultados[0].ok).toBe(true);
    expect(await stock(b.proteina.id, b.norte.id)).toBe(-2);
    const tipos = (await db.select({ tipo: alertas.tipo }).from(alertas).where(eq(alertas.resuelta, false))).map((a) => a.tipo);
    expect(tipos).toEqual(expect.arrayContaining(["stock_negativo", "qr_por_confirmar", "revision_offline"]));

    // El admin confirma el QR: la venta queda pagada y su alerta resuelta.
    await comoUsuario(b.admin);
    expect(await confirmarPagoQr({ id: r.resultados[0].ventaId })).toEqual({ ok: true });
    const [v] = await db.select().from(ventas).where(eq(ventas.id, r.resultados[0].ventaId));
    expect(v.estadoPago).toBe("pagado");
    const pendientesQr = await db.select().from(alertas).where(and(eq(alertas.tipo, "qr_por_confirmar"), eq(alertas.resuelta, false)));
    expect(pendientesQr).toHaveLength(0);
  });

  it("una venta de una caja ya cerrada se rechaza como permanente", async () => {
    await comoUsuario(b.cajeroSur);
    const [cerrada] = await db.select().from(cajas).where(eq(cajas.cajeroId, b.cajeroSur.id));
    const uuid = randomUUID();
    const r = await (
      await pedido([
        {
          uuid,
          tipo: "venta",
          datos: {
            uuid,
            cajaId: cerrada.id,
            fecha: Date.now(),
            lineas: [{ productoId: b.proteina.id, cantidad: 1, precioUnitario: "350.00", descuento: "0.00", promocionId: null }],
            metodoPago: "qr",
            montoRecibido: null,
            clienteNombre: null,
            clienteTelefono: null,
          },
        },
      ])
    ).json();
    expect(r.resultados[0]).toMatchObject({ ok: false, permanente: true });
  });
});
