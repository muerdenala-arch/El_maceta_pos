import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Gastos" };

export default function Pagina() {
  return <EnConstruccion titulo="Gastos" fase={4} />;
}
