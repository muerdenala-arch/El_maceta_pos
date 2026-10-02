"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";
import type { UbicacionLigera } from "@/components/inventario/dialogos-inventario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Movimiento = {
  id: number;
  fecha: string;
  tipo: string;
  producto: string;
  presentacion: string | null;
  ubicacion: string;
  cantidad: number;
  usuario: string;
  motivo: string | null;
  referencia: string | null;
};

type Filtros = { ubicacionId?: number; tipo?: string; producto?: string; desde?: string; hasta?: string; pagina: number };

export const NOMBRES_TIPO: Record<string, string> = {
  ingreso: "Ingreso",
  venta: "Venta",
  transferencia_salida: "Envío",
  transferencia_entrada: "Recepción",
  ajuste: "Ajuste",
  anulacion: "Anulación",
};

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

export function HistorialMovimientos({
  ubicaciones,
  filtros,
  movimientos,
  hayMas,
  pagina,
}: {
  ubicaciones: UbicacionLigera[];
  filtros: Filtros;
  movimientos: Movimiento[];
  hayMas: boolean;
  pagina: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [cargando, iniciar] = useTransition();
  const consulta = filtros.producto ?? "";

  const ir = (cambios: Partial<Record<keyof Filtros, string | number | undefined>>) => {
    const siguiente = { ...filtros, pagina: 1, ...cambios } as Record<string, unknown>;
    const params = new URLSearchParams({ vista: "movimientos" });
    const claves: Record<string, string> = { ubicacionId: "ubicacion", tipo: "tipo", producto: "producto", desde: "desde", hasta: "hasta", pagina: "pagina" };
    for (const [k, p] of Object.entries(claves)) {
      const v = siguiente[k];
      if (v !== undefined && v !== "" && !(k === "pagina" && v === 1)) params.set(p, String(v));
    }
    iniciar(() => router.replace(`${pathname}?${params}`, { scroll: false }));
  };
  const hayFiltros = filtros.ubicacionId || filtros.tipo || filtros.producto || filtros.desde || filtros.hasta;

  return (
    <div className={cn("space-y-4", cargando && "opacity-70 transition-opacity")}>
      <div className="grid items-center gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto_auto]">
        <Buscador className="max-w-none" valor={consulta} onCambiar={(q) => ir({ producto: q.trim() || undefined })} etiqueta="Buscar movimientos" placeholder="Producto, código, usuario o motivo" />
        <Select value={filtros.ubicacionId ? String(filtros.ubicacionId) : "todas"} onValueChange={(v) => ir({ ubicacionId: v === "todas" ? undefined : Number(v) })}>
          <SelectTrigger className="h-10! w-full" aria-label="Ubicación"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las ubicaciones</SelectItem>
            {ubicaciones.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtros.tipo ?? "todos"} onValueChange={(v) => ir({ tipo: v === "todos" ? undefined : v })}>
          <SelectTrigger className="h-10! w-full" aria-label="Tipo"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {Object.entries(NOMBRES_TIPO).map(([v, n]) => <SelectItem key={v} value={v}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" aria-label="Desde" value={filtros.desde ?? ""} onChange={(e) => ir({ desde: e.target.value || undefined })} className="h-10" />
        <Input type="date" aria-label="Hasta" value={filtros.hasta ?? ""} onChange={(e) => ir({ hasta: e.target.value || undefined })} className="h-10" />
        {hayFiltros ? (
          <Button type="button" variant="ghost" className="h-10" onClick={() => iniciar(() => router.replace(`${pathname}?vista=movimientos`))}>
            <X className="size-4" /> Limpiar
          </Button>
        ) : <span />}
      </div>

      <div className="overflow-x-auto rounded-3xl border bg-card shadow-sm">
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-3 py-3">Tipo</th>
              <th className="px-3 py-3">Producto</th>
              <th className="px-3 py-3">Ubicación</th>
              <th className="px-3 py-3 text-right">Cant.</th>
              <th className="px-3 py-3">Usuario</th>
              <th className="px-4 py-3">Motivo / referencia</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id} className="border-b align-top last:border-0">
                <td className="cifras px-4 py-2.5 whitespace-nowrap text-muted-foreground">{fechaHora(m.fecha)}</td>
                <td className="px-3 py-2.5"><Badge variant={m.tipo === "ajuste" || m.tipo === "anulacion" ? "outline" : "secondary"}>{NOMBRES_TIPO[m.tipo] ?? m.tipo}</Badge></td>
                <td className="px-3 py-2.5">
                  <span className="font-semibold"><Resaltar texto={m.producto} consulta={consulta} /></span>
                  {m.presentacion && <span className="text-muted-foreground"> · <Resaltar texto={m.presentacion} consulta={consulta} /></span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{m.ubicacion}</td>
                <td className={cn("cifras px-3 py-2.5 text-right font-display font-bold", m.cantidad > 0 ? "text-exito" : "text-destructive")}>
                  {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap"><Resaltar texto={m.usuario} consulta={consulta} /></td>
                <td className="max-w-72 px-4 py-2.5 text-muted-foreground">
                  <Resaltar texto={m.motivo} consulta={consulta} />
                  {m.referencia && <span className="ml-1 font-mono text-xs">[<Resaltar texto={m.referencia} consulta={consulta} />]</span>}
                </td>
              </tr>
            ))}
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {consulta ? <SinResultados className="border-0 p-2" consulta={consulta} onLimpiar={() => ir({ producto: undefined })} /> : "No hay movimientos con estos filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(pagina > 1 || hayMas) && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">Página {pagina}</span>
          <Button variant="outline" size="icon" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => ir({ pagina: pagina - 1 })}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Página siguiente" disabled={!hayMas} onClick={() => ir({ pagina: pagina + 1 })}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
