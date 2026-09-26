import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Venta" };

export default function Pagina() {
  return <EnConstruccion titulo="Venta" fase={4} />;
}
