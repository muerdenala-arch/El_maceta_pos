import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Bloqueado" };

// En la Fase 1 el bloqueo por inactividad será una capa sobre la pantalla actual
// (para no perder el carrito); esta ruta queda para el bloqueo al reabrir la app.
export default function Bloqueo() {
  return (
    <main className="p-4 sm:p-6">
      <EnConstruccion titulo="Pantalla de bloqueo" fase={1} />
    </main>
  );
}
