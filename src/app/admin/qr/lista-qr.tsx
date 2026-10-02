"use client";

/* eslint-disable @next/next/no-img-element -- imágenes de QR propias */
import { Pencil, Plus, QrCode, Store } from "lucide-react";
import { useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { SubirImagen } from "@/components/formularios/subir-imagen";
import { useAccion } from "@/components/formularios/use-accion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { guardarQr } from "./acciones";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import { coincide } from "@/lib/busqueda";

type Qr = { id: number; nombre: string; imagenUrl: string; sucursalId: number | null; sucursal: string | null; activo: boolean };
type Opcion = { id: number; nombre: string };

// Calidad máxima y buena resolución: el QR debe escanearse bien desde la pantalla del cajero.
const COMPRESION_QR = { ladoMaximo: 1000, calidad: 1 };

export function ListaQr({
  qrs,
  sucursales,
  sucursalFija = null,
}: {
  qrs: Qr[];
  sucursales: Opcion[];
  /** Encargado: crea y edita solo los QR de esta sucursal; los "para todas" los ve pero no los cambia. */
  sucursalFija?: number | null;
}) {
  const editable = (q: Qr) => sucursalFija === null || q.sucursalId === sucursalFija;
  const [editando, setEditando] = useState<Qr | "nuevo" | null>(null);
  const cambiar = useAccion(guardarQr);
  const [busqueda, setBusqueda] = useState("");
  const visibles = qrs.filter((q) => coincide(busqueda, [q.nombre, q.sucursal ?? "Todas las sucursales", q.activo ? "Activo" : "Inactivo"]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <EncabezadoPagina icono={QrCode} titulo="QR de cobro" descripcion="El cajero muestra el QR de su sucursal al cobrar. Uno “para todas” sirve en cualquier sucursal.">
        <Button size="lg" className="rounded-full font-bold" onClick={() => setEditando("nuevo")}>
          <Plus className="size-5" /> Nuevo QR
        </Button>
      </EncabezadoPagina>

      {qrs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed p-12 text-center text-muted-foreground">
          <QrCode className="size-10" />
          <p>Sube la imagen del QR de tu banco para cobrar por transferencia.</p>
        </div>
      ) : (
        <>
        <Buscador valor={busqueda} onCambiar={setBusqueda} etiqueta="Buscar QR" placeholder="Nombre o sucursal" />
        {visibles.length === 0 && <SinResultados consulta={busqueda} onLimpiar={() => setBusqueda("")} />}
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibles.map((q) => (
            <li key={q.id} className={cn("flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm", !q.activo && "opacity-60")}>
              <div className="bg-white p-6">
                <img src={q.imagenUrl} alt={`QR ${q.nombre}`} className="mx-auto aspect-square w-full max-w-56 object-contain" />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start gap-2">
                  <p className="flex-1 font-bold">
                    <Resaltar texto={q.nombre} consulta={busqueda} />
                  </p>
                  {editable(q) && (
                    <Button variant="ghost" size="icon" aria-label={`Editar ${q.nombre}`} onClick={() => setEditando(q)}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                </div>
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Store className="size-4" /> <Resaltar texto={q.sucursal ?? "Todas las sucursales"} consulta={busqueda} />
                </p>
                <label className="mt-auto flex items-center justify-between border-t pt-3 text-sm font-semibold">
                  {q.activo ? <Badge className="bg-exito text-exito-foreground">Activo</Badge> : <Badge variant="secondary">Inactivo</Badge>}
                  <Switch
                    checked={q.activo}
                    disabled={cambiar.pendiente || !editable(q)}
                    aria-label={`${q.activo ? "Desactivar" : "Activar"} ${q.nombre}`}
                    onCheckedChange={(activo) =>
                      cambiar.ejecutar({ id: q.id, nombre: q.nombre, imagenUrl: q.imagenUrl, sucursalId: q.sucursalId, activo })
                    }
                  />
                </label>
              </div>
            </li>
          ))}
        </ul>
        </>
      )}

      {editando && (
        <FormularioQr
          key={editando === "nuevo" ? "nuevo" : editando.id}
          qr={editando === "nuevo" ? null : editando}
          sucursales={sucursales}
          sucursalFija={sucursalFija}
          onCerrar={() => setEditando(null)}
        />
      )}
    </div>
  );
}

function FormularioQr({ qr, sucursales, sucursalFija, onCerrar }: { qr: Qr | null; sucursales: Opcion[]; sucursalFija: number | null; onCerrar: () => void }) {
  const [nombre, setNombre] = useState(qr?.nombre ?? "");
  const [imagenUrl, setImagenUrl] = useState<string | null>(qr?.imagenUrl ?? null);
  const [sucursalId, setSucursalId] = useState<number | null>(qr?.sucursalId ?? sucursalFija);
  const [activo, setActivo] = useState(qr?.activo ?? true);
  const guardar = useAccion(guardarQr, { mensajeExito: qr ? "QR actualizado" : "QR agregado", alExito: onCerrar });

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={qr ? "Editar QR" : "Nuevo QR de cobro"}
      pendiente={guardar.pendiente}
      onGuardar={() => guardar.ejecutar({ ...(qr ? { id: qr.id } : {}), nombre, imagenUrl, sucursalId, activo })}
    >
      <Campo etiqueta="Imagen del QR" error={guardar.campos.imagenUrl} ayuda="Captura o descarga el QR desde la app de tu banco.">
        {() => <SubirImagen valor={imagenUrl} onCambiar={setImagenUrl} carpeta="qr" compresion={COMPRESION_QR} etiqueta="QR" />}
      </Campo>
      <Campo etiqueta="Nombre" error={guardar.campos.nombre}>
        {(p) => <Input {...p} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} placeholder="Ej. Banco Unión — cuenta de la tienda" />}
      </Campo>
      <Campo etiqueta="Se muestra en" error={guardar.campos.sucursalId}>
        {(p) => (
          <Select value={sucursalId ? String(sucursalId) : "todas"} onValueChange={(v) => setSucursalId(v === "todas" ? null : Number(v))}>
            <SelectTrigger {...p} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sucursalFija === null && <SelectItem value="todas">Todas las sucursales</SelectItem>}
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Campo>
      <label className="flex items-center justify-between rounded-2xl border p-4 font-semibold">
        Activo
        <Switch checked={activo} onCheckedChange={setActivo} />
      </label>
    </DialogoFormulario>
  );
}
