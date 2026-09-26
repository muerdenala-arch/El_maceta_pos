import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { FondoAmbiental } from "@/components/marca/fondo-ambiental";

export const metadata: Metadata = { title: "Sin conexión" };

/** Página de respaldo del service worker cuando no hay internet ni copia guardada de la pantalla pedida. */
export default function SinConexion() {
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center p-4">
      <FondoAmbiental />
      <div className="w-full max-w-sm rounded-[2rem] border bg-card/90 p-8 text-center shadow-2xl">
        <span className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-destructive/15 text-destructive">
          <WifiOff className="size-8" />
        </span>
        <h1 className="mt-5 text-2xl font-extrabold">Sin conexión</h1>
        <p className="mt-2 text-muted-foreground">
          Esta pantalla necesita internet. El punto de venta sigue funcionando si ya lo abriste antes en este dispositivo.
        </p>
        <a href="/cajero/venta" className="mt-6 flex h-12 items-center justify-center rounded-2xl bg-primary font-bold text-primary-foreground">
          Ir al punto de venta
        </a>
      </div>
    </main>
  );
}
