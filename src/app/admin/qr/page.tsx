import type { Metadata } from "next";
import { EnConstruccion } from "@/components/shell/en-construccion";

export const metadata: Metadata = { title: "QR de cobro" };

export default function Pagina() {
  return <EnConstruccion titulo="QR de cobro" fase={4} />;
}
