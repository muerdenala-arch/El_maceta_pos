/**
 * Candados del encargado contra una base real (en memoria): tiene los mismos apartados que el administrador; con el
 * candado cerrado (por defecto) el servidor le rechaza todo en ese apartado; con el candado abierto trabaja igual que el
 * administrador (todas las sucursales, costos incluidos). Solo el administrador abre y cierra candados.
 */
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { guardarCategoria, guardarProducto } from "@/app/admin/catalogo/acciones";
import { guardarConfiguracion } from "@/app/admin/configuracion/acciones";
import { agregarGasto } from "@/app/admin/gastos/acciones";
import { crearUsuario } from "@/app/admin/personal/acciones";
import { guardarQr } from "@/app/admin/qr/acciones";
import { guardarTrabajador } from "@/app/admin/sueldos/acciones";
import { cambiarEstadoSucursal } from "@/app/admin/sucursales/acciones";
import { GET as exportar } from "@/app/api/admin/exportar/route";
import { db } from "@/db";
import { auditoria, configuracion, productos, qrPagos, usuarios } from "@/db/schema";
import { MENSAJE_CANDADO } from "@/lib/acciones/resultado";
import { cambiarCandado } from "@/lib/auth/modulo-acciones";
import { MODULOS_CON_CANDADO, primerApartado } from "@/lib/auth/modulos";
import { ajustarStock, crearTransferencia } from "@/lib/inventario/acciones";
import { comoUsuario, prepararBase, stock, type Base } from "./base";

let b: Base;
beforeAll(async () => {
  b = await prepararBase();
});

const SIN_PERMISO = { ok: false, error: "No tienes permiso para esta acción" };
const CANDADO = { ok: false, error: MENSAJE_CANDADO };
const URL_QR = "/api/archivos/qr/11111111-1111-4111-8111-111111111111.png";

const producto = (extra: Record<string, unknown> = {}) =>
  ({ nombre: "Producto del encargado", marca: null, categoriaId: null, sabor: null, presentacion: null, precioVenta: "100", precioCosto: "55", codigoBarras: null, stockMinimo: 0, fotoUrl: null, activo: true, ...extra }) as never;
const config = (extra: Record<string, unknown> = {}) =>
  ({ nombreComercial: "El Maseta", nit: "", mensajeAgradecimiento: "¡Gracias!", plantillaWhatsapp: "Hola {cliente}: {enlace}", codigoPais: "591", logoUrl: null, ...extra }) as never;
const ajuste = (ubicacionId: number, cantidadNueva: number) => ({ productoId: b.creatina.id, ubicacionId, cantidadNueva, motivo: "Conteo físico", fechaVencimiento: null });
const transferencia = (origenId: number, destinoId: number) => ({ origenId, destinoId, nota: null, lineas: [{ productoId: b.proteina.id, cantidad: 2 }] });
const gasto = (sucursalId: number) => ({ sucursalId, categoria: "Servicios" as const, monto: "80", descripcion: "Luz", fotoUrl: null });
const exportacion = () => exportar(new NextRequest("http://localhost/api/admin/exportar?reporte=ventas&formato=xlsx"));

const abrir = async (modulo: string, abierto = true) => {
  await comoUsuario(b.admin);
  const r = await cambiarCandado({ modulo, abierto });
  if (!r.ok) throw new Error(r.error);
  await comoUsuario(b.encargadoNorte);
  return r.datos.abiertos;
};

describe("con todos los candados cerrados (por defecto)", () => {
  it("el encargado no puede nada en ningún apartado", async () => {
    expect((await db.select().from(configuracion).where(eq(configuracion.id, 1)))[0].encargadoModulosAbiertos).toEqual([]);
    await comoUsuario(b.encargadoNorte);
    const intentos = [
      guardarProducto(producto()),
      guardarCategoria({ nombre: "Nueva" }),
      guardarQr({ nombre: "QR", imagenUrl: URL_QR, sucursalId: null, activo: true }),
      guardarConfiguracion(config()),
      ajustarStock(ajuste(b.norte.id, 50)),
      crearTransferencia(transferencia(b.bodega.id, b.sur.id)),
      agregarGasto(gasto(b.sur.id)),
      crearUsuario({ nombre: "Nuevo", usuario: "nuevo", rol: "cajero", sucursalId: b.norte.id, pin: "918273", activo: true } as never),
      guardarTrabajador({ nombre: "Rosa", cargo: "", sucursalId: null, fechaIngreso: "2026-01-01", sueldoMensual: "100" }),
      cambiarEstadoSucursal({ id: b.sur.id, activo: false }),
    ];
    for (const r of await Promise.all(intentos)) expect(r).toEqual(CANDADO);
    expect((await exportacion()).status).toBe(403);
    expect(await stock(b.creatina.id, b.norte.id)).toBe(5);
  });

  it("sin apartados abiertos no tiene a dónde entrar", () => {
    expect(primerApartado([])).toBeNull();
    expect(primerApartado(["sueldos", "catalogo"])).toBe("/admin/catalogo"); // el primero en el orden del menú
  });

  it("solo el administrador abre y cierra candados (todos los apartados del menú), y queda en auditoría", async () => {
    expect(MODULOS_CON_CANDADO.length).toBe(15);
    await comoUsuario(b.encargadoNorte);
    expect(await cambiarCandado({ modulo: "catalogo", abierto: true })).toEqual(SIN_PERMISO);
    await comoUsuario(b.cajeroNorte);
    expect(await cambiarCandado({ modulo: "catalogo", abierto: true })).toEqual(SIN_PERMISO);
    await comoUsuario(b.admin);
    expect(await cambiarCandado({ modulo: "inventado", abierto: true })).toEqual({ ok: false, error: "Apartado inválido" });
    expect(await abrir("catalogo")).toEqual(["catalogo"]);
    expect(await abrir("catalogo")).toEqual(["catalogo"]); // repetir no duplica
    const [a] = (await db.select().from(auditoria).where(eq(auditoria.accion, "candado_encargado"))).slice(-1);
    expect(a).toMatchObject({ usuarioId: b.admin.id, detalle: { modulo: "catalogo", abierto: true } });
  });
});

