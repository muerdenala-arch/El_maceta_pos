import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "Reporte de ventas" };

export default function Pagina() {
  return <EnConstruccion titulo="Reporte de ventas" fase={8} />;
}
