"use client";

/* eslint-disable @next/next/no-img-element -- fotos propias, ya comprimidas */
import { Minus, Package, Plus, ReceiptText, Search, ShoppingCart, Trash2, X, ZoomIn } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { escribirAlmacen, leerAlmacen } from "@/lib/almacen";
import { totalesVenta } from "@/lib/caja/calculos";
import type { ProductoPos, QrCobro } from "@/lib/caja/consultas";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { VentaRealizada } from "../acciones";
import { DialogoCobro } from "./dialogo-cobro";
import { VentaExitosa } from "./venta-exitosa";

type Linea = { productoId: number; cantidad: number };

const detalle = (p: ProductoPos) => [p.marca, p.sabor, p.presentacion].filter(Boolean).join(" · ");

export function PuntoDeVenta({ cajaId, productos, qrs }: { cajaId: number; productos: ProductoPos[]; qrs: QrCobro[] }) {
  const router = useRouter();
  const claveCarrito = `maseta:carrito:${cajaId}`;
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ProductoPos | null>(null);
  const [verCarrito, setVerCarrito] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [realizada, setRealizada] = useState<VentaRealizada | null>(null);
  const buscador = useRef<HTMLInputElement>(null);
  // Estado (no ref): hasta que se lee el carrito guardado, no se escribe nada encima.
  const [cargado, setCargado] = useState(false);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const categorias = useMemo(
    () => [...new Set(productos.map((p) => p.categoria).filter((c): c is string => !!c))].sort(),
    [productos],
  );

  // El carrito sobrevive a recargas y a ir a Gastos y volver (se guarda por caja en este dispositivo).
  useEffect(() => {
    try {
      const guardado = JSON.parse(leerAlmacen("local", claveCarrito) ?? "[]") as Linea[];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el cliente
      setCarrito(guardado.filter((l) => porId.has(l.productoId) && l.cantidad > 0));
    } catch {
      /* carrito dañado: se empieza vacío */
    }
    setCargado(true);
  }, [claveCarrito, porId]);
  useEffect(() => {
    if (cargado) escribirAlmacen("local", claveCarrito, carrito.length ? JSON.stringify(carrito) : null);
  }, [carrito, claveCarrito, cargado]);

  const agregar = (p: ProductoPos, cantidad = 1) => {
    const actual = carrito.find((l) => l.productoId === p.id)?.cantidad ?? 0;
    if (actual + cantidad > p.stock) {
      toast.warning(p.stock <= 0 ? `${p.nombre} está agotado` : `Solo hay ${p.stock} de ${p.nombre}`);
      return;
    }
    setCarrito((c) =>
      c.some((l) => l.productoId === p.id)
        ? c.map((l) => (l.productoId === p.id ? { ...l, cantidad: l.cantidad + cantidad } : l))
        : [...c, { productoId: p.id, cantidad }],
    );
  };
  const cambiarCantidad = (productoId: number, cantidad: number) => {
    const p = porId.get(productoId);
    if (!p) return;
    if (cantidad <= 0) return setCarrito((c) => c.filter((l) => l.productoId !== productoId));
    if (cantidad > p.stock) return toast.warning(`Solo hay ${p.stock} de ${p.nombre}`);
    setCarrito((c) => c.map((l) => (l.productoId === productoId ? { ...l, cantidad } : l)));
  };

  // Lector de código de barras: escribe muy rápido y termina con Enter. Funciona sin enfocar el buscador.
  const agregarRef = useRef(agregar);
  useEffect(() => {
    agregarRef.current = agregar;
  });
  useEffect(() => {
    let buffer = "";
    let ultimo = 0;
    const alTeclear = (e: KeyboardEvent) => {
      if (cobrando || realizada) return;
      const destino = e.target instanceof Element ? e.target : null;
      if (destino?.closest("input, textarea, [contenteditable], [role=dialog]")) return;
      const ahora = performance.now();
      if (ahora - ultimo > 80) buffer = "";
      ultimo = ahora;
      if (e.key === "Enter" && buffer.length >= 4) {
        const p = productos.find((x) => x.codigoBarras === buffer);
        if (p) agregarRef.current(p);
        else toast.error(`Código ${buffer} no encontrado`);
        buffer = "";
        e.preventDefault();
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [productos, cobrando, realizada]);

  const visibles = useMemo(() => {
    const palabras = busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return productos.filter(
      (p) =>
        (!categoria || p.categoria === categoria) &&
        palabras.every((w) => [p.nombre, p.marca, p.sabor, p.presentacion, p.categoria, p.codigoBarras].some((t) => t?.toLowerCase().includes(w))),
    );
  }, [productos, busqueda, categoria]);

  const lineas = carrito
    .map((l) => ({ ...l, producto: porId.get(l.productoId)! }))
    .filter((l) => l.producto);
  const totales = totalesVenta(lineas.map((l) => ({ precioUnitario: l.producto.precioVenta, cantidad: l.cantidad })));
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  if (realizada) {
    return (
      <VentaExitosa
        venta={realizada}
        onNueva={() => {
          setRealizada(null);
          buscador.current?.focus();
        }}
      />
    );
  }

  const panelCarrito = (
    <PanelCarrito
      lineas={lineas}
      total={totales.total}
      unidades={unidades}
      onCantidad={cambiarCantidad}
      onVaciar={() => setCarrito([])}
      onCobrar={() => {
        setVerCarrito(false);
        setCobrando(true);
      }}
    />
  );

  return (
    <div className="mx-auto grid max-w-[100rem] gap-6 lg:grid-cols-[1fr_24rem]">
      <section className="min-w-0">
        <div className="mb-3 flex justify-end">
          <Link href="/cajero/ventas" className="flex items-center gap-1.5 rounded-full border bg-card px-4 py-2 text-sm font-semibold hover:bg-accent">
            <ReceiptText className="size-4" /> Ventas de hoy
          </Link>
        </div>
        <label className="relative block">
          <span className="sr-only">Buscar producto</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={buscador}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const codigo = busqueda.trim();
              const exacto = productos.find((p) => p.codigoBarras && p.codigoBarras === codigo);
              const unico = visibles.length === 1 ? visibles[0] : null;
              const elegido = exacto ?? unico;
              if (elegido) {
                agregar(elegido);
                setBusqueda("");
              }
            }}
            placeholder="Buscar por nombre, marca o categoría · escanear código"
            className="h-14 w-full rounded-2xl border bg-card pr-12 pl-12 text-base shadow-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          />
          {busqueda && (
            <button type="button" onClick={() => setBusqueda("")} aria-label="Limpiar búsqueda" className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:bg-accent">
              <X className="size-5" />
            </button>
          )}
        </label>

        {categorias.length > 0 && (
          <div className="sin-barra -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist" aria-label="Categorías">
            {[null, ...categorias].map((c) => (
              <button
                key={c ?? "todas"}
                type="button"
                role="tab"
                aria-selected={categoria === c}
                onClick={() => setCategoria(c)}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
                  categoria === c ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "bg-card hover:bg-accent",
                )}
              >
                {c ?? "Todos"}
              </button>
            ))}
          </div>
        )}

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibles.map((p) => {
            const enCarrito = carrito.find((l) => l.productoId === p.id)?.cantidad ?? 0;
            const agotado = p.stock <= 0;
            return (
              <li key={p.id} className={cn("relative flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm", agotado && "opacity-50")}>
                <button
                  type="button"
                  onClick={() => setZoom(p)}
                  aria-label={`Ver foto de ${p.nombre}`}
                  className="group relative aspect-square bg-muted"
                >
                  {p.fotoUrl ? (
                    <img src={p.fotoUrl} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <Package className="absolute inset-0 m-auto size-12 text-muted-foreground/40" />
                  )}
                  <ZoomIn className="absolute top-2.5 left-2.5 size-8 rounded-full bg-background/80 p-1.5 opacity-0 shadow transition-opacity group-hover:opacity-100" />
                  {agotado ? (
                    <Badge variant="destructive" className="absolute top-2.5 right-2.5">Agotado</Badge>
                  ) : (
                    p.stock <= 3 && <Badge className="absolute top-2.5 right-2.5 bg-aviso text-aviso-foreground">Quedan {p.stock}</Badge>
                  )}
                  <AnimatePresence>
                    {enCarrito > 0 && (
                      <motion.span
                        key={enCarrito}
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.15 }}
                        className="cifras absolute right-2.5 bottom-2.5 flex size-9 items-center justify-center rounded-full bg-primary font-display text-base font-extrabold text-primary-foreground shadow-lg"
                      >
                        {enCarrito}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </button>
                <button
                  type="button"
                  disabled={agotado}
                  onClick={() => agregar(p)}
                  className="flex flex-1 flex-col p-3 text-left transition-colors hover:bg-accent/60 active:bg-accent disabled:cursor-not-allowed"
                >
                  <span className="line-clamp-2 leading-snug font-bold">{p.nombre}</span>
                  <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{detalle(p) || " "}</span>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="cifras font-display text-lg font-extrabold">{formatoBs(p.precioVenta)}</span>
                    <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm" aria-hidden>
                      <Plus className="size-5" />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {visibles.length === 0 && (
            <li className="col-span-full rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
              {productos.length === 0 ? "No hay productos activos en el catálogo." : "No hay productos que coincidan."}
            </li>
          )}
        </ul>
      </section>

      {/* PC: carrito fijo a la derecha */}
      <aside className="sticky top-8 hidden h-[calc(100dvh-4rem)] lg:block">{panelCarrito}</aside>

      {/* Celular/tablet: barra inferior que abre el carrito */}
      {unidades > 0 && (
        <button
          type="button"
          onClick={() => setVerCarrito(true)}
          className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 rounded-2xl bg-primary px-5 py-4 text-primary-foreground shadow-xl lg:hidden"
        >
          <ShoppingCart className="size-6" />
          <span className="font-bold">{unidades} producto{unidades === 1 ? "" : "s"}</span>
          <span className="cifras ml-auto font-display text-xl font-extrabold">{formatoBs(totales.total)}</span>
        </button>
      )}
      <Sheet open={verCarrito} onOpenChange={setVerCarrito}>
        <SheetContent side="bottom" className="h-[88dvh] rounded-t-3xl p-0">
          <SheetTitle className="sr-only">Carrito</SheetTitle>
          {panelCarrito}
        </SheetContent>
      </Sheet>

      <Dialog open={!!zoom} onOpenChange={(v) => !v && setZoom(null)}>
        <DialogContent className="max-w-[min(92vw,40rem)] overflow-hidden rounded-3xl p-0">
          <DialogTitle className="sr-only">{zoom?.nombre}</DialogTitle>
          {zoom && (
            <>
              <div className="aspect-square bg-muted">
                {zoom.fotoUrl ? (
                  <img src={zoom.fotoUrl} alt={zoom.nombre} className="size-full object-contain" />
                ) : (
                  <Package className="m-auto size-full p-24 text-muted-foreground/40" />
                )}
              </div>
              <div className="flex items-center gap-4 p-5">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-bold">{zoom.nombre}</p>
                  <p className="text-sm text-muted-foreground">{detalle(zoom)}</p>
                  <p className="cifras mt-1 font-display text-2xl font-extrabold">{formatoBs(zoom.precioVenta)}</p>
                </div>
                <Button
                  size="lg"
                  className="h-12 rounded-xl font-bold"
                  disabled={zoom.stock <= 0}
                  onClick={() => {
                    agregar(zoom);
                    setZoom(null);
                  }}
                >
                  <Plus className="size-5" /> Agregar
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {cobrando && (
        <DialogoCobro
          total={totales.total}
          lineas={lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad }))}
          qrs={qrs}
          onCerrar={() => setCobrando(false)}
          onError={() => router.refresh()}
          onExito={(venta) => {
            setCobrando(false);
            setCarrito([]);
            setRealizada(venta);
            router.refresh(); // stock actualizado
          }}
        />
      )}
    </div>
  );
}

function PanelCarrito({
  lineas,
  total,
  unidades,
  onCantidad,
  onVaciar,
  onCobrar,
}: {
  lineas: (Linea & { producto: ProductoPos })[];
  total: string;
  unidades: number;
  onCantidad: (productoId: number, cantidad: number) => void;
  onVaciar: () => void;
  onCobrar: () => void;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-3xl border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b py-4 pr-14 pl-5 lg:pr-5">
        <h2 className="flex items-center gap-2 text-lg font-extrabold">
          <ShoppingCart className="size-5 text-primary" /> Carrito
          {unidades > 0 && <span className="cifras rounded-full bg-primary px-2 text-sm text-primary-foreground">{unidades}</span>}
        </h2>
        {lineas.length > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onVaciar}>
            <Trash2 className="size-4" /> Vaciar
          </Button>
        )}
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto p-3">
        <AnimatePresence initial={false}>
          {lineas.map((l) => (
            <motion.li
              key={l.productoId}
              layout
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-3 rounded-2xl bg-muted/50 p-2.5"
            >
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                {l.producto.fotoUrl ? <img src={l.producto.fotoUrl} alt="" className="size-full object-cover" /> : <Package className="size-5 text-muted-foreground" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{l.producto.nombre}</p>
                <p className="cifras text-xs text-muted-foreground">{formatoBs(l.producto.precioVenta)} c/u</p>
                <div className="mt-1 flex items-center gap-1">
                  <button type="button" onClick={() => onCantidad(l.productoId, l.cantidad - 1)} aria-label={`Quitar uno de ${l.producto.nombre}`} className="flex size-8 items-center justify-center rounded-lg border bg-background hover:bg-accent">
                    {l.cantidad === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
                  </button>
                  <span className="cifras w-8 text-center font-display font-extrabold">{l.cantidad}</span>
                  <button
                    type="button"
                    onClick={() => onCantidad(l.productoId, l.cantidad + 1)}
                    disabled={l.cantidad >= l.producto.stock}
                    aria-label={`Agregar uno de ${l.producto.nombre}`}
                    className="flex size-8 items-center justify-center rounded-lg border bg-background hover:bg-accent disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
              <span className="cifras font-display font-extrabold">
                {formatoBs(totalesVenta([{ precioUnitario: l.producto.precioVenta, cantidad: l.cantidad }]).total)}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {lineas.length === 0 && (
          <li className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ShoppingCart className="size-10 opacity-40" />
            Toca un producto o escanea su código
          </li>
        )}
      </ul>

      <div className="space-y-3 border-t p-4">
        <div className="flex items-end justify-between">
          <span className="font-semibold text-muted-foreground">Total</span>
          <span className="cifras font-display text-3xl font-extrabold">{formatoBs(total)}</span>
        </div>
        <Button size="lg" className="h-14 w-full rounded-2xl text-lg font-bold" disabled={lineas.length === 0} onClick={onCobrar}>
          Cobrar
        </Button>
      </div>
    </div>
  );
}
