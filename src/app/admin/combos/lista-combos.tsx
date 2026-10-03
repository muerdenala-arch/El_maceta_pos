"use client";

/* eslint-disable @next/next/no-img-element -- fotos propias */
import { AlertTriangle, CalendarRange, Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { ListaSeleccion } from "@/components/busqueda/lista-seleccion";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { SubirImagen } from "@/components/formularios/subir-imagen";
import { useAccion } from "@/components/formularios/use-accion";
import { Miniatura, detalleProducto } from "@/components/inventario/selector-producto";
import { Marquesina } from "@/components/texto/marquesina";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { coincide } from "@/lib/busqueda";
import { costoCombo, estadoCombo, precioCombo, precioItem, type TipoDescuentoCombo } from "@/lib/combos/calculo";
import type { ComboAdmin } from "@/lib/combos/consultas";
import { aCentavos, deCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { COMPRESION_PRODUCTO } from "@/lib/imagen-cliente";
import { nombreEnvase, nombreUnidad, textoCantidadVendida } from "@/lib/inventario/fraccion";
import { cn } from "@/lib/utils";
import { cambiarEstadoCombo, guardarCombo } from "./acciones";

type Producto = {
  id: number;
  nombre: string;
  marca: string | null;
  sabor: string | null;
  presentacion: string | null;
  codigoBarras: string | null;
  fotoUrl: string | null;
  precioVenta: string;
  precioCosto: string;
  categoria?: string | null;
  precioUnidad: string | null;
  fraccionado: boolean;
  unidadFraccion: string | null;
  unidadesPorEnvase: number | null;
};
type ItemFormulario = { productoId: number; cantidad: string; fraccion: boolean };

const ESTADOS = {
  activo: { texto: "Activo", clase: "bg-exito text-exito-foreground" },
  inactivo: { texto: "Inactivo", clase: "bg-muted text-muted-foreground" },
  programado: { texto: "Programado", clase: "bg-ficha-neutra text-ficha-neutra-foreground" },
  vencido: { texto: "Vencido", clase: "bg-destructive/15 text-destructive" },
} as const;

const fechaCorta = (dia: string) => dia.split("-").reverse().join("/");
const esFraccionable = (p: Producto) => p.fraccionado && (p.unidadesPorEnvase ?? 0) > 1;
const textoItem = (i: { cantidad: number; fraccion: boolean }, p: Producto | undefined) =>
  `${i.fraccion && p ? textoCantidadVendida(i.cantidad, p.unidadFraccion ?? "capsula") : i.cantidad} ${p?.nombre ?? "producto no disponible"}`;

export function ListaCombos({ hoy, combos, productos }: { hoy: string; combos: ComboAdmin[]; productos: Producto[] }) {
  const [editando, setEditando] = useState<ComboAdmin | "nuevo" | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const cambiar = useAccion(cambiarEstadoCombo);
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);

  const visibles = combos.filter((c) => coincide(busqueda, [c.nombre, c.descripcion, ESTADOS[estadoCombo(c, hoy)].texto, ...c.items.map((i) => porId.get(i.productoId)?.nombre)]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina icono={Gift} titulo="Combos" descripcion="Varios productos juntos con descuento. Aparecen en su propia sección del punto de venta.">
        <Button size="lg" className="rounded-full font-bold" onClick={() => setEditando("nuevo")}>
          <Plus className="size-5" /> Nuevo combo
        </Button>
      </EncabezadoPagina>

      {combos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
          <Gift className="size-10" />
          <p>Crea tu primer combo: por ejemplo, proteína + creatina con 10 % de descuento.</p>
        </div>
      ) : (
        <>
          <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar combos" placeholder="Nombre, producto o estado" />
          {visibles.length === 0 && <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />}
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibles.map((c) => {
              const estado = ESTADOS[estadoCombo(c, hoy)];
              const faltan = c.items.some((i) => !porId.has(i.productoId));
              const precio = precioCombo(
                c.items.flatMap((i) => (porId.has(i.productoId) ? [{ precio: precioItem(porId.get(i.productoId)!, i.fraccion), cantidad: i.cantidad }] : [])),
                c.tipoDescuento,
                c.valorDescuento,
              );
              return (
                <li key={c.id} data-desplazar className={cn("flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm", estado.texto !== "Activo" && "opacity-75")}>
                  <div className="flex gap-3 p-4">
                    <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-ficha-rosa text-ficha-rosa-foreground">
                      {c.fotoUrl ? <img src={c.fotoUrl} alt="" loading="lazy" className="size-full object-cover" /> : <Gift className="size-8" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Marquesina titulo={c.nombre} className="font-display text-lg font-extrabold">
                        <Resaltar texto={c.nombre} consulta={busqueda} />
                      </Marquesina>
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="cifras font-display text-xl font-extrabold text-primary">{formatoBs(precio.final)}</span>
                        {Number(precio.descuento) > 0 && <span className="cifras text-sm text-muted-foreground line-through">{formatoBs(precio.normal)}</span>}
                      </p>
                      {Number(precio.descuento) > 0 && (
                        <p className="cifras text-xs font-bold text-exito">
                          Ahorra {formatoBs(precio.descuento)} ({precio.ahorroPorcentaje.toLocaleString("es-BO")} %)
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Editar ${c.nombre}`} onClick={() => setEditando(c)}>
                      <Pencil className="size-4" />
                    </Button>
                  </div>
                  <ul className="space-y-0.5 px-4 text-sm text-muted-foreground">
                    {c.items.map((i) => (
                      <li key={`${i.productoId}:${i.fraccion}`} className="truncate">
                        · <Resaltar texto={textoItem(i, porId.get(i.productoId))} consulta={busqueda} />
                      </li>
                    ))}
                  </ul>
                  {faltan && (
                    <p className="mx-4 mt-2 flex items-center gap-1.5 text-xs font-semibold text-destructive">
                      <AlertTriangle className="size-4" /> Tiene un producto inactivo: no aparece en el punto de venta
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2 border-t px-4 py-3">
                    <Badge className={estado.clase}>{estado.texto}</Badge>
                    {(c.fechaInicio || c.fechaFin) && (
                      <span className="cifras inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarRange className="size-3.5" />
                        {c.fechaInicio ? fechaCorta(c.fechaInicio) : "…"} – {c.fechaFin ? fechaCorta(c.fechaFin) : "sin fin"}
                      </span>
                    )}
                    <Switch
                      className="ml-auto"
                      checked={c.activo}
                      disabled={cambiar.pendiente}
                      aria-label={`${c.activo ? "Desactivar" : "Activar"} ${c.nombre}`}
                      onCheckedChange={(activo) => cambiar.ejecutar({ id: c.id, activo })}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {editando && <FormularioCombo key={editando === "nuevo" ? "nuevo" : editando.id} combo={editando === "nuevo" ? null : editando} productos={productos} onCerrar={() => setEditando(null)} />}
    </div>
  );
}

function FormularioCombo({ combo, productos, onCerrar }: { combo: ComboAdmin | null; productos: Producto[]; onCerrar: () => void }) {
  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const [d, setD] = useState({
    nombre: combo?.nombre ?? "",
    descripcion: combo?.descripcion ?? "",
    fotoUrl: combo?.fotoUrl ?? null,
    tipoDescuento: (combo?.tipoDescuento ?? "porcentaje") as TipoDescuentoCombo,
    valorDescuento: combo && Number(combo.valorDescuento) > 0 ? String(Number(combo.valorDescuento)) : "",
    fechaInicio: combo?.fechaInicio ?? "",
    fechaFin: combo?.fechaFin ?? "",
    activo: combo?.activo ?? true,
  });
  // Solo los productos que siguen activos (los demás se avisan en la lista).
  const [items, setItems] = useState<ItemFormulario[]>(() => (combo?.items ?? []).filter((i) => porId.has(i.productoId)).map((i) => ({ ...i, cantidad: String(i.cantidad) })));
  const guardar = useAccion(guardarCombo, { mensajeExito: combo ? "Combo actualizado" : "Combo creado", alExito: onCerrar });
  const poner = <K extends keyof typeof d>(k: K, v: (typeof d)[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    guardar.limpiarCampo(k);
  };

  const elegidos = items.map((i) => i.productoId);
  const opciones = useMemo(
    () => productos.map((p) => ({ id: p.id, nombre: p.nombre, detalle: p.categoria ?? formatoBs(p.precioVenta), buscarPor: [p.marca, p.sabor, p.presentacion, p.codigoBarras] })),
    [productos],
  );
  const alternar = (p: Producto) => {
    setItems((is) => (is.some((i) => i.productoId === p.id) ? is.filter((i) => i.productoId !== p.id) : [...is, { productoId: p.id, cantidad: "1", fraccion: false }]));
    guardar.limpiarCampo("items");
  };
  const cambiarItem = (indice: number, cambio: Partial<ItemFormulario>) => setItems((is) => is.map((i, k) => (k === indice ? { ...i, ...cambio } : i)));

  // Cálculo en vivo (el mismo que usará el punto de venta y el servidor).
  const validos = items.flatMap((i) => {
    const p = porId.get(i.productoId);
    const cantidad = Number(i.cantidad);
    return p && Number.isInteger(cantidad) && cantidad > 0 ? [{ ...i, cantidad, producto: p }] : [];
  });
  const valor = d.valorDescuento.replace(",", ".");
  const precio = precioCombo(
    validos.map((i) => ({ precio: precioItem(i.producto, i.fraccion), cantidad: i.cantidad })),
    d.tipoDescuento,
    /^\d+(\.\d{1,2})?$/.test(valor) ? valor : "0",
  );
  const costo = costoCombo(validos.map((i) => ({ ...i, precioCosto: i.producto.precioCosto, unidadesPorEnvase: i.producto.unidadesPorEnvase })));
  const bajoCosto = validos.length > 0 && aCentavos(precio.final) < costo;

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={combo ? "Editar combo" : "Nuevo combo"}
      pendiente={guardar.pendiente}
      textoGuardar={combo ? "Guardar" : "Crear combo"}
      ancho="sm:max-w-3xl"
      onGuardar={() => guardar.ejecutar({ ...d, valorDescuento: valor, items: items.map((i) => ({ ...i, cantidad: i.cantidad })), ...(combo && { id: combo.id }) })}
    >
      <SubirImagen valor={d.fotoUrl} onCambiar={(url) => poner("fotoUrl", url)} carpeta="productos" compresion={COMPRESION_PRODUCTO} etiqueta="Foto (opcional)" />

      <Campo etiqueta="Nombre" error={guardar.campos.nombre}>
        {(p) => <Input {...p} value={d.nombre} onChange={(e) => poner("nombre", e.target.value)} maxLength={120} placeholder="Ej. Combo Volumen" autoFocus={!combo} />}
      </Campo>
      <Campo etiqueta="Descripción" opcional error={guardar.campos.descripcion}>
        {(p) => <Textarea {...p} value={d.descripcion} onChange={(e) => poner("descripcion", e.target.value)} rows={2} maxLength={1000} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Vigente desde" opcional error={guardar.campos.fechaInicio}>
          {(p) => <Input {...p} type="date" value={d.fechaInicio} onChange={(e) => poner("fechaInicio", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Vigente hasta" opcional error={guardar.campos.fechaFin} ayuda="Sin fechas, el combo vale mientras esté activo">
          {(p) => <Input {...p} type="date" value={d.fechaFin} onChange={(e) => poner("fechaFin", e.target.value)} />}
        </Campo>
      </div>

      <section className={cn("space-y-3 rounded-2xl border p-4", guardar.campos.items && "border-destructive")} aria-label="Productos del combo">
        <h3 className="font-semibold">Productos del combo</h3>
        <ListaSeleccion etiqueta="Agregar productos" opciones={opciones} elegidos={elegidos} onAlternar={(id) => porId.get(id) && alternar(porId.get(id)!)} invalida={!!guardar.campos.items} />

        {items.length === 0 ? (
          <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">Toca en la lista los productos que forman el combo; aquí pones cuántos de cada uno.</p>
        ) : (
          <ul className="divide-y rounded-2xl border" aria-label="Productos elegidos">
            {items.map((i, indice) => {
              const p = porId.get(i.productoId);
              if (!p) return null;
              const cantidad = Number(i.cantidad) || 0;
              return (
                <li key={`${i.productoId}:${indice}`} className="flex flex-wrap items-center gap-2 p-2.5">
                  <Miniatura url={p.fotoUrl} />
                  <span className="min-w-0 flex-1 basis-40">
                    <span className="block truncate text-sm font-semibold">{p.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground">{detalleProducto(p) || formatoBs(precioItem(p, i.fraccion))}</span>
                  </span>
                  <Input
                    aria-label={`Cantidad de ${p.nombre}`}
                    inputMode="numeric"
                    value={i.cantidad}
                    onChange={(e) => cambiarItem(indice, { cantidad: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                    className="cifras h-10 w-16 text-center font-bold"
                  />
                  {esFraccionable(p) ? (
                    <Select value={i.fraccion ? "suelta" : "envase"} onValueChange={(v) => cambiarItem(indice, { fraccion: v === "suelta" })}>
                      <SelectTrigger className="h-10! w-32" aria-label={`Unidad de ${p.nombre}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="envase">{nombreEnvase(p, 2)}</SelectItem>
                        <SelectItem value="suelta">{nombreUnidad(p, 2)}</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                  <span className="cifras w-24 text-right text-sm font-bold">{formatoBs(deCentavos(aCentavos(precioItem(p, i.fraccion)) * BigInt(cantidad)))}</span>
                  <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Quitar ${p.nombre}`} onClick={() => setItems((is) => is.filter((_, k) => k !== indice))}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {guardar.campos.items && <p className="text-sm text-destructive">{guardar.campos.items}</p>}
      </section>

      <section className="space-y-3 rounded-2xl bg-muted/60 p-4" aria-label="Descuento y precio">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">Descuento</p>
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
                  aria-checked={d.tipoDescuento === v}
                  onClick={() => poner("tipoDescuento", v)}
                  className={cn("rounded-full px-3 py-1.5 text-sm font-semibold transition-colors", d.tipoDescuento === v ? "bg-nav-activo text-nav-activo-foreground" : "text-muted-foreground")}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <Campo etiqueta={d.tipoDescuento === "porcentaje" ? "Porcentaje" : "Monto en Bs"} error={guardar.campos.valorDescuento}>
            {(p) => (
              <Input
                {...p}
                inputMode="decimal"
                value={d.valorDescuento}
                onChange={(e) => poner("valorDescuento", e.target.value.replace(/[^\d.,]/g, "").slice(0, 9))}
                placeholder="0"
                className="cifras h-11 w-32 bg-background text-lg font-bold"
              />
            )}
          </Campo>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4" aria-live="polite">
          <div>
            <dt className="text-muted-foreground">Precio normal</dt>
            <dd className="cifras font-display text-lg font-bold">{formatoBs(precio.normal)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Descuento</dt>
            <dd className="cifras font-display text-lg font-bold text-exito">−{formatoBs(precio.descuento)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Precio final del combo</dt>
            <dd className="cifras font-display text-2xl font-extrabold text-primary">{formatoBs(precio.final)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">El cliente ahorra</dt>
            <dd className="cifras font-display text-lg font-bold">
              {formatoBs(precio.descuento)} <span className="text-sm font-semibold text-muted-foreground">({precio.ahorroPorcentaje.toLocaleString("es-BO")} %)</span>
            </dd>
          </div>
        </dl>
        {bajoCosto && (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 text-sm font-semibold text-destructive" role="alert">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            El precio final ({formatoBs(precio.final)}) es menor que el costo de los productos ({formatoBs(deCentavos(costo))}): venderías a pérdida.
          </p>
        )}
      </section>

      <label className="flex items-center justify-between gap-4 rounded-2xl border p-4">
        <span>
          <span className="block font-semibold">Combo activo</span>
          <span className="block text-sm text-muted-foreground">Los inactivos no aparecen en el punto de venta</span>
        </span>
        <Switch checked={d.activo} onCheckedChange={(v) => poner("activo", v)} aria-label="Combo activo" />
      </label>
    </DialogoFormulario>
  );
}
