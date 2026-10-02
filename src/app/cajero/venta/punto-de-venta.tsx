"use client";

/* eslint-disable @next/next/no-img-element -- fotos propias, ya comprimidas */
import { Gift, Minus, Package, Plus, ReceiptText, ShoppingCart, Tag, Trash2, ZoomIn } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";
import { combosDisponibles, cotizar, precioCombo, type ComboPos, type ComboVendido, type ItemCombo } from "@/lib/combos/calculo";
import { aCentavos, deCentavos, sumar } from "@/lib/dinero";
import { esFraccionado, nombreEnvase, nombreUnidad, stockCorto, textoCantidadVendida, textoStock, unidadesPedidas } from "@/lib/inventario/fraccion";
import { DialogoFraccion } from "./dialogo-fraccion";
import { Marquesina } from "@/components/texto/marquesina";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { escribirAlmacen, leerAlmacen } from "@/lib/almacen";
import { aplicarPromociones, type LineaCarrito, type Promocion, type ResultadoPromociones } from "@/lib/promociones/motor";
import type { ProductoPos, QrCobro } from "@/lib/caja/consultas";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { descontarStockLocal, type VentaLocalRealizada } from "@/lib/offline/venta-local";
import { useInstantanea, type ContextoPos } from "@/lib/offline/use-instantanea";
import type { VentaRealizada } from "../acciones";
import { DialogoCobro } from "./dialogo-cobro";
import { VentaExitosa } from "./venta-exitosa";

/** `fraccion`: unidades sueltas (cápsulas…) de un producto fraccionado; si no, envases completos. */
type Linea = { productoId: number; cantidad: number; fraccion?: boolean };
type PedidoCombo = { comboId: number; cantidad: number };
/** "1 Whey Gold" / "30 cápsulas Omega 3": un producto del combo. */
const textoItemCombo = (i: ItemCombo, p: ProductoPos | undefined) =>
  `${i.fraccion && p ? textoCantidadVendida(i.cantidad, p.unidadFraccion ?? "capsula") : i.cantidad} ${p?.nombre ?? "producto"}`;
const mismaLinea = (l: Linea, productoId: number, fraccion: boolean) => l.productoId === productoId && !!l.fraccion === fraccion;
const precioLinea = (p: ProductoPos, fraccion?: boolean) => (fraccion ? (p.precioUnidad ?? p.precioVenta) : p.precioVenta);

const detalle = (p: ProductoPos) => [p.marca, p.sabor, p.presentacion].filter(Boolean).join(" · ");
const camposBusqueda = (p: ProductoPos) => [p.nombre, p.marca, p.sabor, p.presentacion, p.categoria, p.codigoBarras];

export type VentaMostrada = VentaRealizada | VentaLocalRealizada;

