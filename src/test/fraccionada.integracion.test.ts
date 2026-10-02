/**
 * Venta fraccionada contra la base en memoria: activar el fraccionado convierte el stock a unidades sueltas,
 * ingresos y transferencias van por envases, se vende por frasco o por cápsulas (validando el total),
 * el mínimo y las alertas siguen en frascos, anular devuelve lo que salió y funciona sin conexión.
 */
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { guardarProducto } from "@/app/admin/catalogo/acciones";
import { anularVenta } from "@/app/admin/reportes/acciones";
import { POST as sincronizar } from "@/app/api/sync/route";
import { abrirCaja, registrarVenta } from "@/app/cajero/acciones";
import { db } from "@/db";
import { alertas, auditoria, cajas, detalleTransferencia, detalleVenta, lotes, productos, transferencias } from "@/db/schema";
import { hoyEnBolivia } from "@/lib/formato";
import { lineasDeVentas, resumenVentas, ventasPorProducto } from "@/lib/reportes/ventas";
import { ajustarStock, crearTransferencia, recibirTransferencia, registrarIngreso } from "@/lib/inventario/acciones";
import { comoUsuario, prepararBase, stock, type Base } from "./base";

let b: Base;
let omega: number;

const BASE = { nombre: "Omega 3", marca: null, categoriaId: null, sabor: null, presentacion: "120 cápsulas", precioVenta: "100", precioCosto: "50", codigoBarras: null, stockMinimo: 2, fotoUrl: null, activo: true };
const FRACCION = { fraccionado: true, unidadFraccion: "capsula" as const, unidadesPorEnvase: 120, precioUnidad: "1,50" };

const venta = (lineas: { productoId: number; cantidad: number; fraccion?: boolean }[], extra: Partial<Parameters<typeof registrarVenta>[0]> = {}) =>
  registrarVenta({ uuid: randomUUID(), lineas, metodoPago: "efectivo", montoRecibido: "5000", clienteNombre: null, clienteTelefono: null, cuponCodigo: null, ...extra });

beforeAll(async () => {
  b = await prepararBase();
  await comoUsuario(b.admin);
  expect(await guardarProducto(BASE)).toEqual({ ok: true });
  [{ id: omega }] = await db.select({ id: productos.id }).from(productos).where(eq(productos.nombre, "Omega 3"));
  expect(await registrarIngreso({ ubicacionId: b.norte.id, proveedor: null, documento: null, lineas: [{ productoId: omega, cantidad: 3, fechaVencimiento: "2027-12-31" }] })).toEqual({ ok: true });
});

