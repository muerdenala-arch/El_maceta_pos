"use client";

import { KeyRound, LockOpen, Pencil, Search, Store, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
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
import {
  cambiarEstadoUsuario,
  crearUsuario,
  desbloquearUsuario,
  editarUsuario,
  restablecerPin,
} from "./acciones";

type Persona = {
  id: number;
  nombre: string;
  usuario: string;
  rol: "admin" | "cajero";
  sucursalId: number | null;
  sucursal: string | null;
  activo: boolean;
  bloqueadoHasta: string | null;
};
type OpcionSucursal = { id: number; nombre: string };

type Dialogo = { tipo: "nuevo" } | { tipo: "editar"; persona: Persona } | { tipo: "pin"; persona: Persona };

const horaCorta = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function ListaPersonal({
  personas,
  sucursales,
  yo,
}: {
  personas: Persona[];
  sucursales: OpcionSucursal[];
  yo: number;
}) {
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const cambiarEstado = useAccion(cambiarEstadoUsuario);
  const desbloquear = useAccion(desbloquearUsuario, { mensajeExito: "Usuario desbloqueado" });

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return personas;
    return personas.filter((p) =>
      [p.nombre, p.usuario, p.sucursal ?? ""].some((t) => t.toLowerCase().includes(q)),
    );
  }, [personas, busqueda]);

  return (
    <div className="mx-auto max-w-6xl">
      <EncabezadoPagina icono={Users} titulo="Personal" descripcion="Administradores y cajeros, sucursal asignada y PIN">
        <Button size="lg" className="rounded-full font-bold" onClick={() => setDialogo({ tipo: "nuevo" })}>
          <UserPlus className="size-5" />
          Nuevo usuario
        </Button>
      </EncabezadoPagina>

      <label className="relative mt-6 block max-w-sm">
        <span className="sr-only">Buscar</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por nombre, usuario o sucursal"
          className="h-11 rounded-full pl-10"
        />
      </label>

      <ul className="mt-5 space-y-3">
        {visibles.map((p) => (
          <li
            key={p.id}
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl border bg-card p-4 shadow-sm sm:px-5",
              !p.activo && "opacity-60",
            )}
          >
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-full font-display text-lg font-bold",
                p.rol === "admin" ? "bg-ficha-rosa-foreground text-white" : "bg-ficha-naranja text-ficha-naranja-foreground",
              )}
            >
              {p.nombre.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="flex flex-wrap items-center gap-2 font-bold">
                <span className="truncate">{p.nombre}</span>
                {p.id === yo && <Badge variant="outline">Tú</Badge>}
              </p>
              <p className="truncate text-sm text-muted-foreground">@{p.usuario}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant={p.rol === "admin" ? "default" : "secondary"}>
                {p.rol === "admin" ? "Administrador" : "Cajero"}
              </Badge>
              {p.rol === "cajero" && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Store className="size-4" />
                  {p.sucursal ?? "Sin sucursal"}
                </span>
              )}
              {p.bloqueadoHasta && (
                <Badge variant="destructive">Bloqueado hasta {horaCorta(p.bloqueadoHasta)}</Badge>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1">
              {p.bloqueadoHasta && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={desbloquear.pendiente}
                  onClick={() => desbloquear.ejecutar({ id: p.id })}
                >
                  <LockOpen className="size-4" />
                  Desbloquear
                </Button>
              )}
              <Button variant="ghost" size="icon" aria-label={`Cambiar PIN de ${p.nombre}`} title="Cambiar PIN" onClick={() => setDialogo({ tipo: "pin", persona: p })}>
                <KeyRound className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={`Editar ${p.nombre}`} title="Editar" onClick={() => setDialogo({ tipo: "editar", persona: p })}>
                <Pencil className="size-4" />
              </Button>
              <Switch
                className="ml-2"
                checked={p.activo}
                disabled={cambiarEstado.pendiente || p.id === yo}
                onCheckedChange={(activo) => cambiarEstado.ejecutar({ id: p.id, activo })}
                aria-label={`${p.activo ? "Desactivar" : "Activar"} a ${p.nombre}`}
                title={p.id === yo ? "No puedes desactivarte a ti mismo" : p.activo ? "Activo" : "Inactivo"}
              />
            </div>
          </li>
        ))}
        {visibles.length === 0 && (
          <li className="rounded-3xl border border-dashed p-10 text-center text-muted-foreground">Sin resultados.</li>
        )}
      </ul>

      {dialogo?.tipo === "nuevo" && <FormularioUsuario sucursales={sucursales} onCerrar={() => setDialogo(null)} />}
      {dialogo?.tipo === "editar" && (
        <FormularioUsuario
          persona={dialogo.persona}
          esYo={dialogo.persona.id === yo}
          sucursales={sucursales}
          onCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === "pin" && <FormularioPin persona={dialogo.persona} onCerrar={() => setDialogo(null)} />}
    </div>
  );
}