export function PuntoDeVenta({
  contexto,
  productos: productosServidor,
  qrs: qrsServidor,
  promociones: promocionesServidor,
  combos: combosServidor,
}: {
  contexto: ContextoPos;
  productos: ProductoPos[];
  qrs: QrCobro[];
  /** Promociones automáticas vigentes en la sucursal (el servidor las recalcula al cobrar). */
  promociones: Promocion[];
  /** Combos vigentes (el servidor los vuelve a cotizar al cobrar). */
  combos: ComboPos[];
}) {
  const router = useRouter();
  const cajaId = contexto.cajaId;
  // Datos del servidor o, si es más reciente (ventas sin conexión), la copia local del dispositivo.
  const { instantanea, productos, qrs, promociones, combos } = useInstantanea(contexto, {
    productos: productosServidor,
    qrs: qrsServidor,
    promociones: promocionesServidor,
    combos: combosServidor,
  });
  const claveCarrito = `maseta:carrito:${cajaId}`;
  const claveCombos = `maseta:combos:${cajaId}`;
  const [carrito, setCarrito] = useState<Linea[]>([]);
  const [pedidosCombo, setPedidosCombo] = useState<PedidoCombo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<string | null>(null);
  const [zoom, setZoom] = useState<ProductoPos | null>(null);
  const [fraccionando, setFraccionando] = useState<ProductoPos | null>(null);
  const [verCarrito, setVerCarrito] = useState(false);
  const [cobrando, setCobrando] = useState(false);
  const [realizada, setRealizada] = useState<VentaMostrada | null>(null);
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
      setCarrito(guardado.filter((l) => porId.has(l.productoId) && l.cantidad > 0 && (!l.fraccion || esFraccionado(porId.get(l.productoId)!))));
      const guardados = JSON.parse(leerAlmacen("local", claveCombos) ?? "[]") as PedidoCombo[];
      setPedidosCombo(guardados.filter((c) => c.cantidad > 0 && combos.some((x) => x.id === c.comboId)));
    } catch {
      /* carrito dañado: se empieza vacío */
    }
    setCargado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los combos solo importan al leer el carrito guardado
  }, [claveCarrito, claveCombos, porId]);
  useEffect(() => {
    if (!cargado) return;
    escribirAlmacen("local", claveCarrito, carrito.length ? JSON.stringify(carrito) : null);
    escribirAlmacen("local", claveCombos, pedidosCombo.length ? JSON.stringify(pedidosCombo) : null);
  }, [carrito, pedidosCombo, claveCarrito, claveCombos, cargado]);

  // Combos del carrito cotizados con los precios actuales (sus productos, como líneas con el descuento repartido).
  const cotizacion = useMemo(() => cotizar(pedidosCombo, combos, porId), [pedidosCombo, combos, porId]);

  /**
   * ¿Alcanza el stock si el carrito queda así? Se valida el total en unidades de stock (envases × unidades + sueltas),
   * contando también lo que consumen los combos.
   */
  const alcanza = (p: ProductoPos, lineas: Linea[], pedidos: PedidoCombo[] = pedidosCombo) =>
    unidadesPedidas([...lineas, ...(pedidos === pedidosCombo ? cotizacion.lineas : cotizar(pedidos, combos, porId).lineas)], p) <= p.stock;
  const avisarSinStock = (p: ProductoPos) =>
    toast.warning(p.stock <= 0 ? `${p.nombre} está agotado` : `Solo hay ${textoStock(p.stock, p)} de ${p.nombre}`);

  const agregar = (p: ProductoPos, cantidad = 1, fraccion = false) => {
    const siguiente = carrito.some((l) => mismaLinea(l, p.id, fraccion))
      ? carrito.map((l) => (mismaLinea(l, p.id, fraccion) ? { ...l, cantidad: l.cantidad + cantidad } : l))
      : [...carrito, { productoId: p.id, cantidad, ...(fraccion && { fraccion }) }];
    if (!alcanza(p, siguiente)) return void avisarSinStock(p);
    setCarrito(siguiente);
  };
  /** Deja el combo en esa cantidad (0 = lo quita), si alcanza el stock de todos sus productos. */
  const cambiarCombo = (combo: ComboPos, cantidad: number) => {
    const sin = pedidosCombo.filter((c) => c.comboId !== combo.id);
    if (cantidad <= 0) return setPedidosCombo(sin);
    const siguiente = pedidosCombo.some((c) => c.comboId === combo.id) ? pedidosCombo.map((c) => (c.comboId === combo.id ? { ...c, cantidad } : c)) : [...pedidosCombo, { comboId: combo.id, cantidad }];
    const falta = combo.items.map((i) => porId.get(i.productoId)).find((p) => !p || !alcanza(p, carrito, siguiente));
    if (falta !== undefined || combo.items.length === 0) {
      return void toast.warning(falta ? `No alcanza el stock de ${falta.nombre} para ${cantidad > 1 ? "otro " : "el "}combo` : "Este combo no está disponible");
    }
    setPedidosCombo(siguiente);
  };
  /** Cuántos combos más se pueden agregar con el stock que queda libre (0 = no disponible). */
  const combosLibres = (combo: ComboPos) =>
    combosDisponibles(combo.items, porId, (id) => {
      const p = porId.get(id);
      return p ? p.stock - unidadesPedidas([...carrito, ...cotizacion.lineas], p) : 0;
    });

  /** Tocar un producto: si es fraccionado se pregunta "frasco completo o por cápsulas"; si no, va directo al carrito. */
  const elegir = (p: ProductoPos) => (esFraccionado(p) ? setFraccionando(p) : agregar(p));
  const cambiarCantidad = (productoId: number, fraccion: boolean, cantidad: number) => {
    const p = porId.get(productoId);
    if (!p) return;
    if (cantidad <= 0) return setCarrito((c) => c.filter((l) => !mismaLinea(l, productoId, fraccion)));
    const siguiente = carrito.map((l) => (mismaLinea(l, productoId, fraccion) ? { ...l, cantidad } : l));
    if (!alcanza(p, siguiente)) return void avisarSinStock(p);
    setCarrito(siguiente);
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
    return productos.filter((p) => (!categoria || p.categoria === categoria) && coincide(busqueda, camposBusqueda(p)));
  }, [productos, busqueda, categoria]);

  const lineas = carrito
    .map((l) => ({ ...l, producto: porId.get(l.productoId)! }))
    .filter((l) => l.producto);
  const lineasCarrito: LineaCarrito[] = lineas.map((l) => ({
    productoId: l.productoId,
    categoriaId: l.producto.categoriaId,
    cantidad: l.cantidad,
    precioUnitario: precioLinea(l.producto, l.fraccion),
    ...(l.fraccion && { fraccion: true }),
  }));
  // Promociones solo sobre los productos sueltos; los combos ya traen su descuento.
  const promos = aplicarPromociones(lineasCarrito, promociones);
  const totales = {
    ...promos,
    subtotal: sumar(promos.subtotal, cotizacion.subtotal),
    descuento: sumar(promos.descuento, cotizacion.descuento),
    total: sumar(promos.total, cotizacion.total),
  };
  const combosEnCarrito = pedidosCombo.flatMap((pedido) => {
    const combo = combos.find((c) => c.id === pedido.comboId);
    const cotizado = cotizacion.combos.find((c) => c.comboId === pedido.comboId);
    return combo && cotizado ? [{ combo, cotizado }] : [];
  });
  const combosVisibles = categoria ? [] : combos.filter((c) => coincide(busqueda, [c.nombre, c.descripcion, "combo", ...c.items.map((i) => porId.get(i.productoId)?.nombre)]));
  // Para el contador del carrito: cada envase cuenta uno; un grupo de unidades sueltas, uno; cada combo, uno.
  const unidades = lineas.reduce((s, l) => s + (l.fraccion ? 1 : l.cantidad), 0) + cotizacion.combos.reduce((s, c) => s + c.cantidad, 0);

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
      resultado={totales}
      unidades={unidades}
      onCantidad={cambiarCantidad}
      puedeSumar={(l) => alcanza(l.producto, carrito.map((x) => (mismaLinea(x, l.productoId, !!l.fraccion) ? { ...x, cantidad: x.cantidad + 1 } : x)))}
      combos={combosEnCarrito}
      nombreProducto={(id) => porId.get(id)}
      onCombo={cambiarCombo}
      puedeSumarCombo={(c) => combosLibres(c) > 0}
      onVaciar={() => {
        setCarrito([]);
        setPedidosCombo([]);
      }}
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
        <Buscador
          grande
          className="max-w-none"
          refCampo={buscador}
          valor={busqueda}
          onCambiar={setBusqueda}
          etiqueta="Buscar producto"
          placeholder="Buscar por nombre, marca o categoría · escanear código"
          // Enter: código de barras exacto o único resultado → al carrito (con lo escrito, sin esperar al filtro).
          onEnter={(texto) => {
            const codigo = texto.trim();
            const exacto = productos.find((p) => p.codigoBarras && p.codigoBarras === codigo);
            const candidatos = codigo ? productos.filter((p) => (!categoria || p.categoria === categoria) && coincide(texto, camposBusqueda(p))) : [];
            const elegido = exacto ?? (candidatos.length === 1 ? candidatos[0] : null);
            if (!elegido) return false;
            // Código escaneado = envase completo; elegido por nombre = se pregunta si es fraccionado.
            if (exacto) agregar(exacto);
            else elegir(elegido);
            setBusqueda("");
            return true;
          }}
        />

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

        {combosVisibles.length > 0 && (
          <section className="mt-4" aria-label="Combos">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold tracking-wide text-muted-foreground uppercase">
              <Gift className="size-4 text-primary" /> Combos
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3">
              {combosVisibles.map((c) => {
                const precio = precioCombo(
                  c.items.flatMap((i) => (porId.has(i.productoId) ? [{ precio: precioLinea(porId.get(i.productoId)!, i.fraccion), cantidad: i.cantidad }] : [])),
                  c.tipoDescuento,
                  c.valorDescuento,
                );
                const enCarrito = pedidosCombo.find((x) => x.comboId === c.id)?.cantidad ?? 0;
                const puedeAgregar = combosLibres(c) > 0;
                // Si ya está en el carrito sigue "disponible" aunque no alcance para otro más.
                const disponible = puedeAgregar || enCarrito > 0;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={!puedeAgregar}
                      onClick={() => cambiarCombo(c, enCarrito + 1)}
                      data-desplazar
                      className={cn(
                        "relative flex w-full items-stretch gap-3 overflow-hidden rounded-3xl border bg-card p-2.5 text-left shadow-sm transition-colors hover:bg-accent/60 active:bg-accent disabled:cursor-not-allowed",
                        !disponible && "opacity-55",
                      )}
                    >
                      <span className="relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ficha-rosa text-ficha-rosa-foreground">
                        {c.fotoUrl ? <img src={c.fotoUrl} alt="" loading="lazy" className="size-full object-cover" /> : <Gift className="size-8" />}
                        {enCarrito > 0 && (
                          <span className="cifras absolute right-1 bottom-1 flex size-7 items-center justify-center rounded-full bg-primary font-display text-sm font-extrabold text-primary-foreground shadow">
                            {enCarrito}
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <Marquesina siempre titulo={c.nombre} className="leading-snug font-bold">
                          <Resaltar texto={c.nombre} consulta={busqueda} />
                        </Marquesina>
                        <span className="line-clamp-2 text-xs text-muted-foreground">{c.items.map((i) => textoItemCombo(i, porId.get(i.productoId))).join(" + ")}</span>
                        <span className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-1">
                          <span className="cifras font-display text-lg font-extrabold">{formatoBs(precio.final)}</span>
                          {Number(precio.descuento) > 0 && <span className="cifras text-xs text-muted-foreground line-through">{formatoBs(precio.normal)}</span>}
                          {!disponible ? (
                            <Badge variant="destructive">No disponible</Badge>
                          ) : (
                            Number(precio.descuento) > 0 && <span className="cifras text-xs font-bold text-exito">Ahorras {formatoBs(precio.descuento)}</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibles.map((p) => {
            const enCarrito = carrito.filter((l) => l.productoId === p.id).reduce((s, l) => s + (l.fraccion ? 1 : l.cantidad), 0);
            const agotado = p.stock <= 0;
            const fraccionado = esFraccionado(p);
            const quedan = stockCorto(p.stock, p);
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
                    Number(quedan.principal) <= 3 && (
                      <Badge className="absolute top-2.5 right-2.5 bg-aviso text-aviso-foreground">
                        Quedan {quedan.principal}
                        {quedan.extra && ` ${quedan.extra}`}
                      </Badge>
                    )
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
                  onClick={() => elegir(p)}
                  className="flex flex-1 flex-col p-3 text-left transition-colors hover:bg-accent/60 active:bg-accent disabled:cursor-not-allowed"
                >
                  <Marquesina siempre titulo={p.nombre} className="leading-snug font-bold">
                    <Resaltar texto={p.nombre} consulta={busqueda} />
                  </Marquesina>
                  <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{detalle(p) ? <Resaltar texto={detalle(p)} consulta={busqueda} /> : " "}</span>
                  <span className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="min-w-0">
                      <span className="cifras block font-display text-lg font-extrabold">{formatoBs(p.precioVenta)}</span>
                      {fraccionado && (
                        <span className="cifras block truncate text-xs font-semibold text-primary">
                          o {formatoBs(p.precioUnidad ?? "0")} por {nombreUnidad(p, 1)}
                        </span>
                      )}
                    </span>
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm" aria-hidden>
                      <Plus className="size-5" />
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {visibles.length === 0 && combosVisibles.length === 0 && (
            <li className="col-span-full">
              {busqueda.trim() ? (
                <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />
              ) : (
                <p className="rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
                  {productos.length === 0 ? "No hay productos activos en el catálogo." : "No hay productos en esta categoría."}
                </p>
              )}
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
                    elegir(zoom);
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

      {fraccionando && (
        <DialogoFraccion
          producto={porId.get(fraccionando.id) ?? fraccionando}
          disponible={Math.max(0, (porId.get(fraccionando.id) ?? fraccionando).stock - unidadesPedidas([...carrito, ...cotizacion.lineas], fraccionando))}
          onCerrar={() => setFraccionando(null)}
          onAgregar={(cantidad, fraccion) => {
            agregar(porId.get(fraccionando.id) ?? fraccionando, cantidad, fraccion);
            setFraccionando(null);
          }}
        />
      )}

      {cobrando && (
        <DialogoCobro
          lineas={lineasCarrito}
          combos={cotizacion}
          promociones={promociones}
          instantanea={instantanea}
          qrs={qrs}
          onCerrar={() => setCobrando(false)}
          onError={() => navigator.onLine && router.refresh()}
          onExito={(venta) => {
            setCobrando(false);
            setCarrito([]);
            setPedidosCombo([]);
            setRealizada(venta);
            if ("offline" in venta) return; // la copia local ya descontó el stock
            // En línea: se descuenta también de la copia local hasta que llegue el stock del servidor.
            descontarStockLocal(`pos:${contexto.usuarioId}`, [...lineasCarrito, ...cotizacion.lineas]).catch(() => {});
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PanelCarrito({
  lineas,
  resultado,
  unidades,
  onCantidad,
  puedeSumar,
  combos,
  nombreProducto,
  onCombo,
  puedeSumarCombo,
  onVaciar,
  onCobrar,
}: {
  combos: { combo: ComboPos; cotizado: ComboVendido }[];
  nombreProducto: (id: number) => ProductoPos | undefined;
  onCombo: (combo: ComboPos, cantidad: number) => void;
  puedeSumarCombo: (combo: ComboPos) => boolean;
  lineas: (Linea & { producto: ProductoPos })[];
  resultado: ResultadoPromociones;
  unidades: number;
  onCantidad: (productoId: number, fraccion: boolean, cantidad: number) => void;
  /** ¿Hay stock para una unidad más de esta línea? (cuenta también la otra línea del mismo producto). */
  puedeSumar: (l: Linea & { producto: ProductoPos }) => boolean;
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
        {lineas.length + combos.length > 0 && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onVaciar}>
            <Trash2 className="size-4" /> Vaciar
          </Button>
        )}
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto p-3">
        <AnimatePresence initial={false}>
          {combos.map(({ combo, cotizado }) => {
            const normal = deCentavos(aCentavos(cotizado.precioNormal) * BigInt(cotizado.cantidad));
            const final = deCentavos(aCentavos(cotizado.precioFinal) * BigInt(cotizado.cantidad));
            return (
              <motion.li
                key={`combo:${combo.id}`}
                layout
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-3 rounded-2xl bg-ficha-rosa/40 p-2.5"
                data-desplazar
              >
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ficha-rosa text-ficha-rosa-foreground">
                  {combo.fotoUrl ? <img src={combo.fotoUrl} alt="" className="size-full object-cover" /> : <Gift className="size-5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <Marquesina className="text-sm font-bold">{combo.nombre}</Marquesina>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{combo.items.map((i) => textoItemCombo(i, nombreProducto(i.productoId))).join(" + ")}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <button type="button" onClick={() => onCombo(combo, cotizado.cantidad - 1)} aria-label={`Quitar un combo ${combo.nombre}`} className="flex size-8 items-center justify-center rounded-lg border bg-background hover:bg-accent">
                      {cotizado.cantidad === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
                    </button>
                    <span className="cifras min-w-8 text-center font-display font-extrabold">{cotizado.cantidad}</span>
                    <button
                      type="button"
                      onClick={() => onCombo(combo, cotizado.cantidad + 1)}
                      disabled={!puedeSumarCombo(combo)}
                      aria-label={`Agregar un combo ${combo.nombre}`}
                      className="flex size-8 items-center justify-center rounded-lg border bg-background hover:bg-accent disabled:opacity-40"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <span className="ml-1 text-xs font-semibold text-muted-foreground">combo{cotizado.cantidad === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <span className="flex flex-col items-end">
                  {normal !== final && <span className="cifras text-xs text-muted-foreground line-through">{formatoBs(normal)}</span>}
                  <span className={cn("cifras font-display font-extrabold", normal !== final && "text-exito")}>{formatoBs(final)}</span>
                </span>
              </motion.li>
            );
          })}
          {lineas.map((l, i) => {
            const conPromo = resultado.lineas[i];
            const tieneDescuento = !!conPromo && Number(conPromo.descuento) > 0;
            return (
            <motion.li
              key={`${l.productoId}:${l.fraccion ? "u" : "e"}`}
              layout
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-3 rounded-2xl bg-muted/50 p-2.5"
              data-desplazar
            >
              <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
                {l.producto.fotoUrl ? <img src={l.producto.fotoUrl} alt="" className="size-full object-cover" /> : <Package className="size-5 text-muted-foreground" />}
              </span>
              <div className="min-w-0 flex-1">
                <Marquesina className="text-sm font-bold">{l.producto.nombre}</Marquesina>
                <p className="cifras text-xs text-muted-foreground">
                  {formatoBs(precioLinea(l.producto, l.fraccion))} {l.fraccion ? `por ${nombreUnidad(l.producto, 1)}` : esFraccionado(l.producto) ? `por ${nombreEnvase(l.producto)}` : "c/u"}
                </p>
                {conPromo?.promocion && (
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-bold text-exito">
                    <Tag className="size-3 shrink-0" /> {conPromo.promocion}
                  </p>
                )}
                <div className="mt-1 flex items-center gap-1">
                  <button type="button" onClick={() => onCantidad(l.productoId, !!l.fraccion, l.cantidad - 1)} aria-label={`Quitar uno de ${l.producto.nombre}`} className="flex size-8 items-center justify-center rounded-lg border bg-background hover:bg-accent">
                    {l.cantidad === 1 ? <Trash2 className="size-3.5" /> : <Minus className="size-3.5" />}
                  </button>
                  <span className="cifras min-w-8 text-center font-display font-extrabold">{l.cantidad}</span>
                  <button
                    type="button"
                    onClick={() => onCantidad(l.productoId, !!l.fraccion, l.cantidad + 1)}
                    disabled={!puedeSumar(l)}
                    aria-label={`Agregar uno de ${l.producto.nombre}`}
                    className="flex size-8 items-center justify-center rounded-lg border bg-background hover:bg-accent disabled:opacity-40"
                  >
                    <Plus className="size-3.5" />
                  </button>
                  {esFraccionado(l.producto) && (
                    <span className="ml-1 text-xs font-semibold text-muted-foreground">{l.fraccion ? nombreUnidad(l.producto, l.cantidad) : nombreEnvase(l.producto, l.cantidad)}</span>
                  )}
                </div>
              </div>
              <span className="flex flex-col items-end">
                {tieneDescuento && <span className="cifras text-xs text-muted-foreground line-through">{formatoBs(conPromo.subtotal)}</span>}
                <span className={cn("cifras font-display font-extrabold", tieneDescuento && "text-exito")}>
                  {formatoBs(conPromo?.total ?? "0")}
                </span>
              </span>
            </motion.li>
            );
          })}
        </AnimatePresence>
        {lineas.length + combos.length === 0 && (
          <li className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ShoppingCart className="size-10 opacity-40" />
            Toca un producto o escanea su código
          </li>
        )}
      </ul>

      <div className="space-y-3 border-t p-4">
        {Number(resultado.descuento) > 0 && (
          <div className="space-y-0.5 text-sm">
            <p className="flex justify-between text-muted-foreground">
              <span>Subtotal</span> <span className="cifras">{formatoBs(resultado.subtotal)}</span>
            </p>
            <p className="flex justify-between font-semibold text-exito">
              <span>Descuentos</span> <span className="cifras">−{formatoBs(resultado.descuento)}</span>
            </p>
          </div>
        )}
        <div className="flex items-end justify-between">
          <span className="font-semibold text-muted-foreground">Total</span>
          <span className="cifras font-display text-3xl font-extrabold">{formatoBs(resultado.total)}</span>
        </div>
        <Button size="lg" className="h-14 w-full rounded-2xl text-lg font-bold" disabled={lineas.length + combos.length === 0} onClick={onCobrar}>
          Cobrar
        </Button>
      </div>
    </div>
  );
}