describe("venta fraccionada", () => {
  it("por defecto no es fraccionado; al activarlo hay que completar unidad, cantidad por envase y precio", async () => {
    const [p] = await db.select().from(productos).where(eq(productos.id, omega));
    expect(p).toMatchObject({ fraccionado: false, unidadFraccion: null, unidadesPorEnvase: null, precioUnidad: null });
    const r = await guardarProducto({ ...BASE, id: omega, fraccionado: true });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.campos).toMatchObject({ unidadFraccion: expect.any(String), unidadesPorEnvase: expect.any(String), precioUnidad: expect.any(String) });
    expect(await stock(omega, b.norte.id)).toBe(3);
  });

  it("activar convierte el stock y los lotes a cápsulas y queda en auditoría", async () => {
    expect(await guardarProducto({ ...BASE, id: omega, ...FRACCION })).toEqual({ ok: true });
    expect(await stock(omega, b.norte.id)).toBe(360);
    const [lote] = await db.select().from(lotes).where(and(eq(lotes.productoId, omega), eq(lotes.ubicacionId, b.norte.id)));
    expect(lote).toMatchObject({ cantidad: 360, fechaVencimiento: "2027-12-31" });
    const [a] = await db.select().from(auditoria).where(eq(auditoria.accion, "venta_fraccionada_cambiada"));
    expect(a.detalle).toMatchObject({ productoId: omega, fraccionado: true, unidadesPorEnvase: 120, stock: "× 120" });
    // Guardar de nuevo sin cambios no vuelve a multiplicar.
    expect(await guardarProducto({ ...BASE, id: omega, ...FRACCION })).toEqual({ ok: true });
    expect(await stock(omega, b.norte.id)).toBe(360);
  });

  it("ingresos y transferencias se escriben en frascos; con una transferencia en camino no se puede quitar el fraccionado", async () => {
    expect(await registrarIngreso({ ubicacionId: b.bodega.id, proveedor: null, documento: null, lineas: [{ productoId: omega, cantidad: 2, fechaVencimiento: null }] })).toEqual({ ok: true });
    expect(await stock(omega, b.bodega.id)).toBe(240);

    expect(await crearTransferencia({ origenId: b.bodega.id, destinoId: b.norte.id, nota: null, lineas: [{ productoId: omega, cantidad: 1 }] })).toEqual({ ok: true });
    expect(await stock(omega, b.bodega.id)).toBe(120);
    const [t] = await db.select().from(transferencias).where(eq(transferencias.estado, "enviada"));
    const [d] = await db.select().from(detalleTransferencia).where(eq(detalleTransferencia.transferenciaId, t.id));
    expect(d.cantidad).toBe(120);

    const quitar = await guardarProducto({ ...BASE, id: omega, fraccionado: false });
    expect(quitar.ok).toBe(false);
    expect(!quitar.ok && quitar.error).toMatch(/transferencia en camino/);
    expect((await db.select().from(productos).where(eq(productos.id, omega)))[0].fraccionado).toBe(true);

    expect(await recibirTransferencia({ id: t.id })).toEqual({ ok: true });
    expect(await stock(omega, b.norte.id)).toBe(480);
  });

  it("se vende por frasco y por cápsulas en la misma venta, con el precio de cada modo", async () => {
    await comoUsuario(b.cajeroNorte);
    expect(await abrirCaja({ montoInicial: "100" })).toEqual({ ok: true });
    const r = await venta([
      { productoId: omega, cantidad: 1 },
      { productoId: omega, cantidad: 30, fraccion: true },
    ]);
    if (!r.ok) throw new Error(r.error);
    expect(r.datos.total).toBe("145.00"); // 1 frasco (100) + 30 cápsulas × 1,50
    expect(await stock(omega, b.norte.id)).toBe(330); // 480 − 120 − 30

    const lineas = await db.select().from(detalleVenta).where(eq(detalleVenta.ventaId, r.datos.ventaId)).orderBy(detalleVenta.id);
    expect(lineas[0]).toMatchObject({ cantidad: 1, fraccion: false, unidadFraccion: null, precioUnitario: "100.00", costoUnitario: "50.00" });
    expect(lineas[1]).toMatchObject({ cantidad: 30, fraccion: true, unidadFraccion: "capsula", precioUnitario: "1.50", costoUnitario: "0.42" });
    expect(r.datos.comprobante?.venta.lineas.map((l) => [l.cantidad, l.unidad ?? null])).toEqual([
      [1, null],
      [30, "capsula"],
    ]);
  });

  it("no deja vender más cápsulas de las que hay (se valida el total) ni sueltas de un producto normal", async () => {
    await comoUsuario(b.cajeroNorte);
    // Hay 330: 2 frascos + 100 sueltas = 340.
    const mucho = await venta([
      { productoId: omega, cantidad: 2 },
      { productoId: omega, cantidad: 100, fraccion: true },
    ]);
    expect(mucho.ok).toBe(false);
    expect(await stock(omega, b.norte.id)).toBe(330);
    expect((await venta([{ productoId: omega, cantidad: 3 }])).ok).toBe(false); // 3 frascos = 360
    expect((await venta([{ productoId: b.proteina.id, cantidad: 1, fraccion: true }])).ok).toBe(false);
    // La misma línea repetida no se acepta; frasco + sueltas del mismo producto sí.
    expect(
      (
        await venta([
          { productoId: omega, cantidad: 1, fraccion: true },
          { productoId: omega, cantidad: 2, fraccion: true },
        ])
      ).ok,
    ).toBe(false);
    expect(await stock(omega, b.norte.id)).toBe(330);
  });

  it("el stock mínimo es en frascos: avisa al bajar de 2 frascos, con el stock en frascos y cápsulas", async () => {
    await comoUsuario(b.cajeroNorte);
    const pendiente = () => db.select().from(alertas).where(and(eq(alertas.productoId, omega), eq(alertas.sucursalId, b.norte.id), eq(alertas.resuelta, false)));
    expect(await pendiente()).toHaveLength(0); // 330 ≥ 240
    expect((await venta([{ productoId: omega, cantidad: 100, fraccion: true }])).ok).toBe(true);
    expect(await stock(omega, b.norte.id)).toBe(230);
    const [a] = await pendiente();
    expect(a).toMatchObject({ tipo: "stock_bajo", mensaje: "Omega 3: quedan 1 frasco + 110 cápsulas (230 cápsulas en total) en Sucursal Norte (mínimo 2 frascos)" });
  });

  it("anular devuelve al stock las cápsulas que salieron", async () => {
    await comoUsuario(b.cajeroNorte);
    const r = await venta([
      { productoId: omega, cantidad: 1 },
      { productoId: omega, cantidad: 10, fraccion: true },
    ]);
    if (!r.ok) throw new Error(r.error);
    expect(await stock(omega, b.norte.id)).toBe(100);
    await comoUsuario(b.admin);
    expect(await anularVenta({ id: r.datos.ventaId, motivo: "Prueba de anulación" })).toEqual({ ok: true });
    expect(await stock(omega, b.norte.id)).toBe(230);
  });

  it("una venta sin conexión por cápsulas se sincroniza y descuenta lo mismo", async () => {
    await comoUsuario(b.cajeroNorte);
    const [caja] = await db.select().from(cajas).where(and(eq(cajas.cajeroId, b.cajeroNorte.id), eq(cajas.estado, "abierta")));
    const uuid = randomUUID();
    const operaciones = [
      {
        uuid,
        tipo: "venta",
        datos: {
          uuid,
          cajaId: caja.id,
          fecha: Date.now(),
          lineas: [
            { productoId: omega, cantidad: 1, precioUnitario: "100.00", descuento: "0.00", promocionId: null },
            { productoId: omega, cantidad: 20, precioUnitario: "1.50", descuento: "0.00", promocionId: null, fraccion: true },
          ],
          metodoPago: "efectivo",
          montoRecibido: "130.00",
          clienteNombre: null,
          clienteTelefono: null,
        },
      },
    ];
    const r = await (await sincronizar(new Request("http://localhost/api/sync", { method: "POST", body: JSON.stringify({ operaciones }) }))).json();
    expect(r.resultados[0]).toMatchObject({ ok: true });
    expect(await stock(omega, b.norte.id)).toBe(90); // 230 − 120 − 20
    // Cobró lo mismo que la BD: no hay alerta de revisión.
    expect(await db.select().from(alertas).where(and(eq(alertas.tipo, "revision_offline"), eq(alertas.resuelta, false)))).toHaveLength(0);
    const lineas = await db.select().from(detalleVenta).where(eq(detalleVenta.ventaId, r.resultados[0].ventaId)).orderBy(detalleVenta.id);
    expect(lineas.map((l) => [l.cantidad, l.fraccion, l.unidadFraccion])).toEqual([
      [1, false, null],
      [20, true, "capsula"],
    ]);
  });

  it("el reporte separa lo vendido en frascos de lo vendido en cápsulas sueltas", async () => {
    const hoy = hoyEnBolivia();
    const f = { desde: hoy, hasta: hoy, sucursalId: b.norte.id, cajeroId: null, metodo: null, productoId: null, categoria: null };
    const [fila] = (await ventasPorProducto(f)).filter((p) => p.id === omega);
    // Completadas: 1 frasco + 30, 100 sueltas y la venta sin conexión (1 frasco + 20). La anulada no cuenta.
    expect(fila).toMatchObject({ unidades: 2, sueltas: 150, unidadFraccion: "capsula", netoSueltas: "225.00", neto: "425.00" });
    const r = await resumenVentas(f);
    expect(r).toMatchObject({ unidades: 2, sueltas: 150 });
    const lineas = (await lineasDeVentas(f, 100)).filter((l) => l.producto === "Omega 3" && l.estado === "completada");
    expect(lineas.filter((l) => l.unidad === "capsula").reduce((s, l) => s + l.cantidad, 0)).toBe(150);
  });

  it("quitar el fraccionado exige envases completos y vuelve a contar en frascos", async () => {
    await comoUsuario(b.admin);
    const conSueltas = await guardarProducto({ ...BASE, id: omega, fraccionado: false });
    expect(conSueltas.ok).toBe(false);
    expect(!conSueltas.ok && conSueltas.error).toMatch(/unidades sueltas/);
    expect(await stock(omega, b.norte.id)).toBe(90);

    // El ajuste es en cápsulas: se deja en 1 frasco exacto.
    expect(await ajustarStock({ productoId: omega, ubicacionId: b.norte.id, cantidadNueva: 120, fechaVencimiento: null, motivo: "Conteo: 1 frasco cerrado" })).toEqual({ ok: true });
    expect(await guardarProducto({ ...BASE, id: omega, fraccionado: false })).toEqual({ ok: true });
    expect(await stock(omega, b.norte.id)).toBe(1);
    expect(await stock(omega, b.bodega.id)).toBe(1);
    const [p] = await db.select().from(productos).where(eq(productos.id, omega));
    expect(p).toMatchObject({ fraccionado: false, unidadFraccion: null, unidadesPorEnvase: null, precioUnidad: null });
  });
});
