import type { Metadata } from "next";
import { SelectorTema } from "@/components/barra/selector-tema";
import { FondoAmbiental } from "@/components/marca/fondo-ambiental";
import { Logo } from "@/components/marca/logo";
import { obtenerMarca } from "@/lib/configuracion";
import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default async function Login() {
  const marca = await obtenerMarca();

  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center px-4 pt-16 pb-6 sm:py-10">
      <FondoAmbiental />
      <div className="absolute top-4 right-4">
        <SelectorTema />
      </div>

      <div className="relative w-full max-w-[26rem] overflow-hidden rounded-[2rem] border bg-card/90 px-7 pt-10 pb-8 shadow-2xl backdrop-blur-xl sm:px-8">
        {/* Halo detrás del logo */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 left-1/2 size-64 -translate-x-1/2 -translate-y-1/3 rounded-full bg-[var(--brillo-1)] blur-3xl"
        />
        <div className="relative flex flex-col items-center text-center">
          <Logo nombre={marca.nombre} url={marca.logoUrl} className="size-28 p-1 shadow-lg" />
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight uppercase">{marca.nombre}</h1>
          <p className="mt-1 text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Sistema POS &amp; gestión
          </p>
        </div>
        <div className="relative mt-7">
          <FormularioLogin />
        </div>
      </div>
    </main>
  );
}
