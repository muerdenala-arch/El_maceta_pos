"use client";

import { MapPin, Pencil, Phone, Plus, Printer, Store, UserRound, Users, Warehouse } from "lucide-react";
import { useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { useAccion } from "@/components/formularios/use-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { DatosSucursal } from "@/lib/validaciones/admin";
import { cambiarEstadoSucursal, guardarSucursal } from "./acciones";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";

type Sucursal = {
  id: number;
  nombre: string;
  tipo: "sucursal" | "bodega";
  direccion: string | null;
  telefono: string | null;
  encargado: string | null;
  tamanoImpresion: "58mm" | "80mm" | "carta";
  activo: boolean;
  cajeros: number;
};

const NOMBRES_IMPRESION = { "58mm": "Térmica 58 mm", "80mm": "Térmica 80 mm", carta: "Hoja carta" } as const;

const VACIO: DatosSucursal = { nombre: "", direccion: "", telefono: "", encargado: "", tamanoImpresion: "80mm" };

export function ListaSucursales({ sucursales }: { sucursales: Sucursal[] }) {
  const [editando, setEditando] = useState<Sucursal | "nueva" | null>(null);
  const cambiarEstado = useAccion(cambiarEstadoSucursal);
  const [busqueda, setBusqueda] = useState("");
  const visibles = sucursales.filter((s) => coincide(busqueda, [s.nombre, s.direccion, s.telefono, s.encargado, s.tipo === "bodega" ? "Bodega central" : "Sucursal"]));

  return (
    <div className="mx-auto max-w-6xl">
      <EncabezadoPagina icono={Store} titulo="Sucursales" descripcion="Puntos de venta y bodega central">
        <Button size="lg" className="rounded-full font-bold" onClick={() => setEditando("nueva")}>
          <Plus className="size-5" />
          Nueva sucursal
        </Button>
      </EncabezadoPagina>

      <Buscador className="mt-6" valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar sucursales" placeholder="Nombre, dirección, teléfono o encargado" />
      {visibles.length === 0 && <SinResultados className="mt-5" consulta={busqueda} onLimpiar={() => setBusqueda("")} />}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map((s) => (
          <article
            key={s.id}
            className={cn("flex flex-col rounded-3xl border bg-card p-5 shadow-sm", !s.activo && "opacity-60")}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-xl",
                  s.tipo === "bodega" ? "bg-ficha-verde text-ficha-verde-foreground" : "bg-ficha-naranja text-ficha-naranja-foreground",
                )}
              >
                {s.tipo === "bodega" ? <Warehouse className="size-5" /> : <Store className="size-5" />}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold">
                  <Resaltar texto={s.nombre} consulta={busqueda} />
                </h2>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {s.tipo === "bodega" && <Badge variant="secondary">Bodega central</Badge>}
                  {!s.activo && <Badge variant="destructive">Inactiva</Badge>}
                </div>
              </div>
              <Button variant="ghost" size="icon" aria-label={`Editar ${s.nombre}`} onClick={() => setEditando(s)}>
                <Pencil className="size-4" />
              </Button>
            </div>

            <ul className="mt-4 space-y-2 text-sm">
              <Dato icono={MapPin} valor={s.direccion} vacio="Sin dirección" consulta={busqueda} />
              <Dato icono={Phone} valor={s.telefono} vacio="Sin teléfono" consulta={busqueda} />
              <Dato icono={UserRound} valor={s.encargado} vacio="Sin encargado" consulta={busqueda} />
              {s.tipo === "sucursal" && (
                <>
                  <Dato icono={Printer} valor={NOMBRES_IMPRESION[s.tamanoImpresion]} />
                  <Dato icono={Users} valor={`${s.cajeros} cajero${s.cajeros === 1 ? "" : "s"} activo${s.cajeros === 1 ? "" : "s"}`} />
                </>
              )}
            </ul>

            {s.tipo === "sucursal" && (
              <label className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-sm font-semibold">
                {s.activo ? "Activa" : "Inactiva"}
                <Switch
                  checked={s.activo}
                  disabled={cambiarEstado.pendiente}
                  onCheckedChange={(activo) => cambiarEstado.ejecutar({ id: s.id, activo })}
                  aria-label={`${s.activo ? "Desactivar" : "Activar"} ${s.nombre}`}
                />
              </label>
            )}
          </article>
        ))}
      </div>

      {editando && (
        <FormularioSucursal
          key={editando === "nueva" ? "nueva" : editando.id}
          sucursal={editando === "nueva" ? null : editando}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function Dato({ icono: Icono, valor, vacio, consulta = "" }: { icono: typeof MapPin; valor: string | null; vacio?: string; consulta?: string }) {
  return (
    <li className="flex items-center gap-2.5">
      <Icono className="size-4 shrink-0 text-muted-foreground" />
      <span className={cn("truncate", !valor && "text-muted-foreground")}>{valor ? <Resaltar texto={valor} consulta={consulta} /> : vacio}</span>
    </li>
  );
}

function FormularioSucursal({ sucursal, onCerrar }: { sucursal: Sucursal | null; onCerrar: () => void }) {
  const [datos, setDatos] = useState<DatosSucursal>(
    sucursal
      ? {
          nombre: sucursal.nombre,
          direccion: sucursal.direccion ?? "",
          telefono: sucursal.telefono ?? "",
          encargado: sucursal.encargado ?? "",
          tamanoImpresion: sucursal.tamanoImpresion,
        }
      : VACIO,
  );
  const guardar = useAccion(guardarSucursal, {
    mensajeExito: sucursal ? "Sucursal actualizada" : "Sucursal creada",
    alExito: onCerrar,
  });
  const cambiar = (campo: keyof DatosSucursal) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDatos((d) => ({ ...d, [campo]: e.target.value }));
    guardar.limpiarCampo(campo);
  };

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={sucursal ? `Editar ${sucursal.tipo === "bodega" ? "bodega" : "sucursal"}` : "Nueva sucursal"}
      pendiente={guardar.pendiente}
      onGuardar={() => guardar.ejecutar(sucursal ? { ...datos, id: sucursal.id } : datos)}
    >
      <Campo etiqueta="Nombre" error={guardar.campos.nombre}>
        {(p) => <Input {...p} value={datos.nombre} onChange={cambiar("nombre")} autoFocus maxLength={120} />}
      </Campo>
      <Campo etiqueta="Dirección" opcional error={guardar.campos.direccion}>
        {(p) => <Input {...p} value={datos.direccion ?? ""} onChange={cambiar("direccion")} maxLength={200} />}
      </Campo>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo etiqueta="Teléfono" opcional error={guardar.campos.telefono}>
          {(p) => <Input {...p} type="tel" inputMode="tel" value={datos.telefono ?? ""} onChange={cambiar("telefono")} />}
        </Campo>
        <Campo etiqueta="Encargado" opcional error={guardar.campos.encargado}>
          {(p) => <Input {...p} value={datos.encargado ?? ""} onChange={cambiar("encargado")} maxLength={120} />}
        </Campo>
      </div>
      {sucursal?.tipo !== "bodega" && (
        <Campo etiqueta="Tamaño de impresión del comprobante" error={guardar.campos.tamanoImpresion}>
          {(p) => (
            <Select
              value={datos.tamanoImpresion}
              onValueChange={(v) => setDatos((d) => ({ ...d, tamanoImpresion: v as DatosSucursal["tamanoImpresion"] }))}
            >
              <SelectTrigger {...p} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(NOMBRES_IMPRESION).map(([valor, nombre]) => (
                  <SelectItem key={valor} value={valor}>
                    {nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Campo>
      )}
    </DialogoFormulario>
  );
}
