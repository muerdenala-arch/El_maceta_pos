import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { Pestanas } from "@/components/inventario/pestanas";
import { requerirSesion } from "@/lib/auth/sesion";
import { fechaValida } from "@/lib/formato";
import {
  listarMovimientos,
  listarProductosInventario,
  listarUbicaciones,
  mapaEnCamino,
  mapaStock,
} from "@/lib/inventario/consultas";
import { obtenerSucursalVista } from "@/lib/sucursal-vista";
import { HistorialMovimientos } from "./historial-movimientos";
import { TablaInventario } from "./tabla-inventario";

export const metadata: Metadata = { title: "Inventario" };

const TIPOS = ["ingreso", "venta", "transferencia_salida", "transferencia_entrada", "ajuste", "anulacion"];

export default async function PaginaInventario(props: PageProps<"/admin/inventario">) {
  const sesion = await requerirSesion("admin");
  const sp = await props.searchParams;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const vista = sp.vista === "movimientos" ? "movimientos" : "stock";
  const sucursalVista = await obtenerSucursalVista(sesion);
  const ubicaciones = await listarUbicaciones();

  const pestanas = (
    <Pestanas
      actual={vista}
      opciones={[
        { valor: "stock", titulo: "Stock", href: "/admin/inventario" },
        { valor: "movimientos", titulo: "Historial de movimientos", href: "/admin/inventario?vista=movimientos" },
      ]}
    />
  );

  if (vista === "movimientos") {
    const filtros = {
      ubicacionId: Number(sp.ubicacion) || sucursalVista || undefined,
      tipo: TIPOS.includes(String(sp.tipo)) ? String(sp.tipo) : undefined,
      producto: texto(sp.producto)?.slice(0, 80),
      desde: fechaValida(sp.desde) ?? undefined,
      hasta: fechaValida(sp.hasta) ?? undefined,
      pagina: Number(sp.pagina) || 1,
    };
    const resultado = await listarMovimientos(filtros);
    return (
      <div className="mx-auto max-w-7xl space-y-6">
        <EncabezadoPagina icono={Boxes} titulo="Inventario" descripcion="Cada entrada y salida de mercadería, con quién y por qué" />
        {pestanas}
        <HistorialMovimientos ubicaciones={ubicaciones} filtros={filtros} {...resultado} />
      </div>
    );
  }

  const [productos, stock, enCamino] = await Promise.all([listarProductosInventario(), mapaStock(), mapaEnCamino()]);
  const resaltar = Number(sp.resaltar) || null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <TablaInventario
        ubicaciones={ubicaciones}
        // Con una sucursal elegida en "Viendo sucursal": esa sucursal y la bodega (de donde se repone).
        columnas={sucursalVista ? ubicaciones.filter((u) => u.id === sucursalVista || u.tipo === "bodega") : ubicaciones}
        productos={productos}
        stock={stock}
        enCamino={enCamino}
        resaltar={resaltar}
      >
        {pestanas}
      </TablaInventario>
    </div>
  );
}
