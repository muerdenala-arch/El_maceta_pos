import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { db } from "@/db";
import { auditoria, cajas, productos, sucursales, usuarios } from "@/db/schema";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { Pestanas } from "@/components/inventario/pestanas";
import { requerirSesion } from "@/lib/auth/sesion";
import { totalesCaja } from "@/lib/caja/consultas";
import { fechaValida, hoyEnBolivia, ZONA_HORARIA } from "@/lib/formato";
import { obtenerSucursalVista } from "@/lib/sucursal-vista";
import { ACCIONES_SENSIBLES } from "@/lib/auditoria-acciones";
import { condicionBusqueda } from "@/lib/busqueda-sql";
import { AccionesSensibles, type EventoAuditoria } from "./acciones-sensibles";
import { AuditoriaCajas, type CajaAuditada } from "./auditoria-cajas";

export const metadata: Metadata = { title: "Auditoría" };

const POR_PAGINA = 50;

export default async function PaginaAuditoria(props: PageProps<"/admin/auditoria">) {
  const sesion = await requerirSesion("admin");
  const sp = await props.searchParams;
  const vista = sp.vista === "acciones" ? "acciones" : "cajas";
  const hoy = hoyEnBolivia();
  const hasta = fechaValida(sp.hasta) ?? hoy;
  const desde = fechaValida(sp.desde) ?? new Date(Date.parse(`${hasta}T12:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const rango = (columna: Parameters<typeof gte>[0]) =>
    and(gte(columna, sql`(${desde}::date at time zone ${ZONA_HORARIA})`), lt(columna, sql`((${hasta}::date + 1) at time zone ${ZONA_HORARIA})`));

  const pestanas = (
    <Pestanas
      actual={vista}
      opciones={[
        { valor: "cajas", titulo: "Cajas", href: `/admin/auditoria?desde=${desde}&hasta=${hasta}` },
        { valor: "acciones", titulo: "Acciones sensibles", href: `/admin/auditoria?vista=acciones&desde=${desde}&hasta=${hasta}` },
      ]}
    />
  );

  if (vista === "cajas") {
    const sucursalId = await obtenerSucursalVista(sesion);
    const cajaResaltada = Number(sp.caja) || null;
    const filas = await db
      .select({
        caja: cajas,
        cajero: usuarios.nombre,
        sucursal: sucursales.nombre,
      })
      .from(cajas)
      .innerJoin(usuarios, eq(usuarios.id, cajas.cajeroId))
      .innerJoin(sucursales, eq(sucursales.id, cajas.sucursalId))
      .where(
        and(
          // Desde una alerta se muestra esa caja aunque esté fuera del rango de fechas.
          cajaResaltada ? sql`(${rango(cajas.apertura)} or ${cajas.id} = ${cajaResaltada})` : rango(cajas.apertura),
          sucursalId ? eq(cajas.sucursalId, sucursalId) : undefined,
        ),
      )
      .orderBy(desc(cajas.apertura))
      .limit(200);

    const lista: CajaAuditada[] = await Promise.all(
      filas.map(async ({ caja: c, cajero, sucursal }) => {
        // Caja abierta: totales en vivo (lo que se cerraría ahora).
        const vivo = c.estado === "abierta" ? await totalesCaja(c.id, c.montoInicial) : null;
        return {
          id: c.id,
          cajero,
          sucursal,
          estado: c.estado,
          apertura: c.apertura.toISOString(),
          cierre: c.cierre?.toISOString() ?? null,
          montoInicial: c.montoInicial,
          ventasEfectivo: vivo?.ventasEfectivo ?? c.ventasEfectivo ?? "0",
          ventasQr: vivo?.ventasQr ?? c.ventasQr ?? "0",
          gastos: vivo?.gastos ?? c.gastos ?? "0",
          esperado: vivo?.esperado ?? c.esperado ?? "0",
          contado: c.efectivoContado,
          diferencia: c.diferencia,
        };
      }),
    );
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <EncabezadoPagina icono={ScrollText} titulo="Auditoría" descripcion="Aperturas y cierres de caja, y acciones sensibles" />
        {pestanas}
        <AuditoriaCajas cajas={lista} desde={desde} hasta={hasta} hoy={hoy} resaltar={cajaResaltada} />
      </div>
    );
  }

  const accion = typeof sp.accion === "string" && sp.accion in ACCIONES_SENSIBLES ? sp.accion : null;
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const consulta = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const filas = await db
    .select({ id: auditoria.id, fecha: auditoria.fecha, accion: auditoria.accion, detalle: auditoria.detalle, usuario: usuarios.nombre, dispositivo: auditoria.dispositivo })
    .from(auditoria)
    .leftJoin(usuarios, eq(usuarios.id, auditoria.usuarioId))
    .where(
      and(
        rango(auditoria.fecha),
        accion ? eq(auditoria.accion, accion) : inArray(auditoria.accion, Object.keys(ACCIONES_SENSIBLES)),
        condicionBusqueda(consulta, [usuarios.nombre, auditoria.accion, auditoria.detalle]),
      ),
    )
    .orderBy(desc(auditoria.fecha), desc(auditoria.id))
    .limit(POR_PAGINA + 1)
    .offset((pagina - 1) * POR_PAGINA);

  // Nombres de productos, ubicaciones y usuarios mencionados en los detalles.
  const ids = (clave: string) =>
    [...new Set(filas.map((f) => (f.detalle as Record<string, unknown> | null)?.[clave]).filter((x): x is number => typeof x === "number"))];
  const [prods, ubic, usrs] = await Promise.all([
    ids("productoId").length ? db.select({ id: productos.id, n: productos.nombre }).from(productos).where(inArray(productos.id, ids("productoId"))) : [],
    ids("ubicacionId").length ? db.select({ id: sucursales.id, n: sucursales.nombre }).from(sucursales).where(inArray(sucursales.id, ids("ubicacionId"))) : [],
    ids("id").length ? db.select({ id: usuarios.id, n: usuarios.nombre }).from(usuarios).where(inArray(usuarios.id, ids("id"))) : [],
  ]);
  const nombres = {
    productos: Object.fromEntries(prods.map((p) => [p.id, p.n])),
    ubicaciones: Object.fromEntries(ubic.map((u) => [u.id, u.n])),
    usuarios: Object.fromEntries(usrs.map((u) => [u.id, u.n])),
  };

  const eventos: EventoAuditoria[] = filas.slice(0, POR_PAGINA).map((f) => ({
    id: f.id,
    fecha: f.fecha.toISOString(),
    accion: f.accion,
    usuario: f.usuario,
    detalle: (f.detalle as Record<string, unknown> | null) ?? {},
    dispositivo: f.dispositivo,
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina icono={ScrollText} titulo="Auditoría" descripcion="Aperturas y cierres de caja, y acciones sensibles" />
      {pestanas}
      <AccionesSensibles hoy={hoy} eventos={eventos} nombres={nombres} desde={desde} hasta={hasta} accion={accion} pagina={pagina} hayMas={filas.length > POR_PAGINA} consulta={consulta} />
    </div>
  );
}
