"use client";

import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { ESTILO_ALERTA } from "@/components/alertas/estilo";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { marcarAlertaLeida, marcarAlertaRevisada, marcarTodasLeidas, obtenerAlertas } from "@/lib/alertas/acciones";
import type { AlertaCampanita } from "@/lib/alertas/consultas";
import { cn } from "@/lib/utils";

function hace(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? "" : "s"}`;
}

/**
 * Campanita del administrador (sección 4 del plan): contador de alertas sin leer; al tocar una
 * alerta se abre la pantalla correspondiente con el producto, la caja o la venta resaltados.
 */
export function Campanita({ noLeidas: inicial = 0 }: { noLeidas?: number }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [lista, setLista] = useState<AlertaCampanita[] | null>(null);
  const [noLeidas, setNoLeidas] = useState(inicial);
  const [ocupado, iniciar] = useTransition();

  const cargar = useCallback(async () => {
    try {
      const r = await obtenerAlertas();
      if (r.ok) {
        setLista(r.datos.alertas);
        setNoLeidas(r.datos.noLeidas);
      }
    } catch {
      /* sin conexión: se mantiene lo último */
    }
  }, []);

  // El contador llega del servidor en cada navegación (y se refresca cada minuto).
  const [inicialPrevio, setInicialPrevio] = useState(inicial);
  if (inicialPrevio !== inicial) {
    setInicialPrevio(inicial);
    setNoLeidas(inicial);
  }
  useEffect(() => {
    const i = setInterval(() => navigator.onLine && cargar(), 60_000);
    return () => clearInterval(i);
  }, [cargar]);

  const abrirAlerta = (a: AlertaCampanita) =>
    iniciar(async () => {
      setAbierta(false);
      if (!a.leida) await marcarAlertaLeida({ id: a.id }).catch(() => {});
      router.push(a.destino);
    });

  return (
    <Popover
      open={abierta}
      onOpenChange={(v) => {
        setAbierta(v);
        if (v) cargar();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={`Alertas: ${noLeidas} sin leer`}>
          <Bell className="size-5" />
          <AnimatePresence>
            {noLeidas > 0 && (
              <motion.span
                key={noLeidas}
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                transition={{ duration: 0.15 }}
                className="cifras absolute -top-0.5 -right-0.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-5 font-bold text-primary-foreground"
              >
                {noLeidas > 99 ? "99+" : noLeidas}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-display font-extrabold">Alertas</p>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            disabled={noLeidas === 0 || ocupado}
            onClick={() =>
              iniciar(async () => {
                await marcarTodasLeidas();
                await cargar();
              })
            }
          >
            <CheckCheck className="size-4" /> Marcar todas como leídas
          </Button>
        </div>

        <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
          {lista === null ? (
            <Loader2 className="mx-auto my-8 size-6 animate-spin text-muted-foreground" />
          ) : lista.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Todo en orden: no hay alertas.</p>
          ) : (
            <ul className="divide-y">
              {lista.map((a) => {
                const e = ESTILO_ALERTA[a.tipo];
                return (
                  <li key={a.id} className={cn("group relative flex gap-3 px-4 py-3 transition-colors hover:bg-accent", !a.leida && "bg-primary/8")}>
                    <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", e.clase)}>
                      <e.icono className="size-4" />
                    </span>
                    <button type="button" onClick={() => abrirAlerta(a)} className="min-w-0 flex-1 text-left after:absolute after:inset-0">
                      <span className="flex items-center gap-2 text-xs font-bold text-muted-foreground uppercase">
                        {e.titulo}
                        {!a.leida && <span className="size-2 rounded-full bg-primary" aria-label="Sin leer" />}
                      </span>
                      <span className="mt-0.5 block text-sm leading-snug">{a.mensaje}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {hace(a.fecha)}
                        {a.sucursal && ` · ${a.sucursal}`}
                      </span>
                    </button>
                    {!a.automatica && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative z-10 size-8 shrink-0 self-center"
                        title="Marcar como revisada"
                        aria-label="Marcar como revisada"
                        disabled={ocupado}
                        onClick={() =>
                          iniciar(async () => {
                            await marcarAlertaRevisada({ id: a.id });
                            await cargar();
                          })
                        }
                      >
                        <Check className="size-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
          Las de stock y vencimiento se resuelven solas al corregirse; las demás se marcan como revisadas (✓).
        </p>
      </PopoverContent>
    </Popover>
  );
}
