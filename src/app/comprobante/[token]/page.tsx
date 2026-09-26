import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Comprobante", robots: { index: false } };

/** Vista pública del comprobante (enlace de WhatsApp). Usa un token aleatorio, nunca el número correlativo. */
export default async function Comprobante(props: PageProps<"/comprobante/[token]">) {
  await props.params;
  return (
    <main className="p-4 sm:p-6">
      <EnConstruccion titulo="Comprobante de venta" fase={4} />
    </main>
  );
}