describe("con el candado abierto trabaja igual que el administrador", () => {
  it("catálogo: crea y edita productos, costo incluido", async () => {
    await comoUsuario(b.encargadoNorte);
    expect(await guardarProducto(producto())).toEqual({ ok: true });
    expect((await db.select().from(productos).where(eq(productos.nombre, "Producto del encargado")))[0].precioCosto).toBe("55.00");
    expect(await guardarProducto(producto({ id: b.proteina.id, nombre: "Whey Test", precioVenta: "360", precioCosto: "290", stockMinimo: 3 }))).toEqual({ ok: true });
    expect((await db.select().from(productos).where(eq(productos.id, b.proteina.id)))[0]).toMatchObject({ precioVenta: "360.00", precioCosto: "290.00" });
    // Los demás apartados siguen cerrados.
    expect(await guardarQr({ nombre: "QR", imagenUrl: URL_QR, sucursalId: null, activo: true })).toEqual(CANDADO);
  });

  it("inventario y bodega: en cualquier sucursal y en la bodega, como el administrador", async () => {
    await abrir("inventario");
    expect(await ajustarStock(ajuste(b.sur.id, 7))).toEqual({ ok: true }); // otra sucursal: también
    expect(await ajustarStock(ajuste(b.bodega.id, 7))).toEqual(CANDADO); // la bodega es otro apartado
    await abrir("bodega");
    expect(await ajustarStock(ajuste(b.bodega.id, 9))).toEqual({ ok: true });
    expect(await crearTransferencia(transferencia(b.bodega.id, b.sur.id))).toEqual({ ok: true });
  });

  it("QR, sucursales, configuración, gastos, reportes, personal y sueldos: sin límites", async () => {
    await abrir("qr");
    expect(await guardarQr({ nombre: "QR general", imagenUrl: URL_QR, sucursalId: null, activo: true })).toEqual({ ok: true });
    expect((await db.select().from(qrPagos)).map((q) => q.nombre)).toContain("QR general");

    await abrir("configuracion");
    expect(await guardarConfiguracion(config({ descuentoManualMaximo: "7", descuentoManualMaximoEncargado: "12" }))).toEqual({ ok: true });
    expect((await db.select().from(configuracion).where(eq(configuracion.id, 1)))[0]).toMatchObject({ descuentoManualMaximo: "7.00", descuentoManualMaximoEncargado: "12.00" });

    await abrir("gastos");
    expect(await agregarGasto(gasto(b.sur.id))).toEqual({ ok: true });

    expect((await exportacion()).status).toBe(403);
    await abrir("reportes");
    expect((await exportacion()).status).toBe(200);

    await abrir("personal");
    expect(await crearUsuario({ nombre: "Cajero Nuevo", usuario: "cajero.nuevo", rol: "cajero", sucursalId: b.sur.id, pin: "918273", activo: true } as never)).toEqual({ ok: true });
    expect((await db.select().from(usuarios).where(eq(usuarios.usuario, "cajero.nuevo")))[0].sucursalId).toBe(b.sur.id);

    await abrir("sueldos");
    expect(await guardarTrabajador({ nombre: "Rosa Limpieza", cargo: "Limpieza", sucursalId: null, fechaIngreso: "2026-01-01", sueldoMensual: "1200" })).toEqual({ ok: true });

    await abrir("sucursales");
    expect(await cambiarEstadoSucursal({ id: b.sur.id, activo: false })).toMatchObject({ ok: false }); // la regla de Personal: Sur tiene usuarios activos
  });

  it("al cerrar el candado deja de poder al instante", async () => {
    expect(await abrir("catalogo", false)).not.toContain("catalogo");
    expect(await guardarProducto(producto({ nombre: "Otro" }))).toEqual(CANDADO);
  });

  it("el cajero sigue sin poder nada de esto aunque todos los candados estén abiertos", async () => {
    for (const m of MODULOS_CON_CANDADO) await abrir(m);
    await comoUsuario(b.cajeroNorte);
    for (const r of [await guardarProducto(producto()), await ajustarStock(ajuste(b.norte.id, 1)), await guardarConfiguracion(config()), await agregarGasto(gasto(b.norte.id))]) {
      expect(r).toEqual(SIN_PERMISO);
    }
    expect((await exportacion()).status).toBe(403);
  });
});
