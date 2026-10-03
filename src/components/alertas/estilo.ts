import { AlarmClockOff, AlertTriangle, CalendarClock, CloudOff, Inbox, PackageMinus, PackageX, QrCode, Trophy, Wallet, type LucideIcon } from "lucide-react";
import type { TipoAlerta } from "@/lib/alertas/reglas";

/** Ícono, color y título de cada tipo de alerta (campanita y panel de inicio). */
export const ESTILO_ALERTA: Record<TipoAlerta, { icono: LucideIcon; clase: string; titulo: string }> = {
  agotado: { icono: PackageX, clase: "bg-destructive/15 text-destructive", titulo: "Agotado" },
  stock_bajo: { icono: PackageMinus, clase: "bg-aviso/25 text-foreground", titulo: "Stock bajo" },
  stock_negativo: { icono: AlertTriangle, clase: "bg-destructive/15 text-destructive", titulo: "Stock negativo" },
  por_vencer: { icono: CalendarClock, clase: "bg-ficha-rosa text-ficha-rosa-foreground", titulo: "Por vencer" },
  caja_diferencia: { icono: Wallet, clase: "bg-destructive/15 text-destructive", titulo: "Diferencia en caja" },
  qr_por_confirmar: { icono: QrCode, clase: "bg-ficha-neutra text-ficha-neutra-foreground", titulo: "QR por confirmar" },
  solicitud_reposicion: { icono: Inbox, clase: "bg-ficha-naranja text-ficha-naranja-foreground", titulo: "Pedido de sucursal" },
  revision_offline: { icono: CloudOff, clase: "bg-aviso/25 text-foreground", titulo: "Revisar venta" },
  evento_por_finalizar: { icono: Trophy, clase: "bg-ficha-verde text-ficha-verde-foreground", titulo: "Reto terminado" },
  caja_abierta: { icono: AlarmClockOff, clase: "bg-aviso/25 text-foreground", titulo: "Caja sin cerrar" },
};
