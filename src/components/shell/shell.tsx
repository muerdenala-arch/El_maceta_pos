"use client";

import { ArrowLeft, Menu, Store } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { esInicio } from "@/lib/navegacion/niveles";
import { NavegacionPorNiveles } from "./navegacion-por-niveles";
import { useState } from "react";
import { BotonRecarga } from "@/components/barra/boton-recarga";
import { Campanita } from "@/components/barra/campanita";
import { IndicadorConexion } from "@/components/barra/indicador-conexion";
import { SelectorTema } from "@/components/barra/selector-tema";
import { Logo } from "@/components/marca/logo";
import { BotonCerrarSesion } from "@/components/seguridad/boton-cerrar-sesion";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NOMBRES_ROL, type Rol } from "@/lib/auth/constantes";
import { moduloDeRuta, MODULOS_CON_CANDADO, type ModuloEncargado } from "@/lib/auth/modulos";
import { BotonCandado, IndicadorCandado } from "./candado";
import { navAdmin, navCajero, navEncargado, navEncargadoCompartido, navEncargadoInferior } from "./navegacion";
import { SelectorSucursal } from "./selector-sucursal";

export type PropsShell = {
  rol: Rol;
  usuario: { nombre: string };
  marca: { nombre: string; logoUrl: string | null };
  /** Admin: opciones del selector. Cajero y encargado: solo su sucursal (fija). */
  sucursales: { id: number; nombre: string }[];
  sucursalActual: number | null;
  /** Admin y encargado: contador de la campanita y numeritos por módulo del menú. */
  alertas?: { noLeidas: number; porModulo: Record<string, number> };
  /** Apartados con el candado abierto para los encargados (el administrador los abre y cierra desde su menú). */
  candados?: ModuloEncargado[];
  children: React.ReactNode;
};

/**
 * Estructura común de pantallas:
 * - PC (≥ 1024 px): barra lateral fija con controles, sucursal, menú y tarjeta de usuario.
 * - Celular: barra superior; el menú se abre como panel lateral.
 *   El cajero además tiene pestañas inferiores (acceso rápido con el pulgar).
 */
export function Shell(props: PropsShell) {
  const { rol, marca, children } = props;
  const [menuAbierto, setMenuAbierto] = useState(false);
  const inferior = rol === "encargado" ? navEncargadoInferior : navCajero;
  const pathname = usePathname();
  const activo = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:block">
        <ContenidoLateral {...props} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur lg:hidden">
          <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full" aria-label="Abrir menú">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[19rem] max-w-[85vw] gap-0 border-sidebar-border bg-sidebar p-0">
              <SheetTitle className="sr-only">Menú</SheetTitle>
              <ContenidoLateral {...props} alNavegar={() => setMenuAbierto(false)} />
            </SheetContent>
          </Sheet>
          <Logo nombre={marca.nombre} url={marca.logoUrl} className="size-9" />
          <span className="truncate font-display text-lg font-bold">{marca.nombre}</span>
          <div className="ml-auto flex items-center gap-1">
            <span className="hidden sm:block">
              <IndicadorConexion />
            </span>
            <BotonRecarga />
            {rol !== "cajero" && <Campanita noLeidas={props.alertas?.noLeidas} />}
            <SelectorTema />
          </div>
        </header>

        <NavegacionPorNiveles />
        <main className={cn("flex-1 px-4 py-5 sm:px-8 sm:py-8", rol !== "admin" && "pb-28 lg:pb-8")}>
          {children}
        </main>

        {rol !== "admin" && (
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
            {inferior.map(({ href, titulo, icono: Icono }) => (
              <Link
                key={href}
                href={href}
                replace={!esInicio(pathname)}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold",
                  activo(href) ? "text-nav-activo-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-colors",
                    activo(href) && "bg-nav-activo",
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

function ContenidoLateral({
  rol,
  usuario,
  marca,
  sucursales,
  sucursalActual,
  alertas,
  candados = [],
  alNavegar,
}: PropsShell & { alNavegar?: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const items = rol === "admin" ? navAdmin : rol === "encargado" ? [...navEncargado, ...navEncargadoCompartido] : navCajero;
  const activo = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  /** Apartado con candado al que corresponde un enlace del menú (null si no tiene). */
  const conCandado = (href: string) => {
    const m = moduloDeRuta(href);
    return m && MODULOS_CON_CANDADO.includes(m) ? m : null;
  };

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-5 px-5 pt-5 pb-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[15px] font-semibold text-sidebar-foreground/80 hover:text-sidebar-foreground"
        >
          <ArrowLeft className="size-4" />
          Volver
        </button>

        <div className="flex items-center gap-1">
          <Logo nombre={marca.nombre} url={marca.logoUrl} className="mr-auto size-11" />
          {rol !== "cajero" && <Campanita noLeidas={alertas?.noLeidas} />}
          <BotonRecarga />
          <SelectorTema className="ml-1" />
        </div>

        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.12em] text-sidebar-foreground/60 uppercase">
            <Store className="size-3.5" />
            {rol === "admin" ? "Viendo sucursal" : "Tu sucursal"}
          </p>
          {rol === "admin" ? (
            <SelectorSucursal opciones={sucursales} actual={sucursalActual} />
          ) : (
            <div className="flex h-12 items-center rounded-xl border bg-background/60 px-4 text-[15px] font-semibold">
              {sucursales[0]?.nombre ?? "Sin sucursal asignada"}
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {items.map(({ href, titulo, icono: Icono }) => {
          const modulo = rol === "cajero" ? null : conCandado(href);
          const abierto = !!modulo && candados.includes(modulo);
          return (
          <div key={href} className="relative">
          <Link
            href={href}
            // Saltar entre apartados del menú no apila pasos: atrás vuelve al inicio (navegación por niveles).
            replace={!esInicio(pathname)}
            onClick={alNavegar}
            aria-current={activo(href) ? "page" : undefined}
            className={cn(
              "flex items-center gap-3.5 rounded-xl px-4 py-3 text-[15px] font-semibold transition-colors",
              modulo && rol === "admin" && "pr-12",
              activo(href)
                ? "bg-nav-activo text-nav-activo-foreground shadow-sm"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <Icono className="size-5 shrink-0" strokeWidth={1.8} />
            <span className="flex-1">{titulo}</span>
            {!!alertas?.porModulo[href] && (
              <span
                className="cifras flex min-w-6 items-center justify-center rounded-full bg-destructive px-1.5 text-xs leading-6 font-bold text-white"
                aria-label={`${alertas.porModulo[href]} alertas`}
              >
                {alertas.porModulo[href]}
              </span>
            )}
            {modulo && rol === "encargado" && <IndicadorCandado abierto={abierto} />}
          </Link>
          {modulo && rol === "admin" && <BotonCandado modulo={modulo} titulo={titulo} abierto={abierto} />}
          </div>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ficha-rosa-foreground font-display text-lg font-bold text-white">
            {usuario.nombre.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{usuario.nombre}</p>
            <p className="text-sm text-sidebar-foreground/60">{NOMBRES_ROL[rol]}</p>
          </div>
          <IndicadorConexion />
        </div>
        <BotonCerrarSesion />
      </div>
    </div>
  );
}
