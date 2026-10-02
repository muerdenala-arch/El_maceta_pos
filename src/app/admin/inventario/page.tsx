import { Boxes } from "lucide-react";
import type { Metadata } from "next";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { Pestanas } from "@/components/inventario/pestanas";
import { ZonaModulo } from "@/components/permisos/zona-modulo";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
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
  const acceso = await requerirModulo("inventario");
  const sesion = acceso.sesion;
  const sp = await props.searchParams;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const vista = sp.vista === "movimientos" ? "movimientos" : "stock";
  const sucursalVista = await obtenerSucursalVista(sesion);
  const todas = await listarUbicaciones();
  // El encargado: su sucursal y la bodega central (de donde se repone), nunca otra sucursal.
  const ubicaciones = acceso.encargado ? todas.filter((u) => u.id === acceso.sucursalId || u.tipo === "bodega") : todas;
  const permitida = (id: number) => (ubicaciones.some((u) => u.id === id) ? id : 0);

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
      ubicacionId: permitida(Number(sp.ubicacion)) || sucursalVista || undefined,
      tipo: TIPOS.includes(String(sp.tipo)) ? String(sp.tipo) : undefined,
      producto: texto(sp.producto)?.slice(0, 80),
      desde: fechaValida(sp.desde) ?? undefined,
      hasta: fechaValida(sp.hasta) ?? undefined,
      pagina: Number(sp.pagina) || 1,
    };
    const resultado = await listarMovimientos(filtros);
    return (
      <ZonaModulo soloLectura={acceso.soloLectura}>
        <div className="mx-auto max-w-7xl space-y-6">
          <EncabezadoPagina icono={Boxes} titulo="Inventario" descripcion="Cada entrada y salida de mercadería, con quién y por qué" />
          {pestanas}
          <HistorialMovimientos ubicaciones={ubicaciones} filtros={filtros} {...resultado} />
        </div>
      </ZonaModulo>
    );
  }

  const [productos, stock, enCamino] = await Promise.all([
    listarProductosInventario(),
    mapaStock(acceso.encargado ? ubicaciones.map((u) => u.id) : undefined),
    mapaEnCamino(acceso.sucursalId ?? undefined),
  ]);
  const resaltar = Number(sp.resaltar) || null;
  // Desde una alerta: se muestra la sucursal de la alerta (y la bodega), sin cambiar "Viendo sucursal".
  const sucursalFoco = permitida(Number(sp.sucursal)) || sucursalVista;

  return (
    <ZonaModulo soloLectura={acceso.soloLectura}>
    <div className="mx-auto max-w-7xl space-y-6">
      <TablaInventario
        ubicaciones={ubicaciones}
        // Con una sucursal elegida en "Viendo sucursal": esa sucursal y la bodega (de donde se repone).
        columnas={sucursalFoco ? ubicaciones.filter((u) => u.id === sucursalFoco || u.tipo === "bodega") : ubicaciones}
        productos={productos}
        stock={stock}
        enCamino={enCamino}
        resaltar={resaltar}
        ubicacionResaltada={permitida(Number(sp.sucursal)) || null}
      >
        {pestanas}
      </TablaInventario>
    </div>
    </ZonaModulo>
  );
}
