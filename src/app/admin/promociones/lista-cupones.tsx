"use client";

import { CalendarRange, Check, Layers, Pencil, Plus, Store, Tag, TicketPercent, Trash2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import { Miniatura } from "@/components/inventario/selector-producto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { coincide } from "@/lib/busqueda";
import { formatoBs } from "@/lib/formato";
import { estadoCupon, generarCodigo, NOMBRES_ESTADO_CUPON, textoDescuentoCupon, type EstadoCuponAdmin } from "@/lib/promociones/cupones";
import { cn } from "@/lib/utils";
import type { DatosCupon } from "@/lib/validaciones/promociones";
import { cambiarEstadoCupon, eliminarCupon, guardarCupon } from "./acciones";

type Cupon = {
  id: number;
  codigo: string;
  descripcion: string | null;
  tipo: "porcentaje" | "monto";
  valor: string;
  montoMinimo: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  usosMaximos: number | null;
  usosActuales: number;
  activo: boolean;
  alcance: "todo" | "productos" | "categorias";
  productoIds: number[];
  categoriaIds: number[];
  sucursalIds: number[];
  acumulaPromociones: boolean;
  acumulaCombos: boolean;
};
type ProductoLigero = { id: number; nombre: string; marca: string | null; sabor: string | null; presentacion: string | null; codigoBarras: string | null; fotoUrl: string | null };
type Opcion = { id: number; nombre: string };

const CLASE_ESTADO: Record<EstadoCuponAdmin, string> = {
  activo: "bg-exito text-exito-foreground",
  inactivo: "bg-muted text-muted-foreground",
  programado: "bg-ficha-neutra text-ficha-neutra-foreground",
  vencido: "bg-destructive/15 text-destructive",
  agotado: "bg-aviso text-aviso-foreground",
};
const fechaCorta = (dia: string) => dia.split("-").reverse().join("/");

export function ListaCupones({
  hoy,
  cupones,
  productos,
  categorias,
  sucursales,
  children,
}: {
  hoy: string;
  cupones: Cupon[];
  productos: ProductoLigero[];
  categorias: Opcion[];
  sucursales: Opcion[];
  children?: React.ReactNode;
}) {
  const [editando, setEditando] = useState<Cupon | "nuevo" | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const cambiar = useAccion(cambiarEstadoCupon);
  const eliminar = useAccion(eliminarCupon, { mensajeExito: "Cupón eliminado" });
  const nombreProducto = useMemo(() => new Map(productos.map((p) => [p.id, p.nombre])), [productos]);
  const nombreCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias]);
  const nombreSucursal = useMemo(() => new Map(sucursales.map((s) => [s.id, s.nombre])), [sucursales]);

  const aplicaA = (c: Cupon) =>
    c.alcance === "productos"
      ? `Productos: ${c.productoIds.map((id) => nombreProducto.get(id) ?? "no disponible").join(", ")}`
      : c.alcance === "categorias"
        ? `Categorías: ${c.categoriaIds.map((id) => nombreCategoria.get(id) ?? "eliminada").join(", ")}`
        : "Toda la compra";
  const dondeVale = (c: Cupon) => (c.sucursalIds.length ? c.sucursalIds.map((id) => nombreSucursal.get(id) ?? "inactiva").join(", ") : "Todas las sucursales");

  const visibles = cupones.filter((c) =>
    coincide(busqueda, [c.codigo, c.descripcion, NOMBRES_ESTADO_CUPON[estadoCupon(c, hoy)], textoDescuentoCupon(c, formatoBs), aplicaA(c), dondeVale(c)]),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina icono={TicketPercent} titulo="Promociones y cupones" descripcion="Un cupón es un código que el cajero escribe al cobrar. Cada uno lleva su descuento y sus reglas.">
        <Button size="lg" className="rounded-full font-bold" onClick={() => setEditando("nuevo")}>
          <Plus className="size-5" /> Nuevo cupón
        </Button>
      </EncabezadoPagina>
      {children}

      {cupones.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
          <TicketPercent className="size-10" />
          <p>Crea tu primer cupón: por ejemplo, BIENVENIDO con 10 % en toda la compra.</p>
        </div>
      ) : (
        <>
          <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar cupones" placeholder="Código, descripción, estado o producto" />
          {visibles.length === 0 && <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />}
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibles.map((c) => {
              const estado = estadoCupon(c, hoy);
              return (
                <li key={c.id} className={cn("flex flex-col rounded-3xl border bg-card p-5 shadow-sm", estado !== "activo" && "opacity-75")}>
                  <div className="flex items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ficha-rosa text-ficha-rosa-foreground">
                      <TicketPercent className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-lg font-bold tracking-wide">
                        <Resaltar texto={c.codigo} consulta={busqueda} />
                      </p>
                      <p className="font-display text-lg font-extrabold text-primary">{textoDescuentoCupon(c, formatoBs)} de descuento</p>
                      {c.descripcion && (
                        <p className="truncate text-sm text-muted-foreground">
                          <Resaltar texto={c.descripcion} consulta={busqueda} />
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Editar ${c.codigo}`} onClick={() => setEditando(c)}>
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                  <ul className="mt-3 mb-4 space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <Tag className="size-4 shrink-0" />
                      <span className="truncate">
                        <Resaltar texto={aplicaA(c)} consulta={busqueda} />
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Store className="size-4 shrink-0" />
                      <span className="truncate">
                        <Resaltar texto={dondeVale(c)} consulta={busqueda} />
                      </span>
                    </li>
                    <li className="cifras flex items-center gap-2">
                      <CalendarRange className="size-4 shrink-0" />
                      {c.fechaInicio || c.fechaFin ? `${c.fechaInicio ? fechaCorta(c.fechaInicio) : "…"} – ${c.fechaFin ? fechaCorta(c.fechaFin) : "sin fin"}` : "Sin fecha de vencimiento"}
                    </li>
                    {Number(c.montoMinimo) > 0 && <li className="cifras">Compra mínima: {formatoBs(c.montoMinimo)}</li>}
                    <li className="flex items-center gap-2">
                      <Layers className="size-4 shrink-0" />
                      {c.acumulaPromociones || c.acumulaCombos
                        ? `Se acumula con ${[c.acumulaPromociones && "descuentos automáticos", c.acumulaCombos && "combos"].filter(Boolean).join(" y ")}`
                        : "No se acumula con otros descuentos"}
                    </li>
                  </ul>
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
                    <Badge className={CLASE_ESTADO[estado]}>
                      <Resaltar texto={NOMBRES_ESTADO_CUPON[estado]} consulta={busqueda} />
                    </Badge>
                    <span className="cifras text-sm font-semibold" title="Veces que se usó">
                      {c.usosActuales}
                      {c.usosMaximos !== null && ` de ${c.usosMaximos}`} uso{c.usosActuales === 1 && c.usosMaximos === null ? "" : "s"}
                    </span>
                    {c.usosActuales === 0 && (
                      <Button variant="ghost" size="icon" className="ml-auto text-muted-foreground hover:text-destructive" aria-label={`Eliminar ${c.codigo}`} disabled={eliminar.pendiente} onClick={() => eliminar.ejecutar({ id: c.id })}>
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                    <Switch
                      className={cn(c.usosActuales > 0 && "ml-auto")}
                      checked={c.activo}
                      disabled={cambiar.pendiente}
                      aria-label={`${c.activo ? "Desactivar" : "Activar"} ${c.codigo}`}
                      onCheckedChange={(activo) => cambiar.ejecutar({ id: c.id, activo })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editando && (
        <FormularioCupon
          key={editando === "nuevo" ? "nuevo" : editando.id}
          cupon={editando === "nuevo" ? null : editando}
          productos={productos}
          categorias={categorias}
          sucursales={sucursales}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function FormularioCupon({ cupon, productos, categorias, sucursales, onCerrar }: { cupon: Cupon | null; productos: ProductoLigero[]; categorias: Opcion[]; sucursales: Opcion[]; onCerrar: () => void }) {
  const [d, setD] = useState<DatosCupon>(() => ({
    codigo: cupon?.codigo ?? "",
    descripcion: cupon?.descripcion ?? "",
    tipo: cupon?.tipo ?? "porcentaje",
    valor: cupon ? String(Number(cupon.valor)) : "",
    montoMinimo: cupon && Number(cupon.montoMinimo) > 0 ? String(Number(cupon.montoMinimo)) : "",
    fechaInicio: cupon?.fechaInicio ?? "",
    fechaFin: cupon?.fechaFin ?? "",
    usosMaximos: cupon?.usosMaximos ?? "",
    alcance: cupon?.alcance ?? "todo",
    productoIds: cupon?.productoIds ?? [],
    categoriaIds: cupon?.categoriaIds ?? [],
    sucursalIds: cupon?.sucursalIds ?? [],
    acumulaPromociones: cupon?.acumulaPromociones ?? false,
    acumulaCombos: cupon?.acumulaCombos ?? false,
    activo: cupon?.activo ?? true,
  }));
  const [busqueda, setBusqueda] = useState("");
  const guardar = useAccion(guardarCupon, { mensajeExito: cupon ? "Cupón actualizado" : "Cupón creado", alExito: onCerrar });
  const poner = <K extends keyof DatosCupon>(k: K, v: DatosCupon[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    guardar.limpiarCampo(k);
  };
  const alternar = (k: "productoIds" | "categoriaIds" | "sucursalIds", id: number) => {
    const actuales = (d[k] ?? []) as number[];
    poner(k, actuales.includes(id) ? actuales.filter((x) => x !== id) : [...actuales, id]);
  };
  const elegidos = (d.productoIds ?? []) as number[];
  const resultados = busqueda.trim() ? productos.filter((p) => coincide(busqueda, [p.nombre, p.marca, p.sabor, p.presentacion, p.codigoBarras])).slice(0, 6) : [];
  const nombres = new Map(productos.map((p) => [p.id, p.nombre]));

  const chips = (k: "categoriaIds" | "sucursalIds", opciones: Opcion[], etiqueta: string) => (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={etiqueta}>
      {opciones.map((o) => {
        const elegido = ((d[k] ?? []) as number[]).includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={elegido}
            onClick={() => alternar(k, o.id)}
            className={cn("inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors", elegido ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent")}
          >
            {elegido && <Check className="size-3.5" />} {o.nombre}
          </button>
        );
      })}
    </div>
  );

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={cupon ? `Editar cupón ${cupon.codigo}` : "Nuevo cupón"}
      pendiente={guardar.pendiente}
      textoGuardar={cupon ? "Guardar" : "Crear cupón"}
      ancho="sm:max-w-2xl"
      onGuardar={() => guardar.ejecutar({ ...d, ...(cupon && { id: cupon.id }) })}
    >
      <Campo etiqueta="Código" error={guardar.campos.codigo} ayuda="Lo que el cajero escribe al cobrar. Puedes inventarlo o generarlo.">
        {(p) => (
          <div className="flex gap-2">
            <Input {...p} value={d.codigo} onChange={(e) => poner("codigo", e.target.value.toUpperCase().replace(/\s/g, ""))} maxLength={40} placeholder="BIENVENIDO" className="font-mono text-lg uppercase" autoFocus={!cupon} />
            <Button
              type="button"
              variant="outline"
              onClick={() => poner("codigo", generarCodigo((n) => crypto.getRandomValues(new Uint32Array(1))[0] % n))}
            >
              <Wand2 className="size-4" /> Generar
            </Button>
          </div>
        )}
      </Campo>
      <Campo etiqueta="Descripción" opcional error={guardar.campos.descripcion}>
        {(p) => <Input {...p} value={d.descripcion ?? ""} onChange={(e) => poner("descripcion", e.target.value)} maxLength={160} placeholder="Ej. Clientes nuevos" />}
      </Campo>

      <div className="grid gap-4 rounded-2xl bg-muted/60 p-4 sm:grid-cols-[auto_1fr_1fr]">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Tipo de descuento</p>
          <div role="radiogroup" aria-label="Tipo de descuento" className="inline-flex rounded-full border bg-background p-1">
            {(
              [
                ["porcentaje", "Porcentaje (%)"],
                ["monto", "Monto fijo (Bs)"],
              ] as const
            ).map(([v, t]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={d.tipo === v}
                onClick={() => poner("tipo", v)}
                className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", d.tipo === v ? "bg-nav-activo text-nav-activo-foreground" : "text-muted-foreground")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <Campo etiqueta={d.tipo === "porcentaje" ? "Porcentaje" : "Monto en Bs"} error={guardar.campos.valor} ayuda={d.tipo === "monto" ? "Se descuenta una sola vez sobre lo que cubre" : undefined}>
          {(p) => <Input {...p} inputMode="decimal" value={d.valor} onChange={(e) => poner("valor", e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))} placeholder="0" className="cifras bg-background text-lg font-bold" />}
        </Campo>
        <Campo etiqueta="Compra mínima (Bs)" opcional error={guardar.campos.montoMinimo}>
          {(p) => <Input {...p} inputMode="decimal" value={d.montoMinimo ?? ""} onChange={(e) => poner("montoMinimo", e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))} placeholder="Sin mínimo" className="cifras bg-background" />}
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Vale desde" opcional error={guardar.campos.fechaInicio}>
          {(p) => <Input {...p} type="date" value={d.fechaInicio ?? ""} onChange={(e) => poner("fechaInicio", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Vale hasta" opcional error={guardar.campos.fechaFin}>
          {(p) => <Input {...p} type="date" value={d.fechaFin ?? ""} onChange={(e) => poner("fechaFin", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Límite de usos" opcional error={guardar.campos.usosMaximos} ayuda={cupon ? `Usado ${cupon.usosActuales} ve${cupon.usosActuales === 1 ? "z" : "ces"}` : undefined}>
          {(p) => <Input {...p} inputMode="numeric" value={String(d.usosMaximos ?? "")} onChange={(e) => poner("usosMaximos", e.target.value.replace(/\D/g, "").slice(0, 7) as "")} placeholder="Sin límite" className="cifras" />}
        </Campo>
      </div>

      <section className={cn("space-y-3 rounded-2xl border p-4", (guardar.campos.productoIds || guardar.campos.categoriaIds) && "border-destructive")} aria-label="A qué aplica">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Aplica a</p>
          <div role="radiogroup" aria-label="A qué aplica" className="inline-flex flex-wrap rounded-2xl border bg-background p-1">
            {(
              [
                ["todo", "Toda la compra"],
                ["productos", "Productos específicos"],
                ["categorias", "Categorías"],
              ] as const
            ).map(([v, t]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={d.alcance === v}
                onClick={() => poner("alcance", v)}
                className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", d.alcance === v ? "bg-nav-activo text-nav-activo-foreground" : "text-muted-foreground")}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {d.alcance === "productos" && (
          <>
            <Buscador className="max-w-none" valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar productos para el cupón" placeholder="Buscar producto por nombre, marca o código" />
            {busqueda.trim() &&
              (resultados.length === 0 ? (
                <SinResultados className="p-5" consulta={busqueda} onLimpiar={() => setBusqueda("")} />
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2" aria-label="Resultados">
                  {resultados.map((p) => {
                    const elegido = elegidos.includes(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-pressed={elegido}
                          onClick={() => alternar("productoIds", p.id)}
                          className={cn("flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition-colors", elegido ? "border-primary bg-primary/8" : "hover:bg-accent")}
                        >
                          <Miniatura url={p.fotoUrl} />
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                            <Resaltar texto={p.nombre} consulta={busqueda} />
                          </span>
                          {elegido ? <Check className="size-5 shrink-0 text-primary" /> : <Plus className="size-5 shrink-0 text-muted-foreground" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ))}
            {elegidos.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Productos elegidos">
                {elegidos.map((id) => (
                  <li key={id}>
                    <button type="button" onClick={() => alternar("productoIds", id)} className="inline-flex items-center gap-1 rounded-full bg-nav-activo px-3 py-1.5 text-sm font-semibold text-nav-activo-foreground" title="Quitar">
                      {nombres.get(id) ?? "Producto no disponible"} <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {guardar.campos.productoIds && <p className="text-sm text-destructive">{guardar.campos.productoIds}</p>}
          </>
        )}
        {d.alcance === "categorias" && (
          <>
            {chips("categoriaIds", categorias, "Categorías")}
            {guardar.campos.categoriaIds && <p className="text-sm text-destructive">{guardar.campos.categoriaIds}</p>}
          </>
        )}
      </section>

      {sucursales.length > 1 && (
        <section className="space-y-2 rounded-2xl border p-4" aria-label="Sucursales">
          <p className="text-sm font-semibold">
            Sucursales <span className="font-normal text-muted-foreground">(sin elegir ninguna, vale en todas)</span>
          </p>
          {chips("sucursalIds", sucursales, "Sucursales donde vale")}
        </section>
      )}

      <div className="space-y-2">
        <label className="flex items-center justify-between gap-4 rounded-2xl border p-4">
          <span>
            <span className="block font-semibold">Se acumula con descuentos automáticos</span>
            <span className="block text-sm text-muted-foreground">Si está apagado, en cada producto queda el descuento mayor (cupón o automático), nunca los dos</span>
          </span>
          <Switch checked={d.acumulaPromociones} onCheckedChange={(v) => poner("acumulaPromociones", v)} aria-label="Se acumula con descuentos automáticos" />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-2xl border p-4">
          <span>
            <span className="block font-semibold">Se acumula con combos</span>
            <span className="block text-sm text-muted-foreground">Si está apagado, el cupón no descuenta sobre los productos que van dentro de un combo</span>
          </span>
          <Switch checked={d.acumulaCombos} onCheckedChange={(v) => poner("acumulaCombos", v)} aria-label="Se acumula con combos" />
        </label>
        <label className="flex items-center justify-between gap-4 rounded-2xl border p-4">
          <span className="font-semibold">Cupón activo</span>
          <Switch checked={d.activo} onCheckedChange={(v) => poner("activo", v)} aria-label="Cupón activo" />
        </label>
      </div>
    </DialogoFormulario>
  );
}
