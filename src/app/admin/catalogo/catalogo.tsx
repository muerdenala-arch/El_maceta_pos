"use client";

/* eslint-disable @next/next/no-img-element -- fotos propias (Blob o locales) ya comprimidas */
import { Barcode, Check, FileSpreadsheet, Package, PackagePlus, Pencil, Search, Tags, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { SubirImagen } from "@/components/formularios/subir-imagen";
import { useAccion } from "@/components/formularios/use-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { aCentavos } from "@/lib/dinero";
import { formatoBs } from "@/lib/formato";
import { COMPRESION_PRODUCTO } from "@/lib/imagen-cliente";
import { cn } from "@/lib/utils";
import { ImportarProductos } from "./importar-productos";
import type { DatosProducto } from "@/lib/validaciones/admin";
import { eliminarCategoria, guardarCategoria, guardarProducto } from "./acciones";

type Producto = {
  id: number;
  nombre: string;
  marca: string | null;
  categoriaId: number | null;
  sabor: string | null;
  presentacion: string | null;
  precioVenta: string;
  precioCosto: string;
  codigoBarras: string | null;
  fotoUrl: string | null;
  stockMinimo: number;
  activo: boolean;
};
type Categoria = { id: number; nombre: string; productos: number };

/** Margen de ganancia sobre el precio de venta, o null si los precios no son válidos. */
function margen(venta: string, costo: string): number | null {
  try {
    const v = aCentavos(venta.replace(",", "."));
    const c = aCentavos(costo.replace(",", "."));
    return v > 0n ? (Number(v - c) / Number(v)) * 100 : null;
  } catch {
    return null;
  }
}

export function Catalogo({ productos, categorias }: { productos: Producto[]; categorias: Categoria[] }) {
  const [editando, setEditando] = useState<Producto | "nuevo" | null>(null);
  const [verCategorias, setVerCategorias] = useState(false);
  const [importando, setImportando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState<number | "todas" | "sin">("todas");
  const [inactivos, setInactivos] = useState(false);

  const nombreCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.nombre])), [categorias]);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter(
      (p) =>
        (inactivos || p.activo) &&
        (categoria === "todas" || (categoria === "sin" ? p.categoriaId === null : p.categoriaId === categoria)) &&
        (!q ||
          [p.nombre, p.marca, p.sabor, p.presentacion, p.codigoBarras, p.categoriaId ? nombreCategoria.get(p.categoriaId) : ""]
            .some((t) => t?.toLowerCase().includes(q))),
    );
  }, [productos, busqueda, categoria, inactivos, nombreCategoria]);

  const cantidadInactivos = productos.filter((p) => !p.activo).length;

  return (
    <div className="mx-auto max-w-7xl">
      <EncabezadoPagina
        icono={Package}
        titulo="Catálogo"
        descripcion={`${productos.length - cantidadInactivos} producto${productos.length - cantidadInactivos === 1 ? "" : "s"} activo${productos.length - cantidadInactivos === 1 ? "" : "s"}`}
      >
        <Button variant="outline" size="lg" className="rounded-full" onClick={() => setImportando(true)}>
          <FileSpreadsheet className="size-5" />
          Importar Excel
        </Button>
        <Button variant="outline" size="lg" className="rounded-full" onClick={() => setVerCategorias(true)}>
          <Tags className="size-5" />
          Categorías
        </Button>
        <Button size="lg" className="rounded-full font-bold" onClick={() => setEditando("nuevo")}>
          <PackagePlus className="size-5" />
          Nuevo producto
        </Button>
      </EncabezadoPagina>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Buscar producto</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Nombre, marca, sabor o código de barras"
            className="h-11 rounded-full pl-10"
          />
        </label>
        {cantidadInactivos > 0 && (
          <label className="flex items-center gap-2 text-sm font-semibold">
            <Switch checked={inactivos} onCheckedChange={setInactivos} />
            Mostrar inactivos ({cantidadInactivos})
          </label>
        )}
      </div>

      <div className="sin-barra mt-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist" aria-label="Filtrar por categoría">
        {[
          { valor: "todas" as const, nombre: "Todas" },
          ...categorias.map((c) => ({ valor: c.id, nombre: c.nombre })),
          ...(productos.some((p) => p.categoriaId === null) ? [{ valor: "sin" as const, nombre: "Sin categoría" }] : []),
        ].map((c) => (
          <button
            key={c.valor}
            type="button"
            role="tab"
            aria-selected={categoria === c.valor}
            onClick={() => setCategoria(c.valor)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors",
              categoria === c.valor ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent",
            )}
          >
            {c.nombre}
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
          <Package className="size-10" />
          {productos.length === 0 ? (
            <>
              <p>Todavía no hay productos.</p>
              <Button onClick={() => setEditando("nuevo")}>
                <PackagePlus className="size-4" />
                Agregar el primero
              </Button>
            </>
          ) : (
            <p>No hay productos que coincidan.</p>
          )}
        </div>
      ) : (
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {visibles.map((p) => {
            const m = margen(p.precioVenta, p.precioCosto);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setEditando(p)}
                  className={cn(
                    "group flex h-full w-full flex-col overflow-hidden rounded-3xl border bg-card text-left shadow-sm transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    !p.activo && "opacity-55",
                  )}
                >
                  <div className="relative aspect-square bg-muted">
                    {p.fotoUrl ? (
                      <img src={p.fotoUrl} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                      <Package className="absolute inset-0 m-auto size-12 text-muted-foreground/50" />
                    )}
                    <span className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-background/85 opacity-0 shadow transition-opacity group-hover:opacity-100">
                      <Pencil className="size-4" />
                    </span>
                    {!p.activo && <Badge variant="destructive" className="absolute top-2 left-2">Inactivo</Badge>}
                  </div>
                  <div className="flex flex-1 flex-col p-3.5">
                    {p.categoriaId && (
                      <span className="mb-1 truncate text-[11px] font-bold tracking-wide text-primary uppercase">
                        {nombreCategoria.get(p.categoriaId)}
                      </span>
                    )}
                    <span className="line-clamp-2 leading-snug font-bold">{p.nombre}</span>
                    <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                      {[p.marca, p.sabor, p.presentacion].filter(Boolean).join(" · ") || " "}
                    </span>
                    <span className="mt-auto flex items-end justify-between gap-2 pt-3">
                      <span className="cifras font-display text-lg font-extrabold">{formatoBs(p.precioVenta)}</span>
                      {m !== null && (
                        <span
                          className={cn("cifras text-xs font-semibold", m < 0 ? "text-destructive" : "text-muted-foreground")}
                          title="Margen sobre el precio de venta"
                        >
                          {m.toFixed(0)}%
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {editando && (
        <FormularioProducto
          key={editando === "nuevo" ? "nuevo" : editando.id}
          producto={editando === "nuevo" ? null : editando}
          categorias={categorias}
          onCerrar={() => setEditando(null)}
        />
      )}
      <DialogoCategorias abierto={verCategorias} onAbierto={setVerCategorias} categorias={categorias} />
      <ImportarProductos abierto={importando} onCerrar={() => setImportando(false)} />
    </div>
  );
}

function FormularioProducto({
  producto,
  categorias,
  onCerrar,
}: {
  producto: Producto | null;
  categorias: Categoria[];
  onCerrar: () => void;
}) {
  const [d, setD] = useState<DatosProducto>(() => ({
    nombre: producto?.nombre ?? "",
    marca: producto?.marca ?? "",
    categoriaId: producto?.categoriaId ?? null,
    sabor: producto?.sabor ?? "",
    presentacion: producto?.presentacion ?? "",
    precioVenta: producto?.precioVenta ?? "",
    precioCosto: producto?.precioCosto ?? "",
    codigoBarras: producto?.codigoBarras ?? "",
    stockMinimo: producto?.stockMinimo ?? 0,
    fotoUrl: producto?.fotoUrl ?? null,
    activo: producto?.activo ?? true,
  }));
  const guardar = useAccion(guardarProducto, {
    mensajeExito: producto ? "Producto actualizado" : "Producto creado",
    alExito: onCerrar,
  });
  const poner = <K extends keyof DatosProducto>(campo: K, valor: DatosProducto[K]) => {
    setD((x) => ({ ...x, [campo]: valor }));
    guardar.limpiarCampo(campo);
  };
  const texto = (campo: "nombre" | "marca" | "sabor" | "presentacion" | "codigoBarras" | "precioVenta" | "precioCosto") => ({
    value: (d[campo] as string | null) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => poner(campo, e.target.value),
  });
  const m = margen(String(d.precioVenta), String(d.precioCosto));

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={producto ? "Editar producto" : "Nuevo producto"}
      pendiente={guardar.pendiente}
      onGuardar={() => guardar.ejecutar(producto ? { ...d, id: producto.id } : d)}
      ancho="sm:max-w-2xl"
    >
      <SubirImagen
        valor={d.fotoUrl}
        onCambiar={(url) => poner("fotoUrl", url)}
        carpeta="productos"
        compresion={COMPRESION_PRODUCTO}
        etiqueta="Foto"
      />

      <Campo etiqueta="Nombre" error={guardar.campos.nombre}>
        {(p) => <Input {...p} {...texto("nombre")} autoFocus={!producto} maxLength={160} placeholder="Ej. Whey Protein Gold Standard" />}
      </Campo>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Marca" opcional error={guardar.campos.marca}>
          {(p) => <Input {...p} {...texto("marca")} maxLength={80} placeholder="Ej. Optimum Nutrition" />}
        </Campo>
        <Campo etiqueta="Categoría" error={guardar.campos.categoriaId}>
          {(p) => (
            <Select
              value={d.categoriaId ? String(d.categoriaId) : "sin"}
              onValueChange={(v) => poner("categoriaId", v === "sin" ? null : Number(v))}
            >
              <SelectTrigger {...p} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sin">Sin categoría</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Campo>
        <Campo etiqueta="Sabor" opcional error={guardar.campos.sabor}>
          {(p) => <Input {...p} {...texto("sabor")} maxLength={80} placeholder="Ej. Chocolate" />}
        </Campo>
        <Campo etiqueta="Presentación" opcional error={guardar.campos.presentacion}>
          {(p) => <Input {...p} {...texto("presentacion")} maxLength={80} placeholder="Ej. 2 lb / 60 cápsulas" />}
        </Campo>
      </div>

      <div className="grid gap-4 rounded-2xl bg-muted/60 p-4 sm:grid-cols-3">
        <Campo etiqueta="Precio de venta (Bs)" error={guardar.campos.precioVenta}>
          {(p) => <Input {...p} {...texto("precioVenta")} inputMode="decimal" className="cifras bg-background text-lg font-bold" placeholder="0,00" />}
        </Campo>
        <Campo etiqueta="Precio de costo (Bs)" error={guardar.campos.precioCosto} ayuda="Solo lo ve el administrador">
          {(p) => <Input {...p} {...texto("precioCosto")} inputMode="decimal" className="cifras bg-background" placeholder="0,00" />}
        </Campo>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">Margen</p>
          <p className={cn("cifras font-display text-2xl font-extrabold", m !== null && m < 0 && "text-destructive")}>
            {m === null ? "—" : `${m.toFixed(1)}%`}
          </p>
          {m !== null && m < 0 && <p className="text-xs text-destructive">Vendes por debajo del costo</p>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Código de barras" opcional error={guardar.campos.codigoBarras} ayuda="Puedes escanearlo con el lector">
          {(p) => (
            <div className="relative">
              <Barcode className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                {...p}
                {...texto("codigoBarras")}
                className="cifras pl-9 font-mono"
                maxLength={64}
                // El lector envía Enter al final: que no guarde el formulario sin querer.
                onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
              />
            </div>
          )}
        </Campo>
        <Campo etiqueta="Stock mínimo" error={guardar.campos.stockMinimo} ayuda="Aviso de stock bajo por debajo de esta cantidad">
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="numeric"
              min={0}
              value={d.stockMinimo as number}
              onChange={(e) => poner("stockMinimo", e.target.value === "" ? 0 : Number(e.target.value))}
              className="cifras max-w-32"
            />
          )}
        </Campo>
      </div>

      <label className="flex items-center justify-between gap-4 rounded-2xl border p-4">
        <span>
          <span className="block font-semibold">Producto activo</span>
          <span className="block text-sm text-muted-foreground">Los inactivos no aparecen en el punto de venta</span>
        </span>
        <Switch checked={d.activo} onCheckedChange={(v) => poner("activo", v)} />
      </label>
    </DialogoFormulario>
  );
}

function DialogoCategorias({
  abierto,
  onAbierto,
  categorias,
}: {
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  categorias: Categoria[];
}) {
  const [nueva, setNueva] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const crear = useAccion(guardarCategoria, { mensajeExito: "Categoría creada", alExito: () => setNueva("") });
  const renombrar = useAccion(guardarCategoria, { mensajeExito: "Categoría renombrada", alExito: () => setEditandoId(null) });
  const eliminar = useAccion(eliminarCategoria, { mensajeExito: "Categoría eliminada" });

  return (
    <Dialog open={abierto} onOpenChange={onAbierto}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">Categorías</DialogTitle>
          <DialogDescription>Solo se pueden eliminar las categorías sin productos.</DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            crear.ejecutar({ nombre: nueva });
          }}
        >
          <Input
            value={nueva}
            onChange={(e) => {
              setNueva(e.target.value);
              crear.limpiarCampo("nombre");
            }}
            placeholder="Nueva categoría"
            aria-label="Nombre de la nueva categoría"
            aria-invalid={crear.campos.nombre ? true : undefined}
            maxLength={80}
          />
          <Button type="submit" disabled={crear.pendiente || !nueva.trim()}>
            Agregar
          </Button>
        </form>
        {crear.campos.nombre && <p className="-mt-2 text-sm text-destructive">{crear.campos.nombre}</p>}

        <ul className="divide-y rounded-2xl border">
          {categorias.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              {editandoId === c.id ? (
                <form
                  className="flex flex-1 items-center gap-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    renombrar.ejecutar({ id: c.id, nombre: nombreEditado });
                  }}
                >
                  <Input
                    value={nombreEditado}
                    onChange={(e) => setNombreEditado(e.target.value)}
                    autoFocus
                    aria-label={`Nuevo nombre para ${c.nombre}`}
                    maxLength={80}
                    className="h-9"
                  />
                  <Button type="submit" size="icon" variant="ghost" aria-label="Guardar nombre" disabled={renombrar.pendiente}>
                    <Check className="size-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Cancelar" onClick={() => setEditandoId(null)}>
                    <X className="size-4" />
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 truncate font-semibold">{c.nombre}</span>
                  <span className="cifras text-xs text-muted-foreground">
                    {c.productos} prod.
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Renombrar ${c.nombre}`}
                    onClick={() => {
                      setEditandoId(c.id);
                      setNombreEditado(c.nombre);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label={`Eliminar ${c.nombre}`}
                    title={c.productos > 0 ? "Tiene productos" : "Eliminar"}
                    disabled={c.productos > 0 || eliminar.pendiente}
                    onClick={() => eliminar.ejecutar({ id: c.id })}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
          {categorias.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Sin categorías.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
