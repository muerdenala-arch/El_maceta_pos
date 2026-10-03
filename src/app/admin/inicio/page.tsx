import { LockKeyhole } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { modulosAbiertos } from "@/lib/auth/modulo-servidor";
import { primerApartado } from "@/lib/auth/modulos";
import { requerirSesion } from "@/lib/auth/sesion";

export const metadata: Metadata = { title: "Inicio" };

/** Entrada del encargado: lo lleva al primer apartado que el administrador le dejó abierto. Sin ninguno, lo avisa. */
export default async function EntradaEncargado() {
  const sesion = await requerirSesion("admin", "encargado");
  if (sesion.rol === "admin") redirect("/admin/dashboard");
  const destino = primerApartado(await modulosAbiertos());
  if (destino) redirect(destino);
  return (
    <div className="mx-auto mt-16 max-w-md rounded-3xl border bg-card p-8 text-center shadow-sm">
      <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-muted">
        <LockKeyhole className="size-7 text-muted-foreground" />
      </span>
      <h1 className="mt-4 text-xl font-extrabold">Todavía no tienes apartados</h1>
      <p className="mt-2 text-muted-foreground">El administrador tiene todos los candados cerrados. Pídele que abra los apartados con los que vas a trabajar.</p>
    </div>
  );
}
