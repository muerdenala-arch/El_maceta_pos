"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  Inbox,
  Package,
  PackagePlus,
  Truck,
  Warehouse,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import {
  DialogoIngreso,
  DialogoTransferencia,
  type PrecargaTransferencia,
  type UbicacionLigera,
} from "@/components/inventario/dialogos-inventario";
import { Pestanas } from "@/components/inventario/pestanas";
import { Miniatura, detalleProducto } from "@/components/inventario/selector-producto";
import { TarjetaEstadistica } from "@/components/panel/tarjeta-estadistica";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cancelarTransferencia, recibirTransferencia, resolverSolicitud } from "@/lib/inventario/acciones";
import type { LoteVigente, ProductoInventario, SolicitudReposicion, Transferencia } from "@/lib/inventario/consultas";
import { diasParaVencer } from "@/lib/inventario/lotes";
import { cn } from "@/lib/utils";

const DIAS_AVISO = 30;

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "short" });
const fechaDia = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-BO", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

type Props = {
  vista: "stock" | "transferencias" | "vencimientos";
  /** ?resaltar=ID desde una alerta de vencimiento. */
  resaltar: number | null;
  hoy: string;
  ubicaciones: UbicacionLigera[];
  productos: ProductoInventario[];
  stock: Record<string, number>;
  lotes: LoteVigente[];
  transferencias: Transferencia[];
  solicitudes: SolicitudReposicion[];
};

export function Bodega({ vista, resaltar, hoy, ubicaciones, productos, stock, lotes, transferencias, solicitudes }: Props) {
  const bodega = ubicaciones.find((u) => u.tipo === "bodega");
  const [ingreso, setIngreso] = useState(false);
  const [transferencia, setTransferencia] = useState<PrecargaTransferencia | "nueva" | null>(null);

  const enBodega = (p: number) => (bodega ? (stock[`${p}:${bodega.id}`] ?? 0) : 0);
  const unidades = productos.reduce((s, p) => s + Math.max(0, enBodega(p.id)), 0);
  const conStock = productos.filter((p) => enBodega(p.id) > 0).length;
  const porVencer = lotes.filter((l) => diasParaVencer(l.vencimiento, hoy) <= DIAS_AVISO);
  const enCamino = transferencias.filter((t) => t.estado === "enviada");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <EncabezadoPagina icono={Warehouse} titulo="Bodega central" descripcion="Compras, envíos a sucursales y vencimientos">
        <Button variant="outline" size="lg" className="rounded-full" onClick={() => setTransferencia("nueva")}>
          <Truck className="size-5" />
          Nueva transferencia
        </Button>
        <Button size="lg" className="rounded-full font-bold" onClick={() => setIngreso(true)}>
          <PackagePlus className="size-5" />
          Ingreso de mercadería
        </Button>
      </EncabezadoPagina>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <TarjetaEstadistica icono={Package} tono="naranja" valor={String(unidades)} titulo="Unidades en bodega" />
        <TarjetaEstadistica icono={Warehouse} tono="verde" valor={String(conStock)} titulo="Productos con stock" />
        <TarjetaEstadistica
          icono={CalendarClock}
          tono="rosa"
          valor={String(porVencer.length)}
          titulo={`Lotes que vencen en ≤ ${DIAS_AVISO} días`}
          detalle="En todas las ubicaciones"
        />
        <TarjetaEstadistica icono={Truck} tono="neutra" valor={String(enCamino.length)} titulo="Transferencias en camino" />
      </section>

      {solicitudes.length > 0 && (
        <Solicitudes solicitudes={solicitudes} stockBodega={enBodega} onAtender={(s, cantidad) =>
          setTransferencia({ destinoId: s.sucursalId, productoId: s.productoId, cantidad, alertaId: s.id })
        } />
      )}

      <Pestanas
        actual={vista}
        opciones={[
          { valor: "stock", titulo: "Stock en bodega", href: "/admin/bodega" },
          { valor: "transferencias", titulo: "Transferencias", href: "/admin/bodega?vista=transferencias", contador: enCamino.length },
          { valor: "vencimientos", titulo: "Vencimientos", href: "/admin/bodega?vista=vencimientos", contador: porVencer.length },
        ]}
      />

      {vista === "stock" && <StockBodega productos={productos} cantidad={enBodega} lotes={lotes.filter((l) => l.ubicacionId === bodega?.id)} hoy={hoy} />}
      {vista === "transferencias" && <ListaTransferencias transferencias={transferencias} />}
      {vista === "vencimientos" && <Vencimientos lotes={lotes} hoy={hoy} ubicaciones={ubicaciones} resaltar={resaltar} />}

      {ingreso && <DialogoIngreso productos={productos} ubicaciones={ubicaciones} onCerrar={() => setIngreso(false)} />}
      {transferencia && (
        <DialogoTransferencia
          productos={productos}
          ubicaciones={ubicaciones}
          stock={stock}
          precarga={transferencia === "nueva" ? undefined : transferencia}
          onCerrar={() => setTransferencia(null)}
        />
      )}
    </div>
  );
}

