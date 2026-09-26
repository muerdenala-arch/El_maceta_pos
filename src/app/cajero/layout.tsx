import { Shell } from "@/components/shell/shell";

// La verificación de rol en el servidor (proxy.ts + cada acción) se agrega en la Fase 1.
export default function LayoutCajero({ children }: LayoutProps<"/cajero">) {
  return <Shell rol="cajero">{children}</Shell>;
}
