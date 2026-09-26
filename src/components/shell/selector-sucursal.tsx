"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cambiarSucursalVista } from "@/lib/acciones-admin";
import { cn } from "@/lib/utils";

type Props = { opciones: { id: number; nombre: string }[]; actual: number | null };

/** "Viendo sucursal" del administrador: filtra los datos de todas las pantallas. */
export function SelectorSucursal({ opciones, actual }: Props) {
  const router = useRouter();
  const [cambiando, iniciar] = useTransition();

  return (
    <Select
      value={actual === null ? "todas" : String(actual)}
      disabled={cambiando}
      onValueChange={(v) =>
        iniciar(async () => {
          await cambiarSucursalVista(v === "todas" ? null : Number(v));
          router.refresh();
        })
      }
    >
      <SelectTrigger
        aria-label="Sucursal que estás viendo"
        className={cn(
          "h-12! w-full rounded-xl bg-background/60 px-4 text-[15px] font-semibold",
          cambiando && "opacity-60",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" className="rounded-xl">
        <SelectItem value="todas">Todas las sucursales</SelectItem>
        {opciones.map((s) => (
          <SelectItem key={s.id} value={String(s.id)}>
            {s.nombre}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
