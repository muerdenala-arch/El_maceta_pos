"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { cargarGeneradorPdf } from "@/lib/comprobante/cargar-pdf";
import { baseLocal } from "@/lib/offline/base";
import { precargar } from "@/lib/offline/precarga";
import { alSincronizar, fijarUsuarioSync, sincronizarAhora } from "@/lib/offline/sincronizar";

/**
 * Motor de sincronización del cajero (sección 8.4 del plan): envía la cola al iniciar, al volver la
 * conexión y cada 30 s mientras haya pendientes. También descarga lo necesario para trabajar sin internet.
 */
export function Sincronizador({ usuarioId }: { usuarioId: number }) {
  const router = useRouter();

  useEffect(() => {
    fijarUsuarioSync(usuarioId);
    const quitarOyente = alSincronizar((r) => {
      if (r.enviadas > 0) {
        toast.success(`${r.enviadas} operación${r.enviadas === 1 ? "" : "es"} sin conexión sincronizada${r.enviadas === 1 ? "" : "s"}`);
        router.refresh();
      }
      if (r.conError > 0) toast.error(`${r.conError} operación${r.conError === 1 ? "" : "es"} rechazada${r.conError === 1 ? "" : "s"}: revisa el aviso en Cierre de caja`);
      if (r.requiereIngreso) toast.warning("Tu sesión venció: vuelve a ingresar para enviar las ventas guardadas sin conexión.");
    });

    const intentar = async () => {
      sincronizarAhora().catch(() => {});
      if (!navigator.onLine) return;
      try {
        // Primero el generador de PDF (se carga bajo demanda) y después las pantallas y fotos:
        // cuando las pantallas ya están guardadas, el PDF también funciona sin internet.
        await cargarGeneradorPdf();
        const i = await baseLocal().instantaneas.get(`pos:${usuarioId}`);
        await precargar([
          ...(i?.productos.map((p) => p.fotoUrl).filter((u): u is string => !!u) ?? []),
          ...(i?.qrs.map((q) => q.imagenUrl) ?? []),
          ...(i?.baseComprobante.negocio.logoUrl ? [i.baseComprobante.negocio.logoUrl] : []),
        ]);
      } catch {
        /* se reintenta en la próxima conexión */
      }
    };
    const inicio = setTimeout(intentar, 1500);
    window.addEventListener("online", intentar);
    const intervalo = setInterval(async () => {
      if (!navigator.onLine) return;
      const pendientes = await baseLocal().cola.where("estado").equals("pendiente").count().catch(() => 0);
      if (pendientes > 0) sincronizarAhora().catch(() => {});
    }, 30_000);

    return () => {
      clearTimeout(inicio);
      clearInterval(intervalo);
      window.removeEventListener("online", intentar);
      quitarOyente();
    };
  }, [usuarioId, router]);

  return null;
}
