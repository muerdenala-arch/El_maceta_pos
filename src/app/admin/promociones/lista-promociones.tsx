"use client";

import { CalendarRange, Pencil, Percent, Plus, Shapes, Store, Tag, TicketPercent } from "lucide-react";
import { useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import { SelectorProducto, type ProductoLigero } from "@/components/inventario/selector-producto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { describirBeneficio } from "@/lib/promociones/motor";
import { cn } from "@/lib/utils";
import type { DatosPromocion } from "@/lib/validaciones/promociones";
import { guardarPromocion } from "./acciones";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";

type Promo = {
  id: number;
  nombre: string;
  tipo: "porcentaje" | "monto_fijo" | "combo";
  valor: string;
  comboLleva: number | null;
  comboPaga: number | null;
  alcance: "todo" | "producto" | "categoria";
  productoId: number | null;
  producto: string | null;
  categoriaId: number | null;
  categoria: string | null;
  sucursalId: number | null;
  sucursal: string | null;
  desde: string;
  hasta: string;
  requiereCupon: boolean;
  activo: boolean;
};
type Opcion = { id: number; nombre: string };
/** Estado del formulario (los campos numéricos con tipo explícito; el servidor los valida igual). */
type FormPromo = Omit<DatosPromocion, "comboLleva" | "comboPaga" | "productoId" | "categoriaId" | "sucursalId"> & {
  comboLleva: number | null;
  comboPaga: number | null;
  productoId: number | null;
  categoriaId: number | null;
  sucursalId: number | null;
};

const fechaCorta = (dia: string) =>
  new Date(`${dia}T12:00:00Z`).toLocaleDateString("es-BO", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

function estado(p: Promo, hoy: string) {
  if (!p.activo) return { texto: "Inactiva", clase: "bg-muted text-muted-foreground" };
  if (hoy < p.desde) return { texto: "Programada", clase: "bg-ficha-neutra text-ficha-neutra-foreground" };
  if (hoy > p.hasta) return { texto: "Vencida", clase: "bg-destructive/15 text-destructive" };
  return { texto: "Vigente", clase: "bg-exito text-exito-foreground" };
}

const alcanceTexto = (p: Promo) =>
  p.alcance === "producto" ? `Producto: ${p.producto}` : p.alcance === "categoria" ? `Categoría: ${p.categoria}` : "Todo el catálogo";

export function ListaPromociones({
  hoy,
  promociones,
  productos,
  categorias,
  sucursales,
  children,
}: {
  hoy: string;
  promociones: Promo[];
  productos: ProductoLigero[];
  categorias: Opcion[];
  sucursales: Opcion[];
  /** Pestañas (Descuentos automáticos / Cupones). */
  children?: React.ReactNode;
}) {
  const [editando, setEditando] = useState<Promo | "nueva" | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const visibles = promociones.filter((p) =>
    coincide(busqueda, [
      p.nombre,
      describirBeneficio(p),
      alcanceTexto(p),
      p.sucursal ?? "Todas las sucursales",
      estado(p, hoy).texto,
      p.requiereCupon ? "Solo con cupón (antigua)" : "Automática",
    ]),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina
        icono={TicketPercent}
        titulo="Promociones y cupones"
        descripcion="Los descuentos automáticos se aplican solos en el punto de venta: a cada producto, el mejor (nunca se acumulan entre sí)."
      >
        <Button size="lg" className="rounded-full font-bold" onClick={() => setEditando("nueva")}>
          <Plus className="size-5" /> Nuevo descuento automático
        </Button>
      </EncabezadoPagina>
      {children}

      {promociones.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
          <TicketPercent className="size-10" />
          <p>Crea tu primer descuento automático: un porcentaje, un monto por unidad o un 2x1 (por ejemplo, 10 % en toda una categoría este fin de semana).</p>
        </div>
      ) : (
        <>
        <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar promociones" placeholder="Nombre, código de cupón, producto o estado" />
        {visibles.length === 0 && <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />}
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibles.map((p) => {

            const e = estado(p, hoy);
            return (
              <li key={p.id} className={cn("flex flex-col rounded-3xl border bg-card p-5 shadow-sm", e.texto !== "Vigente" && "opacity-75")}>
                <div className="flex items-start gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-ficha-rosa text-ficha-rosa-foreground">
                    {p.tipo === "combo" ? <Shapes className="size-5" /> : p.tipo === "porcentaje" ? <Percent className="size-5" /> : <Tag className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug">
                      <Resaltar texto={p.nombre} consulta={busqueda} />
                    </p>
                    <p className="font-display text-lg font-extrabold text-primary">
                      <Resaltar texto={describirBeneficio(p)} consulta={busqueda} />
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label={`Editar ${p.nombre}`} onClick={() => setEditando(p)}>
                    <Pencil className="size-4" />
                  </Button>
                </div>
                <ul className="mt-3 mb-4 space-y-1.5 text-sm text-muted-foreground">
                  <li className="flex items-center gap-2"><Tag className="size-4 shrink-0" /> <span className="truncate"><Resaltar texto={alcanceTexto(p)} consulta={busqueda} /></span></li>
                  <li className="flex items-center gap-2"><Store className="size-4 shrink-0" /> <Resaltar texto={p.sucursal ?? "Todas las sucursales"} consulta={busqueda} /></li>
                  <li className="flex items-center gap-2"><CalendarRange className="size-4 shrink-0" /> {fechaCorta(p.desde)} – {fechaCorta(p.hasta)}</li>
                </ul>
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
                  <Badge className={e.clase}>{e.texto}</Badge>
                  <Badge variant="outline">{p.requiereCupon ? "Solo con cupón (antigua): no se aplica sola" : "Automática"}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}

      {editando && (
        <FormularioPromocion
          key={editando === "nueva" ? "nueva" : editando.id}
          promo={editando === "nueva" ? null : editando}
          hoy={hoy}
          productos={productos}
          categorias={categorias}
          sucursales={sucursales}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

const PRESETS_COMBO = [
  { lleva: 2, paga: 1 },
  { lleva: 3, paga: 2 },
  { lleva: 4, paga: 3 },
];

function FormularioPromocion({
  promo,
  hoy,
  productos,
  categorias,
  sucursales,
  onCerrar,
}: {
  promo: Promo | null;
  hoy: string;
  productos: ProductoLigero[];
  categorias: Opcion[];
  sucursales: Opcion[];
  onCerrar: () => void;
}) {
  const [d, setD] = useState<FormPromo>(() => ({
    nombre: promo?.nombre ?? "",
    tipo: promo?.tipo ?? "porcentaje",
    valor: promo && promo.tipo !== "combo" ? String(Number(promo.valor)) : "",
    comboLleva: promo?.comboLleva ?? 2,
    comboPaga: promo?.comboPaga ?? 1,
    alcance: promo?.alcance ?? "todo",
    productoId: promo?.productoId ?? null,
    categoriaId: promo?.categoriaId ?? null,
    sucursalId: promo?.sucursalId ?? null,
    desde: promo?.desde ?? hoy,
    hasta: promo?.hasta ?? hoy,
    // Los cupones ahora son independientes (pestaña Cupones): un descuento automático nunca pide cupón.
    requiereCupon: false,
    activo: promo?.activo ?? true,
  }));
  const guardar = useAccion(guardarPromocion, { mensajeExito: promo ? "Promoción actualizada" : "Promoción creada", alExito: onCerrar });
  const poner = <K extends keyof FormPromo>(k: K, v: FormPromo[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    guardar.limpiarCampo(k);
  };

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={promo ? "Editar promoción" : "Nueva promoción"}
      pendiente={guardar.pendiente}
      onGuardar={() => guardar.ejecutar(promo ? { ...d, id: promo.id } : d)}
      ancho="sm:max-w-2xl"
    >
      <Campo etiqueta="Nombre" error={guardar.campos.nombre} ayuda="Aparece en el carrito y en el comprobante">
        {(p) => <Input {...p} value={d.nombre} onChange={(e) => poner("nombre", e.target.value)} maxLength={120} placeholder="Ej. 2x1 en Whey Chocolate" autoFocus={!promo} />}
      </Campo>

      <Campo etiqueta="Tipo de beneficio">
        {(p) => (
          <div {...p} role="radiogroup" className="grid grid-cols-3 gap-2">
            {([
              { v: "porcentaje", t: "Porcentaje", i: Percent },
              { v: "monto_fijo", t: "Bs por unidad", i: Tag },
              { v: "combo", t: "Combo", i: Shapes },
            ] as const).map(({ v, t, i: Icono }) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={d.tipo === v}
                onClick={() => poner("tipo", v)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border-2 py-3 text-sm font-bold transition-colors",
                  d.tipo === v ? "border-primary bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent",
                )}
              >
                <Icono className="size-5" /> {t}
              </button>
            ))}
          </div>
        )}
      </Campo>

      {d.tipo === "combo" ? (
        <div className="space-y-2 rounded-2xl bg-muted/60 p-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS_COMBO.map((c) => (
              <button
                key={c.lleva}
                type="button"
                onClick={() => setD((x) => ({ ...x, comboLleva: c.lleva, comboPaga: c.paga }))}
                className={cn(
                  "rounded-full border px-4 py-1.5 font-display font-extrabold",
                  d.comboLleva === c.lleva && d.comboPaga === c.paga ? "border-transparent bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                )}
              >
                {c.lleva}x{c.paga}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Lleva" error={guardar.campos.comboLleva}>
              {(p) => <Input {...p} inputMode="numeric" value={d.comboLleva ?? ""} onChange={(e) => poner("comboLleva", Number(e.target.value.replace(/\D/g, "")) || null)} className="cifras bg-background" />}
            </Campo>
            <Campo etiqueta="Paga" error={guardar.campos.comboPaga}>
              {(p) => <Input {...p} inputMode="numeric" value={d.comboPaga ?? ""} onChange={(e) => poner("comboPaga", Number(e.target.value.replace(/\D/g, "")) || null)} className="cifras bg-background" />}
            </Campo>
          </div>
          <p className="text-xs text-muted-foreground">Si mezclan productos distintos (combo por categoría), sale gratis el más barato.</p>
        </div>
      ) : (
        <Campo etiqueta={d.tipo === "porcentaje" ? "Porcentaje de descuento" : "Descuento por unidad (Bs)"} error={guardar.campos.valor}>
          {(p) => (
            <div className="flex max-w-48 items-center rounded-xl border focus-within:ring-3 focus-within:ring-ring/50">
              {d.tipo === "monto_fijo" && <span className="pl-3 font-bold text-muted-foreground">Bs</span>}
              <Input
                {...p}
                value={d.valor}
                onChange={(e) => poner("valor", e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
                inputMode="decimal"
                className="cifras border-0 bg-transparent text-lg font-bold shadow-none focus-visible:ring-0 dark:bg-transparent"
              />
              {d.tipo === "porcentaje" && <span className="pr-3 font-bold text-muted-foreground">%</span>}
            </div>
          )}
        </Campo>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Aplica a">
          {(p) => (
            <Select value={d.alcance} onValueChange={(v) => poner("alcance", v as FormPromo["alcance"])}>
              <SelectTrigger {...p} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todo">Todo el catálogo</SelectItem>
                <SelectItem value="producto">Un producto</SelectItem>
                <SelectItem value="categoria">Una categoría</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Campo>
        <Campo etiqueta="Sucursal" error={guardar.campos.sucursalId}>
          {(p) => (
            <Select value={d.sucursalId ? String(d.sucursalId) : "todas"} onValueChange={(v) => poner("sucursalId", v === "todas" ? null : Number(v))}>
              <SelectTrigger {...p} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas las sucursales</SelectItem>
                {sucursales.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Campo>
      </div>

      {d.alcance === "producto" && (
        <Campo etiqueta="Producto" error={guardar.campos.productoId}>
          {(p) => <SelectorProducto id={p.id} productos={productos} valor={d.productoId ?? null} onCambiar={(id) => poner("productoId", id)} invalido={!!guardar.campos.productoId} />}
        </Campo>
      )}
      {d.alcance === "categoria" && (
        <Campo etiqueta="Categoría" error={guardar.campos.categoriaId}>
          {(p) => (
            <Select value={d.categoriaId ? String(d.categoriaId) : ""} onValueChange={(v) => poner("categoriaId", Number(v))}>
              <SelectTrigger {...p} className="w-full"><SelectValue placeholder="Elige la categoría" /></SelectTrigger>
              <SelectContent>
                {categorias.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Campo>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Desde" error={guardar.campos.desde}>
          {(p) => <Input {...p} type="date" value={d.desde} onChange={(e) => poner("desde", e.target.value)} />}
        </Campo>
        <Campo etiqueta="Hasta (inclusive)" error={guardar.campos.hasta}>
          {(p) => <Input {...p} type="date" value={d.hasta} min={d.desde} onChange={(e) => poner("hasta", e.target.value)} />}
        </Campo>
      </div>

      <div className="space-y-2">
        <label className="flex items-center justify-between gap-4 rounded-2xl border p-4">
          <span className="font-semibold">Activa</span>
          <Switch checked={d.activo} onCheckedChange={(v) => poner("activo", v)} />
        </label>
      </div>
    </DialogoFormulario>
  );
}