function CampoPin({
  valor,
  onCambiar,
  error,
  etiqueta = "PIN",
}: {
  valor: string;
  onCambiar: (v: string) => void;
  error?: string;
  etiqueta?: string;
}) {
  return (
    <Campo etiqueta={etiqueta} error={error} ayuda="De 4 a 6 dígitos. Entrégaselo en persona; no se puede volver a ver.">
      {(p) => (
        <Input
          {...p}
          value={valor}
          onChange={(e) => onCambiar(e.target.value.replace(/\D/g, "").slice(0, 6))}
          inputMode="numeric"
          autoComplete="new-password"
          className="cifras max-w-40 text-lg tracking-[0.4em]"
          placeholder="••••"
        />
      )}
    </Campo>
  );
}

function FormularioUsuario({
  persona,
  esYo,
  sucursales,
  onCerrar,
}: {
  persona?: Persona;
  esYo?: boolean;
  sucursales: OpcionSucursal[];
  onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(persona?.nombre ?? "");
  const [usuario, setUsuario] = useState("");
  const [rol, setRol] = useState<"admin" | "cajero">(persona?.rol ?? "cajero");
  const [sucursalId, setSucursalId] = useState<number | null>(
    persona?.sucursalId ?? (sucursales.length === 1 ? sucursales[0].id : null),
  );
  const [pin, setPin] = useState("");

  const crear = useAccion(crearUsuario, { mensajeExito: "Usuario creado", alExito: onCerrar });
  const editar = useAccion(editarUsuario, { mensajeExito: "Cambios guardados", alExito: onCerrar });
  const accion = persona ? editar : crear;
  // Si la sucursal del cajero quedó inactiva no aparece en la lista: se muestra igual para no perderla.
  const opciones =
    persona?.sucursalId && !sucursales.some((s) => s.id === persona.sucursalId)
      ? [...sucursales, { id: persona.sucursalId, nombre: `${persona.sucursal} (inactiva)` }]
      : sucursales;

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo={persona ? `Editar a ${persona.nombre}` : "Nuevo usuario"}
      descripcion={persona ? `@${persona.usuario}` : "El cajero ingresa con su usuario y PIN."}
      pendiente={accion.pendiente}
      textoGuardar={persona ? "Guardar" : "Crear usuario"}
      onGuardar={() =>
        persona
          ? editar.ejecutar({ id: persona.id, nombre, rol, sucursalId })
          : crear.ejecutar({ nombre, usuario, rol, sucursalId, pin })
      }
    >
      <Campo etiqueta="Nombre completo" error={accion.campos.nombre}>
        {(p) => <Input {...p} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus maxLength={120} />}
      </Campo>
      {!persona && (
        <Campo etiqueta="Usuario" error={crear.campos.usuario} ayuda="Con este nombre inicia sesión, ej. maria.lopez">
          {(p) => (
            <Input
              {...p}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value.toLowerCase().replace(/\s/g, ""))}
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              maxLength={50}
            />
          )}
        </Campo>
      )}
      <Campo etiqueta="Rol" error={accion.campos.rol} ayuda={esYo ? "No puedes cambiar tu propio rol." : undefined}>
        {(p) => (
          <div {...p} role="radiogroup" className="grid grid-cols-2 gap-2">
            {(["cajero", "admin"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={rol === r}
                disabled={esYo}
                onClick={() => setRol(r)}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition-colors disabled:opacity-60",
                  rol === r ? "border-primary bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent",
                )}
              >
                <span className="block font-bold">{r === "admin" ? "Administrador" : "Cajero"}</span>
                <span className="block text-xs opacity-80">
                  {r === "admin" ? "Acceso total, todas las sucursales" : "Vende en una sucursal"}
                </span>
              </button>
            ))}
          </div>
        )}
      </Campo>
      {rol === "cajero" && (
        <Campo etiqueta="Sucursal" error={accion.campos.sucursalId}>
          {(p) => (
            <Select value={sucursalId ? String(sucursalId) : ""} onValueChange={(v) => setSucursalId(Number(v))}>
              <SelectTrigger {...p} className="w-full">
                <SelectValue placeholder={opciones.length ? "Elige la sucursal" : "Primero crea una sucursal"} />
              </SelectTrigger>
              <SelectContent>
                {opciones.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Campo>
      )}
      {!persona && <CampoPin valor={pin} onCambiar={setPin} error={crear.campos.pin} etiqueta="PIN inicial" />}
    </DialogoFormulario>
  );
}

function FormularioPin({ persona, onCerrar }: { persona: Persona; onCerrar: () => void }) {
  const [pin, setPin] = useState("");
  const accion = useAccion(restablecerPin, { mensajeExito: `PIN de ${persona.nombre} actualizado`, alExito: onCerrar });

  return (
    <DialogoFormulario
      abierto
      onAbierto={(v) => !v && onCerrar()}
      titulo="Cambiar PIN"
      descripcion={`${persona.nombre} (@${persona.usuario}). También se quitan los bloqueos por intentos fallidos.`}
      pendiente={accion.pendiente}
      textoGuardar="Guardar PIN"
      onGuardar={() => accion.ejecutar({ id: persona.id, pin })}
    >
      <CampoPin valor={pin} onCambiar={setPin} error={accion.campos.pin} etiqueta="Nuevo PIN" />
    </DialogoFormulario>
  );
}
