"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BotonRecarga } from "@/components/barra/boton-recarga";
import { Campanita } from "@/components/barra/campanita";
import { IndicadorConexion } from "@/components/barra/indicador-conexion";
import { SelectorTema } from "@/components/barra/selector-tema";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { iconoCerrarSesion as CerrarSesion, navAdmin, navCajero } from "./navegacion";

type Props = { rol: "admin" | "cajero"; children: React.ReactNode };

/**
 * Estructura común de pantallas:
 * - Admin: barra lateral en PC, menú desplegable en celular.
 * - Cajero: barra lateral en PC, pestañas inferiores en celular (acceso con el pulgar).
 */
export function Shell({ rol, children }: Props) {
  const pathname = usePathname();
  const items = rol === "admin" ? navAdmin : navCajero;
  const activo = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-5 py-5">
          <Marca />
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {items.map(({ href, titulo, icono: Icono }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                activo(href)
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Icono className="size-4" />
              {titulo}
            </Link>
          ))}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <BotonCerrarSesion className="w-full justify-start text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
          {rol === "admin" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menú">
                  <Menu className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {items.map(({ href, titulo, icono: Icono }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href} className={cn(activo(href) && "font-semibold")}>
                      <Icono className="size-4" />
                      {titulo}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <div className="lg:hidden">
            <Marca />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <IndicadorConexion />
            <BotonRecarga />
            {rol === "admin" && <Campanita />}
            <SelectorTema />
            {rol === "cajero" && <BotonCerrarSesion soloIcono className="lg:hidden" />}
          </div>
        </header>

        <main className={cn("flex-1 p-4 sm:p-6", rol === "cajero" && "pb-24 lg:pb-6")}>{children}</main>

        {rol === "cajero" && (
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
            {items.map(({ href, titulo, icono: Icono }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  activo(href) ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                    activo(href) && "bg-primary text-primary-foreground",
                  )}
                >
                  <Icono className="size-5" />
                </span>
                {titulo}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}

function Marca() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary font-display text-lg font-extrabold text-primary-foreground">
        M
      </span>
      <span className="font-display text-lg font-bold tracking-tight">El Maseta</span>
    </Link>
  );
}

/** El cierre de sesión real (borrar cookie + advertir pendientes offline) llega en la Fase 1. */
function BotonCerrarSesion({ soloIcono, className }: { soloIcono?: boolean; className?: string }) {
  return (
    <Button
      variant="ghost"
      size={soloIcono ? "icon" : "default"}
      className={className}
      aria-label="Cerrar sesión"
      asChild
    >
      <Link href="/login">
        <CerrarSesion className="size-4" />
        {!soloIcono && "Cerrar sesión"}
      </Link>
    </Button>
  );
}
