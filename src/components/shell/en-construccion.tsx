import { Hammer } from "lucide-react";

/** Marcador temporal para pantallas de fases futuras. */
export function EnConstruccion({ titulo, fase }: { titulo: string; fase: number }) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold sm:text-3xl">{titulo}</h1>
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed p-10 text-center text-muted-foreground">
        <Hammer className="size-8" />
        <p>
          Esta pantalla se construye en la <strong className="text-foreground">Fase {fase}</strong> del plan de
          trabajo.
        </p>
      </div>
    </div>
  );
}
