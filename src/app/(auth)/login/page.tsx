import type { Metadata } from "next";
import Link from "next/link";
import { SelectorTema } from "@/components/barra/selector-tema";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Iniciar sesión" };

/**
 * Fase 0: pantalla provisional con accesos directos para revisar el diseño base.
 * En la Fase 1 se reemplaza por usuario + PIN (4-6 dígitos) validado en el servidor.
 */
export default function Login() {
  return (
    <main className="relative flex min-h-dvh items-center justify-center p-4">
      <div className="absolute top-3 right-3">
        <SelectorTema />
      </div>
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-primary font-display text-3xl font-extrabold text-primary-foreground">
            M
          </span>
          <h1 className="text-2xl font-bold">El Maseta</h1>
          <p className="text-sm text-muted-foreground">Sistema de gestión de suplementos</p>
        </div>
        <p className="mb-4 rounded-lg bg-muted p-3 text-center text-xs text-muted-foreground">
          Vista previa de la Fase 0. El inicio de sesión con PIN llega en la Fase 1.
        </p>
        <div className="grid gap-2">
          <Button asChild size="lg">
            <Link href="/admin/dashboard">Entrar como administrador</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/cajero/venta">Entrar como cajero</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
