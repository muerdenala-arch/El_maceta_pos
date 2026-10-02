/**
 * Candados del encargado contra una base real (en memoria): entra a los apartados compartidos del administrador,
 * pero con el candado cerrado (por defecto) el servidor rechaza cualquier cambio; con el candado abierto trabaja
 * solo dentro de su sucursal y sin tocar costos. Solo el administrador abre y cierra candados.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { guardarCategoria, guardarProducto, importarProductos } from "@/app/admin/catalogo/acciones";
import { guardarCombo } from "@/app/admin/combos/acciones";
import { guardarConfiguracion } from "@/app/admin/configuracion/acciones";
import { crearReto } from "@/app/admin/eventos/acciones";
import { guardarCupon } from "@/app/admin/promociones/acciones";
import { guardarQr } from "@/app/admin/qr/acciones";
import { cambiarEstadoSucursal, guardarSucursal } from "@/app/admin/sucursales/acciones";
import { db } from "@/db";
import { alertas, auditoria, configuracion, productos, qrPagos, sucursales, transferencias } from "@/db/schema";
import { MENSAJE_CANDADO } from "@/lib/acciones/resultado";
import { subirImagen } from "@/lib/acciones/subir-imagen";
import { cambiarCandado } from "@/lib/auth/modulo-acciones";
import { MODULOS_CON_CANDADO } from "@/lib/auth/modulos";
import { ajustarStock, cancelarTransferencia, crearTransferencia, registrarIngreso, resolverSolicitud } from "@/lib/inventario/acciones";
import { comoUsuario, prepararBase, stock, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
});

const SIN_PERMISO = { ok: false, error: "No tienes permiso para esta acción" };
const CANDADO = { ok: false, error: MENSAJE_CANDADO };
const URL_QR = "/api/archivos/qr/11111111-1111-4111-8111-111111111111.png";

const producto = (extra: Record<string, unknown> = {}) =>
  ({ nombre: "Producto del encargado", marca: null, categoriaId: null, sabor: null, presentacion: null, precioVenta: "100", precioCosto: "0", codigoBarras: null, stockMinimo: 0, fotoUrl: null, activo: true, ...extra }) as never;
const sucursal = (nombre: string) => ({ nombre, direccion: "", telefono: "", encargado: "", tamanoImpresion: "80mm" as const });
const config = (extra: Record<string, unknown> = {}) =>
  ({ nombreComercial: "El Maseta", nit: "", mensajeAgradecimiento: "¡Gracias!", plantillaWhatsapp: "Hola {cliente}: {enlace}", codigoPais: "591", logoUrl: null, ...extra }) as never;
const ajuste = (ubicacionId: number, cantidadNueva: number) => ({ productoId: b.creatina.id, ubicacionId, cantidadNueva, motivo: "Conteo físico", fechaVencimiento: null });
const transferencia = (origenId: number, destinoId: number) => ({ origenId, destinoId, nota: null, lineas: [{ productoId: b.proteina.id, cantidad: 2 }] });

const abrir = async (modulo: string, abierto = true) => {
  await comoUsuario(b.admin);
  const r = await cambiarCandado({ modulo, abierto });
  if (!r.ok) throw new Error(r.error);
  await comoUsuario(b.encargadoNorte);
  return r.datos.abiertos;
};
const abiertosEnBase = async () => (await db.select().from(configuracion).where(eq(configuracion.id, 1)))[0].encargadoModulosAbiertos;

describe("por defecto todos los apartados tienen candado", () => {
  it("el encargado no puede cambiar nada en ningún apartado compartido", async () => {
    expect(await abiertosEnBase()).toEqual([]);
    await comoUsuario(b.encargadoNorte);
    const imagen = new FormData();
    imagen.set("carpeta", "productos");
    imagen.set("archivo", new File([new Uint8Array([1, 2, 3])], "x.png", { type: "image/png" }));
    const intentos = [
      guardarProducto(producto()),
      guardarCategoria({ nombre: "Nueva" }),
      guardarCupon({} as never),
      guardarCombo({} as never),
      crearReto({} as never),
      guardarQr({ nombre: "QR", imagenUrl: URL_QR, sucursalId: b.norte.id, activo: true }),
      guardarSucursal({ id: b.norte.id, ...sucursal("Otro nombre") }),
      guardarConfiguracion(config()),
      ajustarStock(ajuste(b.norte.id, 50)),
      registrarIngreso({} as never),
      crearTransferencia(transferencia(b.bodega.id, b.norte.id)),
      resolverSolicitud({ id: 1 }),
      subirImagen(imagen),
    ];
    for (const r of await Promise.all(intentos)) expect(r).toEqual(CANDADO);
    expect(await stock(b.creatina.id, b.norte.id)).toBe(5);
  });

  it("solo el administrador abre y cierra candados, y queda en auditoría", async () => {
    await comoUsuario(b.encargadoNorte);
    expect(await cambiarCandado({ modulo: "catalogo", abierto: true })).toEqual(SIN_PERMISO);
    await comoUsuario(b.cajeroNorte);
    expect(await cambiarCandado({ modulo: "catalogo", abierto: true })).toEqual(SIN_PERMISO);
    expect(await abiertosEnBase()).toEqual([]);

    await comoUsuario(b.admin);
    expect(await cambiarCandado({ modulo: "personal", abierto: true })).toEqual({ ok: false, error: "Apartado inválido" });
    expect(await abrir("catalogo")).toEqual(["catalogo"]);
    expect(await abrir("catalogo")).toEqual(["catalogo"]); // repetir no duplica
    const [a] = (await db.select().from(auditoria).where(eq(auditoria.accion, "candado_encargado"))).slice(-1);
    expect(a).toMatchObject({ usuarioId: b.admin.id, detalle: { modulo: "catalogo", abierto: true } });
  });
});

describe("catálogo con el candado abierto", () => {
  it("el encargado crea y edita productos, pero nunca toca el costo ni importa desde Excel", async () => {
    await comoUsuario(b.encargadoNorte);
    // Aunque mande un costo, un producto nuevo queda en 0…
    expect(await guardarProducto(producto({ precioCosto: "55" }))).toEqual({ ok: true });
    const [nuevo] = await db.select().from(productos).where(eq(productos.nombre, "Producto del encargado"));
    expect(nuevo.precioCosto).toBe("0.00");
    // …y al editar se conserva el que tenía, cambie lo que cambie.
    expect(await guardarProducto(producto({ id: b.proteina.id, nombre: "Whey Test", precioVenta: "360", precioCosto: "1", stockMinimo: 3 }))).toEqual({ ok: true });
    const [whey] = await db.select().from(productos).where(eq(productos.id, b.proteina.id));
    expect(whey).toMatchObject({ precioVenta: "360.00", precioCosto: "280.50" });
    expect((await guardarCategoria({ nombre: "Del encargado" })).ok).toBe(true);
    expect(await importarProductos(new FormData())).toEqual(SIN_PERMISO);
    // Los demás apartados siguen con candado.
    expect(await guardarQr({ nombre: "QR", imagenUrl: URL_QR, sucursalId: b.norte.id, activo: true })).toEqual(CANDADO);
  });

  it("al cerrar el candado deja de poder", async () => {
    expect(await abrir("catalogo", false)).toEqual([]);
    expect(await guardarProducto(producto({ nombre: "Otro" }))).toEqual(CANDADO);
  });
});

describe("stock: solo su sucursal (Inventario) y la bodega central (Bodega)", () => {
  it("con Inventario abierto ajusta en su sucursal, no en otra ni en la bodega", async () => {
    await abrir("inventario");
    expect(await ajustarStock(ajuste(b.norte.id, 7))).toEqual({ ok: true });
    expect(await stock(b.creatina.id, b.norte.id)).toBe(7);
    expect(await ajustarStock(ajuste(b.sur.id, 7))).toEqual(SIN_PERMISO);
    expect(await ajustarStock(ajuste(b.bodega.id, 7))).toEqual(CANDADO);
    expect(await registrarIngreso({ ubicacionId: b.sur.id, proveedor: null, documento: null, lineas: [{ productoId: b.creatina.id, cantidad: 1, fechaVencimiento: null }] })).toEqual(SIN_PERMISO);
    expect(await crearTransferencia(transferencia(b.bodega.id, b.norte.id))).toEqual(CANDADO);
  });

  it("con Bodega abierto envía de la bodega a su sucursal; nada hacia o desde otras sucursales", async () => {
    await abrir("bodega");
    const enBodega = await stock(b.proteina.id, b.bodega.id);
    expect(await ajustarStock(ajuste(b.bodega.id, 9))).toEqual({ ok: true });
    expect(await crearTransferencia(transferencia(b.bodega.id, b.sur.id))).toEqual(SIN_PERMISO);
    expect((await crearTransferencia(transferencia(b.sur.id, b.norte.id))).ok).toBe(false);
    expect(await stock(b.proteina.id, b.bodega.id)).toBe(enBodega);
    expect(await crearTransferencia(transferencia(b.bodega.id, b.norte.id))).toEqual({ ok: true });
    expect(await stock(b.proteina.id, b.bodega.id)).toBe(enBodega - 2);

    // Una transferencia y una solicitud de otra sucursal no se tocan.
    await comoUsuario(b.admin);
    expect(await crearTransferencia(transferencia(b.bodega.id, b.sur.id))).toEqual({ ok: true });
    const [paraSur] = await db.select().from(transferencias).where(and(eq(transferencias.destinoId, b.sur.id), eq(transferencias.estado, "enviada")));
    const [solicitud] = await db.insert(alertas).values({ tipo: "solicitud_reposicion", sucursalId: b.sur.id, productoId: b.creatina.id, mensaje: "Solicita 3 unidades" }).returning();
    await comoUsuario(b.encargadoNorte);
    expect(await cancelarTransferencia({ id: paraSur.id })).toEqual({ ok: false, error: "La transferencia no existe" });
    await resolverSolicitud({ id: solicitud.id });
    expect((await db.select().from(alertas).where(eq(alertas.id, solicitud.id)))[0].resuelta).toBe(false);

    const [paraNorte] = await db.select().from(transferencias).where(and(eq(transferencias.destinoId, b.norte.id), eq(transferencias.estado, "enviada")));
    expect(await cancelarTransferencia({ id: paraNorte.id })).toEqual({ ok: true });
    expect(await stock(b.proteina.id, b.bodega.id)).toBe(enBodega - 2); // la del admin a Sur sigue en camino; la suya volvió
  });
});

describe("QR, sucursales y configuración con el candado abierto", () => {
  it("QR: solo los de su sucursal (ni \"para todas\" ni de otra)", async () => {
    await abrir("qr");
    expect(await guardarQr({ nombre: "QR Norte", imagenUrl: URL_QR, sucursalId: b.norte.id, activo: true })).toEqual({ ok: true });
    expect(await guardarQr({ nombre: "QR general", imagenUrl: URL_QR, sucursalId: null, activo: true })).toEqual(SIN_PERMISO);
    expect(await guardarQr({ nombre: "QR Sur", imagenUrl: URL_QR, sucursalId: b.sur.id, activo: true })).toEqual(SIN_PERMISO);
    // Tampoco se apropia de un QR general editándolo hacia su sucursal.
    const [general] = await db.insert(qrPagos).values({ nombre: "General", imagenUrl: URL_QR, sucursalId: null }).returning();
    expect(await guardarQr({ id: general.id, nombre: "Mío", imagenUrl: URL_QR, sucursalId: b.norte.id, activo: false })).toEqual(SIN_PERMISO);
    expect((await db.select().from(qrPagos).where(eq(qrPagos.id, general.id)))[0]).toMatchObject({ nombre: "General", sucursalId: null, activo: true });
  });

  it("sucursales: edita los datos de la suya; no crea, no edita otra y no activa ni desactiva", async () => {
    await abrir("sucursales");
    expect(await guardarSucursal({ id: b.norte.id, ...sucursal("Sucursal Norte") , direccion: "Av. Nueva 123" })).toEqual({ ok: true });
    expect((await db.select().from(sucursales).where(eq(sucursales.id, b.norte.id)))[0].direccion).toBe("Av. Nueva 123");
    expect(await guardarSucursal({ id: b.sur.id, ...sucursal("Cambiada") })).toEqual(SIN_PERMISO);
    expect(await guardarSucursal(sucursal("Nueva del encargado"))).toEqual(SIN_PERMISO);
    expect(await cambiarEstadoSucursal({ id: b.sur.id, activo: false })).toEqual(SIN_PERMISO);
    expect((await db.select().from(sucursales)).map((s) => s.nombre).sort()).toEqual(["Bodega central", "Sucursal Norte", "Sucursal Sur"]);
  });

  it("configuración: cambia los datos del negocio, pero no los máximos de descuento (ni el suyo)", async () => {
    await comoUsuario(b.admin);
    expect(await guardarConfiguracion(config({ descuentoManualMaximo: "5", descuentoManualMaximoEncargado: "15" }))).toEqual({ ok: true });
    await abrir("configuracion");
    expect(await guardarConfiguracion(config({ nombreComercial: "El Maseta Norte", descuentoManualMaximo: "90", descuentoManualMaximoEncargado: "100" }))).toEqual({ ok: true });
    const [c] = await db.select().from(configuracion).where(eq(configuracion.id, 1));
    expect(c).toMatchObject({ nombreComercial: "El Maseta Norte", descuentoManualMaximo: "5.00", descuentoManualMaximoEncargado: "15.00" });
    // Guardar la configuración no toca los candados.
    expect([...c.encargadoModulosAbiertos].sort()).toEqual(["bodega", "configuracion", "inventario", "qr", "sucursales"]);
  });
});

it("el cajero sigue sin poder nada de esto aunque todos los candados estén abiertos", async () => {
  for (const m of MODULOS_CON_CANDADO) await abrir(m);
  await comoUsuario(b.cajeroNorte);
  for (const r of [await guardarProducto(producto()), await ajustarStock(ajuste(b.norte.id, 1)), await guardarQr({ nombre: "QR", imagenUrl: URL_QR, sucursalId: b.norte.id, activo: true }), await guardarConfiguracion(config())]) {
    expect(r).toEqual(SIN_PERMISO);
  }
});
