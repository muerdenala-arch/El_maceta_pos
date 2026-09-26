import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Comprobante } from "@/components/comprobante/comprobante";
import { obtenerComprobante } from "@/lib/comprobante/consulta";
import { numeroComprobante } from "@/lib/comprobante/datos";
import { AccionesPublicas } from "./acciones-publicas";

export const metadata: Metadata = {
  title: "Comprobante",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Vista pública del comprobante (enlace enviado por WhatsApp). El token es aleatorio (144 bits):
 * no se puede adivinar el de otra venta a partir del número correlativo.
 */
export default async function ComprobantePublico(props: PageProps<"/comprobante/[token]">) {
  const { token } = await props.params;
  if (!/^[\w-]{20,64}$/.test(token)) notFound();
  const datos = await obtenerComprobante({ token });
  if (!datos) notFound();

  return (
    <main className="min-h-dvh bg-muted/40 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-center font-display text-xl font-extrabold print:hidden">
          Comprobante N.º {numeroComprobante(datos.venta.numero)}
        </h1>
        <div className="overflow-x-auto rounded-3xl border bg-white p-4 shadow-sm sm:p-8 print:border-0 print:p-0 print:shadow-none">
          <Comprobante datos={datos} tamano="carta" />
        </div>
        <AccionesPublicas datos={datos} />
      </div>
    </main>
  );
}
