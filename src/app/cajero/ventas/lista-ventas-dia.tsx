"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { CloudOff, ReceiptText } from "lucide-react";
import { useState } from "react";
import { AccionesComprobante } from "@/components/comprobante/acciones-comprobante";
import { Comprobante } from "@/components/comprobante/comprobante";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { DatosComprobante } from "@/lib/comprobante/datos";
import { baseLocal } from "@/lib/offline/base";
import { Buscador } from "@/components/busqueda/buscador";
import { ListaVentas, numeroCorto, type VentaResumida } from "@/components/comprobante/lista-ventas";
import { coincide } from "@/lib/busqueda";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { sumar } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";

export function ListaVentasDia({ ventas, usuarioId, rol }: { ventas: VentaResumida[]; usuarioId: number; rol: "cajero" | "encargado" }) {
  // Ventas hechas sin conexión en este dispositivo que aún no se enviaron (se reimprimen desde aquí).
  const locales = useLiveQuery(
    () => baseLocal().ventasLocales.where("usuarioId").equals(usuarioId).filter((v) => !v.sincronizada).reverse().sortBy("creado"),
    [usuarioId],
    [],
  );
  const [abierta, setAbierta] = useState<DatosComprobante | null>(null);
  const completadas = ventas.filter((v) => v.estado === "completada");
  const [busqueda, setBusqueda] = useState("");
  const visibles = ventas.filter((v) =>
    coincide(busqueda, [numeroCorto(v.numero), v.cliente ?? "Cliente sin nombre", v.metodoPago === "qr" ? "QR" : "Efectivo", v.productos, v.estado === "anulada" ? "Anulada" : null]),
  );
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <EncabezadoPagina
        icono={ReceiptText}
        titulo="Ventas de hoy"
        descripcion={`${completadas.length} venta${completadas.length === 1 ? "" : "s"} · ${formatoBs(completadas.length ? sumar(...completadas.map((v) => v.total)) : "0")}`}
      />
      <p className="text-sm text-muted-foreground">Toca una venta para reimprimir, descargar o reenviar su comprobante{rol === "cajero" ? "; para anularla hace falta el PIN del encargado" : " o para anularla"}.</p>
      {locales.length > 0 && (
        <section className="space-y-2 rounded-3xl border border-aviso/50 bg-aviso/10 p-4">
          <h2 className="flex items-center gap-2 font-bold">
            <CloudOff className="size-5" /> Sin sincronizar ({locales.length})
          </h2>
          <ul className="space-y-2">
            {locales.map((v) => (
              <li key={v.uuid}>
                <button
                  type="button"
                  onClick={() => setAbierta(v.comprobante)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-sm hover:bg-accent"
                >
                  <span className="font-mono text-sm text-muted-foreground">{v.comprobante.venta.codigoLocal}</span>
                  <span className="flex-1 truncate text-sm">
                    {new Date(v.creado).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} ·{" "}
                    {v.comprobante.venta.metodoPago === "qr" ? "QR" : "Efectivo"}
                  </span>
                  <span className="cifras font-display font-extrabold">{formatoBs(v.comprobante.venta.total)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ventas.length > 0 && <Buscador grande className="max-w-none" valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar ventas" placeholder="N.º de venta, cliente o producto" />}
      <ListaVentas ventas={visibles} anulacion={rol} consulta={busqueda} onLimpiar={() => setBusqueda("")} />
      <Dialog open={!!abierta} onOpenChange={(v) => !v && setAbierta(null)}>
        <DialogContent className="max-h-[94dvh] overflow-y-auto rounded-3xl sm:max-w-md">
          <DialogTitle className="font-display text-xl font-extrabold">Comprobante provisional</DialogTitle>
          {abierta && (
            <>
              <div className="flex justify-center overflow-x-auto rounded-2xl border bg-white p-3">
                <Comprobante datos={abierta} tamano={abierta.sucursal.tamanoImpresion === "58mm" ? "58mm" : "80mm"} />
              </div>
              <AccionesComprobante datos={abierta} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
