"use client";

import { MessageCircle, Receipt, Settings } from "lucide-react";
import { useState } from "react";
import { Campo } from "@/components/formularios/campo";
import { EncabezadoPagina } from "@/components/formularios/encabezado-pagina";
import { SubirImagen } from "@/components/formularios/subir-imagen";
import { useAccion } from "@/components/formularios/use-accion";
import { Logo } from "@/components/marca/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { COMPRESION_LOGO } from "@/lib/imagen-cliente";
import type { DatosConfiguracion } from "@/lib/validaciones/admin";
import { guardarConfiguracion } from "./acciones";

type Datos = Omit<DatosConfiguracion, "nit"> & { nit: string };

/** Vista previa del mensaje de WhatsApp con datos de ejemplo. */
function mensajeEjemplo(plantilla: string, negocio: string) {
  return plantilla
    .replaceAll("{cliente}", "María")
    .replaceAll("{negocio}", negocio || "tu negocio")
    .replaceAll("{enlace}", "https://…/comprobante/x7Kp2")
    .replaceAll("{total}", "Bs 350,00");
}

export function FormularioConfiguracion({ inicial }: { inicial: Datos }) {
  const [d, setD] = useState<Datos>(inicial);
  const guardar = useAccion(guardarConfiguracion, { mensajeExito: "Configuración guardada" });
  const poner = <K extends keyof Datos>(campo: K, valor: Datos[K]) => {
    setD((x) => ({ ...x, [campo]: valor }));
    guardar.limpiarCampo(campo);
  };
  const cambios = JSON.stringify(d) !== JSON.stringify(inicial);

  return (
    <form
      className="mx-auto max-w-5xl"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        guardar.ejecutar(d);
      }}
    >
      <EncabezadoPagina icono={Settings} titulo="Configuración" descripcion="Datos del negocio y del comprobante">
        <Button type="submit" size="lg" className="rounded-full font-bold" disabled={guardar.pendiente || !cambios}>
          {guardar.pendiente ? "Guardando…" : "Guardar cambios"}
        </Button>
      </EncabezadoPagina>

      <div className="mt-7 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <section className="space-y-4 rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <Receipt className="size-5 text-primary" />
              Negocio y comprobante
            </h2>
            <Campo etiqueta="Logo" error={guardar.campos.logoUrl}>
              {() => (
                <SubirImagen
                  valor={d.logoUrl}
                  onCambiar={(url) => poner("logoUrl", url)}
                  carpeta="logo"
                  compresion={COMPRESION_LOGO}
                  forma="circular"
                  etiqueta="Logo"
                />
              )}
            </Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre comercial" error={guardar.campos.nombreComercial}>
                {(p) => (
                  <Input {...p} value={d.nombreComercial} onChange={(e) => poner("nombreComercial", e.target.value)} maxLength={120} />
                )}
              </Campo>
              <Campo etiqueta="NIT" opcional error={guardar.campos.nit}>
                {(p) => <Input {...p} value={d.nit} onChange={(e) => poner("nit", e.target.value)} maxLength={30} />}
              </Campo>
            </div>
            <Campo
              etiqueta="Mensaje de agradecimiento"
              error={guardar.campos.mensajeAgradecimiento}
              ayuda="Aparece al pie del comprobante"
            >
              {(p) => (
                <Textarea
                  {...p}
                  value={d.mensajeAgradecimiento}
                  onChange={(e) => poner("mensajeAgradecimiento", e.target.value)}
                  maxLength={300}
                  rows={2}
                />
              )}
            </Campo>
            <p className="rounded-xl bg-muted/70 p-3 text-xs text-muted-foreground">
              El tamaño de impresión (58 mm, 80 mm o carta) se configura en cada sucursal.
            </p>
          </section>

          <section className="space-y-4 rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-lg font-extrabold">
              <MessageCircle className="size-5 text-primary" />
              WhatsApp
            </h2>
            <Campo
              etiqueta="Mensaje al enviar el comprobante"
              error={guardar.campos.plantillaWhatsapp}
              ayuda={
                <>
                  Puedes usar <code>{"{cliente}"}</code>, <code>{"{negocio}"}</code>, <code>{"{total}"}</code> y{" "}
                  <code>{"{enlace}"}</code> (obligatorio).
                </>
              }
            >
              {(p) => (
                <Textarea
                  {...p}
                  value={d.plantillaWhatsapp}
                  onChange={(e) => poner("plantillaWhatsapp", e.target.value)}
                  maxLength={500}
                  rows={3}
                />
              )}
            </Campo>
            <Campo
              etiqueta="Código de país"
              error={guardar.campos.codigoPais}
              ayuda="Se antepone a los teléfonos de clientes (Bolivia: 591)"
            >
              {(p) => (
                <div className="flex max-w-40 items-center rounded-md border focus-within:ring-3 focus-within:ring-ring/50">
                  <span className="pl-3 text-muted-foreground">+</span>
                  <Input
                    {...p}
                    value={d.codigoPais}
                    onChange={(e) => poner("codigoPais", e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    className="cifras border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
                  />
                </div>
              )}
            </Campo>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">Vista previa</p>
          <div className="rounded-3xl border bg-card p-5 text-center shadow-sm">
            <Logo nombre={d.nombreComercial || "?"} url={d.logoUrl} className="mx-auto size-16" />
            <p className="mt-3 font-display text-lg font-extrabold uppercase">{d.nombreComercial || "Nombre"}</p>
            {d.nit.trim() && <p className="text-xs text-muted-foreground">NIT {d.nit}</p>}
            <div className="my-4 border-t border-dashed" />
            <p className="text-sm text-muted-foreground italic">{d.mensajeAgradecimiento}</p>
          </div>
          <div className="rounded-3xl border bg-card p-4 shadow-sm">
            <div className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-3 text-sm text-[#111b21] shadow-sm">
              {mensajeEjemplo(d.plantillaWhatsapp, d.nombreComercial)}
            </div>
          </div>
        </aside>
      </div>
    </form>
  );
}
