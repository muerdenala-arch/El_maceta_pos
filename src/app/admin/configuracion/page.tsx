import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { db } from "@/db";
import { configuracion } from "@/db/schema";
import { ZonaModulo } from "@/components/permisos/zona-modulo";
import { requerirModulo } from "@/lib/auth/modulo-servidor";
import { FormularioConfiguracion } from "./formulario-configuracion";

export const metadata: Metadata = { title: "Configuración" };

export default async function PaginaConfiguracion() {
  const acceso = await requerirModulo("configuracion");
  const [c] = await db.select().from(configuracion).where(eq(configuracion.id, 1));

  return (
    <ZonaModulo soloLectura={acceso.soloLectura}>
    <FormularioConfiguracion
      sinDescuentos={acceso.encargado}
      inicial={{
        nombreComercial: c?.nombreComercial ?? "El Maseta",
        nit: c?.nit ?? "",
        mensajeAgradecimiento: c?.mensajeAgradecimiento ?? "¡Gracias por tu compra!",
        plantillaWhatsapp: c?.plantillaWhatsapp ?? "Hola {cliente}, aquí está tu comprobante de {negocio}: {enlace}",
        codigoPais: c?.codigoPais ?? "591",
        descuentoManualMaximo: String(Number(c?.descuentoManualMaximo ?? 0)),
        descuentoManualMaximoEncargado: String(Number(c?.descuentoManualMaximoEncargado ?? 0)),
        logoUrl: c?.logoUrl ?? null,
      }}
    />
    </ZonaModulo>
  );
}
