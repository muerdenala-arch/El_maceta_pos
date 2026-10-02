"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ACCIONES_SENSIBLES } from "@/lib/auditoria-acciones";
import { FiltroFechas } from "./filtro-fechas";
import { Buscador, Resaltar, SinResultados } from "@/components/busqueda/buscador";

export type EventoAuditoria = {
  id: number;
  fecha: string;
  accion: string;
  usuario: string | null;
  detalle: Record<string, unknown>;
  dispositivo: string | null;
};

type Nombres = { productos: Record<number, string>; ubicaciones: Record<number, string>; usuarios: Record<number, string> };

const fechaHora = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", { timeZone: "America/La_Paz", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const bs = (v: unknown) => (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? formatoBs(v) : String(v ?? ""));

/** Resumen legible del detalle de cada acción. */
function describir(e: EventoAuditoria, n: Nombres): string {
  const d = e.detalle;
  const producto = typeof d.productoId === "number" ? (n.productos[d.productoId] ?? `producto #${d.productoId}`) : "";
  const ubicacion = typeof d.ubicacionId === "number" ? (n.ubicaciones[d.ubicacionId] ?? `ubicación #${d.ubicacionId}`) : "";
  switch (e.accion) {
    case "venta_anulada":
      return `Venta #${d.numero} por ${bs(d.total)} · Motivo: ${d.motivo}`;
    case "ajuste_stock":
      return `${producto} en ${ubicacion}: ${d.antes} → ${d.despues} · Motivo: ${d.motivo}`;
    case "cambio_precio": {
      const partes: string[] = [];
      const v = d.precioVenta as { antes: string; despues: string } | undefined;
      const c = d.precioCosto as { antes: string; despues: string } | undefined;
      if (v) partes.push(`venta ${bs(v.antes)} → ${bs(v.despues)}`);
      if (c) partes.push(`costo ${bs(c.antes)} → ${bs(c.despues)}`);
      return `${d.producto ?? producto}: ${partes.join(", ")}`;
    }
    case "login_fallido":
      return d.usuario ? `Usuario "${d.usuario}"${d.motivo === "no_existe" ? " (no existe)" : d.motivo === "inactivo" ? " (inactivo)" : ""}` : `Intento n.º ${d.intento}`;
    case "desbloqueo_fallido":
      return `Intento n.º ${d.intento}`;
    case "bloqueo_por_intentos":
      return `Bloqueado hasta ${typeof d.hasta === "string" ? fechaHora(d.hasta) : ""} (${d.contexto === "login" ? "al ingresar" : "al desbloquear"})`;
    case "gasto_anulado":
      return `${d.categoria} por ${bs(d.monto)} · Motivo: ${d.motivo}`;
    case "pago_qr_confirmado":
      return `Venta #${d.numero} por ${d.total}`;
    case "pin_restablecido":
    case "usuario_estado":
    case "usuario_editado":
      return `${typeof d.id === "number" ? (n.usuarios[d.id] ?? `usuario #${d.id}`) : ""}${d.activo === false ? " desactivado" : d.activo === true ? " activado" : ""}`;
    case "transferencia_cancelada":
      return `Transferencia T-${d.id}`;
    case "caja_cerrada":
      return `Esperado ${bs(d.esperado)} · contado ${bs(d.contado)} · diferencia ${bs(d.diferencia)}`;
    case "alerta_revisada":
      return String(d.mensaje ?? "");
    default:
      return JSON.stringify(d).slice(0, 160);
  }
}

export function AccionesSensibles({
  eventos,
  nombres,
  desde,
  hasta,
  accion,
  pagina,
  hayMas,
  hoy,
  consulta,
}: {
  consulta: string;
  hoy: string;
  eventos: EventoAuditoria[];
  nombres: Nombres;
  desde: string;
  hasta: string;
  accion: string | null;
  pagina: number;
  hayMas: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [cargando, iniciar] = useTransition();
  const ir = (cambios: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    iniciar(() => router.replace(`${pathname}?${p}`, { scroll: false }));
  };

  return (
    <div className={cn("space-y-4", cargando && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-3">
        <FiltroFechas desde={desde} hasta={hasta} hoy={hoy} />
        <Select value={accion ?? "todas"} onValueChange={(v) => ir({ accion: v === "todas" ? null : v, pagina: null })}>
          <SelectTrigger className="h-10! w-64" aria-label="Tipo de acción">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las acciones sensibles</SelectItem>
            {Object.entries(ACCIONES_SENSIBLES).map(([v, a]) => (
              <SelectItem key={v} value={v}>
                {a.titulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Buscador className="w-72" valor={consulta} onCambiar={(q) => ir({ q: q.trim() || null, pagina: null })} etiqueta="Buscar acciones" placeholder="Usuario, producto, motivo…" />
      </div>

      <ul className="divide-y rounded-3xl border bg-card shadow-sm">
        {eventos.map((e) => {
          const a = ACCIONES_SENSIBLES[e.accion];
          return (
            <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3">
              <span className="cifras w-32 shrink-0 text-sm text-muted-foreground">{fechaHora(e.fecha)}</span>
              <div className="min-w-0 flex-1 basis-64">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge variant={a?.grave ? "destructive" : "secondary"}>{a?.titulo ?? e.accion}</Badge>
                  <span className="text-sm font-semibold">
                    <Resaltar texto={e.usuario ?? "Desconocido"} consulta={consulta} />
                  </span>
                </p>
                <p className="mt-1 text-sm">
                  <Resaltar texto={describir(e, nombres)} consulta={consulta} />
                </p>
              </div>
            </li>
          );
        })}
        {eventos.length === 0 && (
          <li className="p-6 text-center text-muted-foreground">
            {consulta ? <SinResultados className="border-0 p-2" consulta={consulta} onLimpiar={() => ir({ q: null, pagina: null })} /> : "No hay acciones sensibles en estas fechas."}
          </li>
        )}
      </ul>

      {(pagina > 1 || hayMas) && (
        <div className="flex items-center justify-end gap-2">
          <span className="text-sm text-muted-foreground">Página {pagina}</span>
          <Button variant="outline" size="icon" aria-label="Página anterior" disabled={pagina <= 1} onClick={() => ir({ pagina: String(pagina - 1) })}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" aria-label="Página siguiente" disabled={!hayMas} onClick={() => ir({ pagina: String(pagina + 1) })}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