function Solicitudes({
  solicitudes,
  stockBodega,
  onAtender,
}: {
  solicitudes: SolicitudReposicion[];
  stockBodega: (productoId: number) => number;
  onAtender: (s: SolicitudReposicion, cantidad: number) => void;
}) {
  const resolver = useAccion(resolverSolicitud, { mensajeExito: "Solicitud marcada como atendida" });
  return (
    <section className="rounded-3xl border border-aviso/50 bg-aviso/10 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 font-extrabold">
        <Inbox className="size-5 text-primary" />
        Solicitudes de reposición ({solicitudes.length})
      </h2>
      <ul className="mt-3 space-y-2">
        {solicitudes.map((s) => {
          const cantidad = Number(/^Solicita (\d+)/.exec(s.mensaje)?.[1] ?? 1);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-semibold">
                  {s.sucursal} <ArrowRight className="inline size-3.5 text-muted-foreground" /> {s.producto}
                </p>
                <p className="text-sm text-muted-foreground">
                  {s.mensaje} · {fechaCorta(s.fecha)} · En bodega: <span className="cifras font-semibold">{stockBodega(s.productoId)}</span>
                </p>
              </div>
              <Button size="sm" variant="ghost" disabled={resolver.pendiente} onClick={() => resolver.ejecutar({ id: s.id })}>
                <Check className="size-4" /> Marcar atendida
              </Button>
              <Button size="sm" onClick={() => onAtender(s, cantidad)}>
                <Truck className="size-4" /> Enviar
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StockBodega({
  productos,
  cantidad,
  lotes,
  hoy,
}: {
  productos: ProductoInventario[];
  cantidad: (productoId: number) => number;
  lotes: LoteVigente[];
  hoy: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const visibles = useMemo(() => {
    return productos
      .filter((p) => coincide(busqueda, [p.nombre, p.marca, p.sabor, p.presentacion, p.codigoBarras]))
      .sort((a, b) => Number(cantidad(b.id) > 0) - Number(cantidad(a.id) > 0));
  }, [productos, busqueda, cantidad]);

  return (
    <div className="space-y-4">
      <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar producto" placeholder="Buscar producto, marca o código" />
      <ul className="divide-y rounded-3xl border bg-card shadow-sm">
        {visibles.map((p) => {
          const c = cantidad(p.id);
          const suyos = lotes.filter((l) => l.productoId === p.id);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Miniatura url={p.fotoUrl} className="size-11" />
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-semibold">
                  <Resaltar texto={p.nombre} consulta={busqueda} />
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <Resaltar texto={detalleProducto(p) || "—"} consulta={busqueda} />
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suyos.map((l) => {
                  const dias = diasParaVencer(l.vencimiento, hoy);
                  return (
                    <Badge
                      key={l.id}
                      variant="outline"
                      className={cn("cifras", dias < 0 ? "border-destructive/60 text-destructive" : dias <= DIAS_AVISO && "border-aviso bg-aviso/15")}
                      title={`${l.cantidad} unidades vencen el ${fechaDia(l.vencimiento)}`}
                    >
                      {l.cantidad} · vence {fechaDia(l.vencimiento)}
                    </Badge>
                  );
                })}
              </div>
              <span className={cn("cifras w-16 text-right font-display text-xl font-extrabold", c <= 0 && "text-muted-foreground", c < 0 && "text-destructive")}>
                {c}
              </span>
            </li>
          );
        })}
        {visibles.length === 0 && (
          <li className="p-6 text-center text-muted-foreground">
            {busqueda.trim() ? <SinResultados className="border-0 p-2" consulta={busqueda} onLimpiar={() => setBusqueda("")} /> : "Sin productos."}
          </li>
        )}
      </ul>
    </div>
  );
}

function ListaTransferencias({ transferencias }: { transferencias: Transferencia[] }) {
  const recibir = useAccion(recibirTransferencia, { mensajeExito: "Transferencia recibida: el stock ya está en el destino" });
  const cancelar = useAccion(cancelarTransferencia, { mensajeExito: "Transferencia cancelada: el stock volvió al origen" });
  const [porCancelar, setPorCancelar] = useState<Transferencia | null>(null);
  const ocupado = recibir.pendiente || cancelar.pendiente;

  if (transferencias.length === 0) {
    return <p className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Todavía no hay transferencias.</p>;
  }
  return (
    <>
      <ul className="grid gap-3 lg:grid-cols-2">
        {transferencias.map((t) => (
          <li key={t.id} className={cn("flex flex-col rounded-3xl border bg-card p-4 shadow-sm", t.estado !== "enviada" && "opacity-75")}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">T-{t.id}</span>
              <Badge variant={t.estado === "enviada" ? "default" : t.estado === "recibida" ? "secondary" : "destructive"}>
                {t.estado === "enviada" ? "En camino" : t.estado === "recibida" ? "Recibida" : "Cancelada"}
              </Badge>
              <span className="ml-auto text-xs text-muted-foreground">{fechaCorta(t.enviadaEn)} · {t.envia}</span>
            </div>
            <p className="mt-2 flex items-center gap-2 font-bold">
              {t.origen} <ArrowRight className="size-4 text-primary" /> {t.destino}
            </p>
            <ul className="mt-2 space-y-0.5 text-sm">
              {t.lineas.map((l, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">{l.producto}{l.presentacion && <span className="text-muted-foreground"> · {l.presentacion}</span>}</span>
                  <span className="cifras font-semibold">{l.cantidad}</span>
                </li>
              ))}
            </ul>
            {t.nota && <p className="mt-2 text-sm text-muted-foreground italic">{t.nota}</p>}
            {t.estado === "enviada" ? (
              <div className="mt-4 flex justify-end gap-2 border-t pt-3">
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" disabled={ocupado} onClick={() => setPorCancelar(t)}>
                  <X className="size-4" /> Cancelar
                </Button>
                <Button size="sm" disabled={ocupado} onClick={() => recibir.ejecutar({ id: t.id })}>
                  <Check className="size-4" /> Marcar recibida
                </Button>
              </div>
            ) : (
              t.recibidaEn && (
                <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                  {t.estado === "recibida" ? "Recibida" : "Cancelada"} el {fechaCorta(t.recibidaEn)}{t.recibe && ` por ${t.recibe}`}
                </p>
              )
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={!!porCancelar} onOpenChange={(v) => !v && setPorCancelar(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar la transferencia T-{porCancelar?.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              La mercadería vuelve a {porCancelar?.origen} con sus fechas de vencimiento. Usa esto solo si el envío no salió o regresó completo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (porCancelar) cancelar.ejecutar({ id: porCancelar.id });
                setPorCancelar(null);
              }}
            >
              Sí, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Vencimientos({
  lotes,
  hoy,
  ubicaciones,
  resaltar,
}: {
  lotes: LoteVigente[];
  hoy: string;
  ubicaciones: UbicacionLigera[];
  resaltar: number | null;
}) {
  const [ubicacion, setUbicacion] = useState<number | "todas">("todas");
  const primero = useRef<HTMLLIElement>(null);
  useEffect(() => {
    // Sin llaves devolvería la promesa de scrollIntoView (Chrome) y React la tomaría como limpieza.
    primero.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  const visibles = lotes.filter((l) => ubicacion === "todas" || l.ubicacionId === ubicacion);
  const idPrimeroResaltado = visibles.find((l) => l.productoId === resaltar)?.id;

  return (
    <div className="space-y-4">
      <div className="sin-barra flex gap-2 overflow-x-auto" role="tablist" aria-label="Filtrar por ubicación">
        {[{ id: "todas" as const, nombre: "Todas" }, ...ubicaciones].map((u) => (
          <button
            key={u.id}
            type="button"
            role="tab"
            aria-selected={ubicacion === u.id}
            onClick={() => setUbicacion(u.id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap",
              ubicacion === u.id ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent",
            )}
          >
            {u.nombre}
          </button>
        ))}
      </div>
      {visibles.length === 0 ? (
        <p className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">
          No hay lotes con fecha de vencimiento registrada. Se cargan en el ingreso de mercadería.
        </p>
      ) : (
        <ul className="divide-y rounded-3xl border bg-card shadow-sm">
          {visibles.map((l) => {
            const dias = diasParaVencer(l.vencimiento, hoy);
            return (
              <li
                key={l.id}
                ref={l.id === idPrimeroResaltado ? primero : undefined}
                className={cn("flex flex-wrap items-center gap-3 px-4 py-3", l.productoId === resaltar && "fila-resaltada")}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-xl",
                    dias < 0 ? "bg-destructive/15 text-destructive" : dias <= DIAS_AVISO ? "bg-aviso/25 text-foreground" : "bg-ficha-verde text-ficha-verde-foreground",
                  )}
                >
                  {dias <= DIAS_AVISO ? <AlertTriangle className="size-5" /> : <CalendarClock className="size-5" />}
                </span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-semibold">{l.producto}{l.presentacion && <span className="font-normal text-muted-foreground"> · {l.presentacion}</span>}</p>
                  <p className="text-sm text-muted-foreground">{l.ubicacion}</p>
                </div>
                <div className="text-right">
                  <p className={cn("text-sm font-bold", dias < 0 && "text-destructive")}>
                    {dias < 0 ? `Vencido hace ${-dias} día${dias === -1 ? "" : "s"}` : dias === 0 ? "Vence hoy" : `Vence en ${dias} día${dias === 1 ? "" : "s"}`}
                  </p>
                  <p className="cifras text-xs text-muted-foreground">{fechaDia(l.vencimiento)}</p>
                </div>
                <span className="cifras w-14 text-right font-display text-xl font-extrabold">{l.cantidad}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
