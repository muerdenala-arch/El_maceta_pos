import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Cierre de caja" };

export default function Pagina() {
  return <EnConstruccion titulo="Cierre de caja" fase={4} />;
}
