"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { agregarGasto } from "@/app/admin/gastos/acciones";
import { Campo } from "@/components/formularios/campo";
import { DialogoFormulario } from "@/components/formularios/dialogo-formulario";
import { SubirImagen } from "@/components/formularios/subir-imagen";
import { useAccion } from "@/components/formularios/use-accion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { COMPRESION_PRODUCTO } from "@/lib/imagen-cliente";
import { CATEGORIAS_GASTO } from "@/lib/validaciones/caja";

/**
 * "Agregar gasto" del administrador y del encargado: un gasto de la sucursal (alquiler, luz, compras…) que cuenta
 * en los reportes pero no sale del efectivo de ninguna caja. Los gastos de caja se registran desde la caja.
 */
export function AgregarGasto({
  sucursales,
  sucursalPorDefecto,
}: {
  /** Administrador: todas las ubicaciones activas. Encargado: solo la suya (no se elige). */
  sucursales: { id: number; nombre: string }[];
  sucursalPorDefecto: number | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const inicial = sucursalPorDefecto ?? (sucursales.length === 1 ? sucursales[0].id : null);
  const [sucursalId, setSucursalId] = useState<number | null>(inicial);
  const [categoria, setCategoria] = useState("");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const guardar = useAccion(agregarGasto, {
    mensajeExito: "Gasto registrado",
    alExito: () => {
      setAbierto(false);
      setCategoria("");
      setMonto("");
      setDescripcion("");
      setFotoUrl(null);
    },
  });

  return (
    <>
      <Button size="lg" className="rounded-full font-bold" onClick={() => setAbierto(true)}>
        <Plus className="size-5" /> Agregar gasto
      </Button>
      <DialogoFormulario
        abierto={abierto}
        onAbierto={setAbierto}
        titulo="Agregar gasto"
        descripcion="Gasto de la sucursal que no sale de ninguna caja (no cambia el efectivo de los cajeros)."
        pendiente={guardar.pendiente}
        textoGuardar="Registrar gasto"
        onGuardar={() => guardar.ejecutar({ sucursalId: sucursalId as number, categoria: categoria as never, monto: monto.replace(",", "."), descripcion, fotoUrl })}
      >
        {sucursales.length > 1 && (
          <Campo etiqueta="Sucursal" error={guardar.campos.sucursalId}>
            {(p) => (
              <Select value={sucursalId ? String(sucursalId) : ""} onValueChange={(v) => setSucursalId(Number(v))}>
                <SelectTrigger {...p} className="w-full">
                  <SelectValue placeholder="Elige la sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {sucursales.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Campo>
        )}
        <Campo etiqueta="Categoría" error={guardar.campos.categoria}>
          {(p) => (
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger {...p} className="w-full">
                <SelectValue placeholder="Elige una categoría" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_GASTO.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Campo>
        <Campo etiqueta="Monto (Bs)" error={guardar.campos.monto}>
          {(p) => (
            <Input {...p} value={monto} onChange={(e) => setMonto(e.target.value.replace(/[^\d.,]/g, "").slice(0, 12))} inputMode="decimal" placeholder="0,00" className="cifras text-lg font-bold" />
          )}
        </Campo>
        <Campo etiqueta="Descripción" opcional error={guardar.campos.descripcion}>
          {(p) => <Textarea {...p} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} maxLength={300} placeholder="Ej. alquiler de octubre" />}
        </Campo>
        <Campo etiqueta="Foto del comprobante" opcional error={guardar.campos.fotoUrl}>
          {() => <SubirImagen valor={fotoUrl} onCambiar={setFotoUrl} carpeta="gastos" compresion={COMPRESION_PRODUCTO} etiqueta="Foto" />}
        </Campo>
      </DialogoFormulario>
    </>
  );
}
