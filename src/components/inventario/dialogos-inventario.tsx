"use client";

import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { useAccion } from "@/components/formularios/use-accion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ajustarStock, crearTransferencia, registrarIngreso } from "@/lib/inventario/acciones";
import { cn } from "@/lib/utils";
import { SelectorProducto, type ProductoLigero } from "./selector-producto";

export type UbicacionLigera = { id: number; nombre: string; tipo: "sucursal" | "bodega" };
type Stock = Record<string, number>;
const stockDe = (stock: Stock, productoId: number | null, ubicacionId: number | null) =>
  productoId && ubicacionId ? (stock[`${productoId}:${ubicacionId}`] ?? 0) : 0;

function SelectorUbicacion({
  ubicaciones,
  valor,
  onCambiar,
  id,
  excluir,
}: {
  ubicaciones: UbicacionLigera[];
  valor: number | null;
  onCambiar: (id: number) => void;
  id?: string;
  excluir?: number | null;
}) {
  return (
    <Select value={valor ? String(valor) : ""} onValueChange={(v) => onCambiar(Number(v))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Elegir…" />
      </SelectTrigger>
      <SelectContent>
        {ubicaciones.map((u) => (
          <SelectItem key={u.id} value={String(u.id)} disabled={u.id === excluir}>
            {u.nombre}
            {u.tipo === "bodega" && " (bodega)"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const soloEntero = (v: string) => v.replace(/\D/g, "").slice(0, 6);

// ---------------------------------------------------------------- Ingreso de mercadería

type LineaIngreso = { clave: number; productoId: number | null; cantidad: string; fechaVencimiento: string };
let siguienteClave = 1;
const lineaIngresoVacia = (): LineaIngreso => ({ clave: siguienteClave++, productoId: null, cantidad: "", fechaVencimiento: "" });

export function DialogoIngreso({
  productos,
  ubicaciones,
  onCerrar,
}: {
  productos: ProductoLigero[];
  ubicaciones: UbicacionLigera[];
  onCerrar: () => void;
}) {
  const bodega = ubicaciones.find((u) => u.tipo === "bodega");
  const [ubicacionId, setUbicacionId] = useState<number | null>(bodega?.id ?? null);
  const [proveedor, setProveedor] = useState("");
  const [documento, setDocumento] = useState("");
  const [lineas, setLineas] = useState<LineaIngreso[]>(() => [lineaIngresoVacia()]);
  const guardar = useAccion(registrarIngreso, { mensajeExito: "Ingreso registrado", alExito: onCerrar });

  const cambiarLinea = (clave: number, cambios: Partial<LineaIngreso>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const total = lineas.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Ingreso de mercadería"
      descripcion="Compra a proveedor. Registra la fecha de vencimiento de cada lote si la tiene."
      pendiente={guardar.pendiente}
      textoGuardar={`Registrar ${total} unidad${total === 1 ? "" : "es"}`}
      ancho="sm:max-w-3xl"
      onGuardar={() =>
        guardar.ejecutar({
          ubicacionId: ubicacionId ?? 0,
          proveedor,
          documento,
          lineas: lineas
            .filter((l) => l.productoId || l.cantidad)
            .map((l) => ({ productoId: l.productoId ?? 0, cantidad: l.cantidad, fechaVencimiento: l.fechaVencimiento })),
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo etiqueta="Destino" error={guardar.campos.ubicacionId}>
          {(p) => <SelectorUbicacion id={p.id} ubicaciones={ubicaciones} valor={ubicacionId} onCambiar={setUbicacionId} />}
        </Campo>
        <Campo etiqueta="Proveedor" opcional error={guardar.campos.proveedor}>
          {(p) => <Input {...p} value={proveedor} onChange={(e) => setProveedor(e.target.value)} maxLength={120} />}
        </Campo>
        <Campo etiqueta="N.º de factura / nota" opcional error={guardar.campos.documento}>
          {(p) => <Input {...p} value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={60} />}
        </Campo>
      </div>

      <div className="space-y-2">
        <div className="hidden grid-cols-[1fr_6rem_10rem_2.5rem] gap-2 px-1 text-xs font-bold text-muted-foreground uppercase sm:grid">
          <span>Producto</span>
          <span>Cantidad</span>
          <span>Vence</span>
        </div>
        {lineas.map((l, i) => (
          <div key={l.clave} className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl border p-2 sm:grid-cols-[1fr_6rem_10rem_2.5rem] sm:border-0 sm:p-0">
            <div className="col-span-2 sm:col-span-1">
              <SelectorProducto
                productos={productos}
                valor={l.productoId}
                onCambiar={(id) => cambiarLinea(l.clave, { productoId: id })}
                invalido={!!guardar.campos[`lineas.${i}.productoId`]}
              />
            </div>
            <Input
              aria-label="Cantidad"
              inputMode="numeric"
              placeholder="Cant."
              value={l.cantidad}
              onChange={(e) => cambiarLinea(l.clave, { cantidad: soloEntero(e.target.value) })}
              aria-invalid={guardar.campos[`lineas.${i}.cantidad`] ? true : undefined}
              className="cifras h-11"
            />
            <Input
              aria-label="Fecha de vencimiento"
              type="date"
              value={l.fechaVencimiento}
              onChange={(e) => cambiarLinea(l.clave, { fechaVencimiento: e.target.value })}
              className="h-11"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 text-muted-foreground hover:text-destructive"
              aria-label="Quitar fila"
              disabled={lineas.length === 1}
              onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
            >
              <Trash2 className="size-4" />
            </Button>
            {(guardar.campos[`lineas.${i}.productoId`] || guardar.campos[`lineas.${i}.cantidad`]) && (
              <p className="col-span-full text-sm text-destructive">
                {guardar.campos[`lineas.${i}.productoId`] ? "Elige un producto" : guardar.campos[`lineas.${i}.cantidad`]}
              </p>
            )}
          </div>
        ))}
        {guardar.campos.lineas && <p className="text-sm text-destructive">{guardar.campos.lineas}</p>}
        <Button type="button" variant="outline" size="sm" onClick={() => setLineas((ls) => [...ls, lineaIngresoVacia()])}>
          <Plus className="size-4" />
          Agregar producto
        </Button>
        <p className="text-xs text-muted-foreground">
          Si un producto llega con dos fechas de vencimiento distintas, agrégalo en dos filas.
        </p>
      </div>
    </DialogoFormulario>
  );
}

// ---------------------------------------------------------------- Ajuste de stock

const MOTIVOS_RAPIDOS = ["Conteo físico", "Producto dañado", "Producto vencido", "Muestra / regalo", "Error de registro"];

export function DialogoAjuste({
  productos,
  ubicaciones,
  stock,
  inicial,
  onCerrar,
}: {
  productos: ProductoLigero[];
  ubicaciones: UbicacionLigera[];
  stock: Stock;
  inicial?: { productoId: number; ubicacionId: number };
  onCerrar: () => void;
}) {
  const [productoId, setProductoId] = useState<number | null>(inicial?.productoId ?? null);
  const [ubicacionId, setUbicacionId] = useState<number | null>(inicial?.ubicacionId ?? null);
  const [cantidadNueva, setCantidadNueva] = useState("");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [motivo, setMotivo] = useState("");
  const guardar = useAccion(ajustarStock, { mensajeExito: "Stock ajustado", alExito: onCerrar });

  const actual = stockDe(stock, productoId, ubicacionId);
  const diferencia = cantidadNueva === "" ? null : Number(cantidadNueva) - actual;

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Ajustar stock"
      descripcion="Corrige la cantidad según el conteo físico. Queda registrado con tu nombre y el motivo."
      pendiente={guardar.pendiente}
      textoGuardar="Guardar ajuste"
      onGuardar={() =>
        guardar.ejecutar({
          productoId: productoId ?? 0,
          ubicacionId: ubicacionId ?? 0,
          cantidadNueva,
          fechaVencimiento: diferencia && diferencia > 0 ? fechaVencimiento : "",
          motivo,
        })
      }
    >
      <Campo etiqueta="Producto" error={guardar.campos.productoId && "Elige un producto"}>
        {(p) => <SelectorProducto id={p.id} productos={productos} valor={productoId} onCambiar={setProductoId} invalido={!!guardar.campos.productoId} />}
      </Campo>
      <Campo etiqueta="Ubicación" error={guardar.campos.ubicacionId && "Elige la ubicación"}>
        {(p) => <SelectorUbicacion id={p.id} ubicaciones={ubicaciones} valor={ubicacionId} onCambiar={setUbicacionId} />}
      </Campo>

      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3 rounded-2xl bg-muted/60 p-4">
        <div>
          <p className="text-sm font-semibold">Stock actual</p>
          <p className={cn("cifras font-display text-3xl font-extrabold", actual < 0 && "text-destructive")}>{actual}</p>
        </div>
        <ArrowRight className="mb-2.5 size-5 text-muted-foreground" />
        <Campo etiqueta="Cantidad contada" error={guardar.campos.cantidadNueva}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              value={cantidadNueva}
              onChange={(e) => setCantidadNueva(soloEntero(e.target.value))}
              className="cifras h-12 bg-background text-2xl font-bold"
            />
          )}
        </Campo>
        {diferencia !== null && diferencia !== 0 && (
          <p className={cn("col-span-3 text-sm font-semibold", diferencia > 0 ? "text-exito" : "text-destructive")}>
            {Math.abs(diferencia) === 1
              ? diferencia > 0 ? "Se suma 1 unidad" : "Se descuenta 1 unidad"
              : diferencia > 0 ? `Se suman ${diferencia} unidades` : `Se descuentan ${-diferencia} unidades`}
          </p>
        )}
      </div>

      {diferencia !== null && diferencia > 0 && (
        <Campo etiqueta="Vencimiento de las unidades que se suman" opcional error={guardar.campos.fechaVencimiento}>
          {(p) => <Input {...p} type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className="max-w-48" />}
        </Campo>
      )}

      <Campo etiqueta="Motivo" error={guardar.campos.motivo}>
        {(p) => (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS_RAPIDOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                    motivo === m ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <Textarea {...p} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} placeholder="Describe qué pasó" />
          </div>
        )}
      </Campo>
    </DialogoFormulario>
  );
}

// ---------------------------------------------------------------- Transferencia

type LineaTransferencia = { clave: number; productoId: number | null; cantidad: string };

export type PrecargaTransferencia = {
  destinoId: number;
  productoId: number;
  cantidad: number;
  alertaId: number;
};

export function DialogoTransferencia({
  productos,
  ubicaciones,
  stock,
  precarga,
  onCerrar,
}: {
  productos: ProductoLigero[];
  ubicaciones: UbicacionLigera[];
  stock: Stock;
  precarga?: PrecargaTransferencia;
  onCerrar: () => void;
}) {
  const bodega = ubicaciones.find((u) => u.tipo === "bodega");
  const [origenId, setOrigenId] = useState<number | null>(bodega?.id ?? null);
  const [destinoId, setDestinoId] = useState<number | null>(precarga?.destinoId ?? null);
  const [nota, setNota] = useState("");
  const [lineas, setLineas] = useState<LineaTransferencia[]>(() => [
    { clave: siguienteClave++, productoId: precarga?.productoId ?? null, cantidad: precarga ? String(precarga.cantidad) : "" },
  ]);
  const guardar = useAccion(crearTransferencia, { mensajeExito: "Transferencia enviada", alExito: onCerrar });

  const cambiarLinea = (clave: number, cambios: Partial<LineaTransferencia>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)));
  const elegidos = lineas.map((l) => l.productoId).filter((x): x is number => x !== null);

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Nueva transferencia"
      descripcion="La mercadería sale del origen ahora y entra al destino cuando se marque como recibida."
      pendiente={guardar.pendiente}
      textoGuardar="Enviar"
      ancho="sm:max-w-2xl"
      onGuardar={() =>
        guardar.ejecutar({
          origenId: origenId ?? 0,
          destinoId: destinoId ?? 0,
          nota,
          alertaId: precarga?.alertaId ?? null,
          lineas: lineas
            .filter((l) => l.productoId || l.cantidad)
            .map((l) => ({ productoId: l.productoId ?? 0, cantidad: l.cantidad })),
        })
      }
    >
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
        <Campo etiqueta="Desde" error={guardar.campos.origenId}>
          {(p) => <SelectorUbicacion id={p.id} ubicaciones={ubicaciones} valor={origenId} onCambiar={setOrigenId} excluir={destinoId} />}
        </Campo>
        <ArrowRight className="mx-auto mb-2.5 hidden size-5 text-muted-foreground sm:block" />
        <Campo etiqueta="Hacia" error={guardar.campos.destinoId}>
          {(p) => <SelectorUbicacion id={p.id} ubicaciones={ubicaciones} valor={destinoId} onCambiar={setDestinoId} excluir={origenId} />}
        </Campo>
      </div>

      <div className="space-y-2">
        {lineas.map((l, i) => {
          const disponible = stockDe(stock, l.productoId, origenId);
          const excede = l.productoId !== null && Number(l.cantidad) > disponible;
          return (
            <div key={l.clave} className="rounded-2xl border p-2">
              <div className="grid grid-cols-[1fr_6rem_2.5rem] gap-2">
                <SelectorProducto
                  productos={productos}
                  valor={l.productoId}
                  onCambiar={(id) => cambiarLinea(l.clave, { productoId: id })}
                  deshabilitados={elegidos}
                  invalido={!!guardar.campos[`lineas.${i}.productoId`]}
                  extra={(p) => <span className="cifras text-xs text-muted-foreground">{stockDe(stock, p.id, origenId)} disp.</span>}
                />
                <Input
                  aria-label="Cantidad"
                  inputMode="numeric"
                  placeholder="Cant."
                  value={l.cantidad}
                  onChange={(e) => cambiarLinea(l.clave, { cantidad: soloEntero(e.target.value) })}
                  aria-invalid={excede || guardar.campos[`lineas.${i}.cantidad`] ? true : undefined}
                  className="cifras h-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 text-muted-foreground hover:text-destructive"
                  aria-label="Quitar fila"
                  disabled={lineas.length === 1}
                  onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              {l.productoId && (
                <p className={cn("mt-1.5 px-1 text-xs", excede ? "font-semibold text-destructive" : "text-muted-foreground")}>
                  Disponible en el origen: {disponible}
                  {excede && " — no alcanza"}
                </p>
              )}
            </div>
          );
        })}
        {guardar.campos.lineas && <p className="text-sm text-destructive">{guardar.campos.lineas}</p>}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLineas((ls) => [...ls, { clave: siguienteClave++, productoId: null, cantidad: "" }])}
        >
          <Plus className="size-4" />
          Agregar producto
        </Button>
      </div>

      <Campo etiqueta="Nota" opcional error={guardar.campos.nota}>
        {(p) => <Input {...p} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} placeholder="Ej. enviado con Juan" />}
      </Campo>
    </DialogoFormulario>
  );
}
