import { Shell } from "@/components/shell/shell";

// La verificación de rol en el servidor (proxy.ts + cada acción) se agrega en la Fase 1.
export default function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  return <Shell rol="admin">{children}</Shell>;
}
