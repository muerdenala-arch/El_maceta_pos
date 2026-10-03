/**
 * Resumen del día para enviar por WhatsApp (puro; probado en resumen-texto.test.ts). Lo arma el servidor con los
 * mismos números de Reportes y lo entrega a la automatización (n8n) ya redactado, con el formato de WhatsApp
 * (*negrita*). Solo cuentan ventas completadas y gastos no anulados.
 */
import { aCentavos, restar } from "@/lib/dinero";
import { fechaLarga, formatoBs } from "@/lib/formato";

export type ResumenDiario = {
  fecha: string;
  negocio: string;
  ventas: { cantidad: number; total: string; efectivo: string; qr: string; descuentos: string; anuladas: number; totalAnuladas: string; qrPorConfirmar: number };
  ganancia: string;
  gastos: { total: string; cantidad: number };
  /** Solo cuando hay más de una sucursal. */
  porSucursal: { sucursal: string; cantidad: number; total: string }[];
  masVendidos: { nombre: string; unidades: number; sueltas: number; neto: string }[];
  cajasAbiertas: { cajero: string; sucursal: string; esperado: string }[];
  cajasConDiferencia: { cajero: string; sucursal: string; diferencia: string }[];
  alertasPendientes: number;
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function textoResumenDiario(r: ResumenDiario): string {
  const lineas: string[] = [`*${r.negocio} — Resumen del ${fechaLarga(r.fecha)}*`, ""];

  if (r.ventas.cantidad === 0) {
    lineas.push("*Ventas:* no hubo ventas");
  } else {
    lineas.push(`*Ventas:* ${formatoBs(r.ventas.total)} (${plural(r.ventas.cantidad, "venta", "ventas")})`);
    lineas.push(`• Efectivo: ${formatoBs(r.ventas.efectivo)}`);
    lineas.push(`• QR: ${formatoBs(r.ventas.qr)}${r.ventas.qrPorConfirmar ? ` (${r.ventas.qrPorConfirmar} por confirmar)` : ""}`);
    if (aCentavos(r.ventas.descuentos) > 0n) lineas.push(`• Descuentos dados: ${formatoBs(r.ventas.descuentos)}`);
  }
  if (r.ventas.anuladas) lineas.push(`• Anuladas: ${r.ventas.anuladas} (${formatoBs(r.ventas.totalAnuladas)})`);
  if (r.ventas.cantidad > 0) lineas.push(`*Ganancia:* ${formatoBs(r.ganancia)}`);
  lineas.push(r.gastos.cantidad ? `*Gastos:* ${formatoBs(r.gastos.total)} (${r.gastos.cantidad})` : "*Gastos:* ninguno");
  if (r.ventas.cantidad > 0 || r.gastos.cantidad > 0) lineas.push(`*Queda del día:* ${formatoBs(restar(r.ganancia, r.gastos.total))} (ganancia − gastos)`);

  if (r.porSucursal.length > 1) {
    lineas.push("", "*Por sucursal*");
    for (const s of r.porSucursal) lineas.push(`• ${s.sucursal}: ${formatoBs(s.total)} (${s.cantidad})`);
  }
  if (r.masVendidos.length) {
    lineas.push("", "*Más vendidos*");
    r.masVendidos.forEach((p, i) => {
      const cantidad = [p.unidades ? `${p.unidades} u` : null, p.sueltas ? plural(p.sueltas, "suelta", "sueltas") : null].filter(Boolean).join(" + ");
      lineas.push(`${i + 1}. ${p.nombre} — ${cantidad} · ${formatoBs(p.neto)}`);
    });
  }
  if (r.cajasAbiertas.length || r.cajasConDiferencia.length) {
    lineas.push("", "*Cajas*");
    for (const c of r.cajasConDiferencia) {
      const falta = aCentavos(c.diferencia) < 0n;
      lineas.push(`• ${c.cajero} (${c.sucursal}): ${falta ? "faltan" : "sobran"} ${formatoBs(c.diferencia.replace("-", ""))}`);
    }
    for (const c of r.cajasAbiertas) lineas.push(`• Sin cerrar: ${c.cajero} (${c.sucursal}), esperado ${formatoBs(c.esperado)}`);
  }
  if (r.alertasPendientes) lineas.push("", `*Alertas pendientes:* ${r.alertasPendientes}`);
  return lineas.join("\n");
}
