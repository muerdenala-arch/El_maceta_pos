"use client";

/* eslint-disable @next/next/no-img-element -- imagen del QR configurado */
import { Banknote, ChevronDown, Loader2, QrCode, TicketPercent, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cambio, montosSugeridos } from "@/lib/caja/calculos";
import type { QrCobro } from "@/lib/caja/consultas";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { aplicarPromociones, type LineaCarrito, type Promocion } from "@/lib/promociones/motor";
import { nuevoUuid } from "@/lib/uuid";
import type { Instantanea } from "@/lib/offline/base";
import { registrarVentaLocal, type VentaLocalRealizada } from "@/lib/offline/venta-local";
import { buscarClientes, consultarCupon, registrarVenta, type ClienteEncontrado, type VentaRealizada } from "../acciones";

type Props = {
  lineas: LineaCarrito[];
  promociones: Promocion[];
  /** Copia local: permite vender sin conexión. */
  instantanea: Instantanea | null;
  qrs: QrCobro[];
  onCerrar: () => void;
  onExito: (venta: VentaRealizada | VentaLocalRealizada) => void;
  onError: () => void;
};

export function DialogoCobro({ lineas, promociones, instantanea, qrs, onCerrar, onExito, onError }: Props) {
  // Un UUID por intento de cobro: si se pulsa dos veces o se reintenta, el servidor no duplica la venta.
  const [uuid] = useState(nuevoUuid);
  const [metodo, setMetodo] = useState<"efectivo" | "qr">("efectivo");
  const [recibido, setRecibido] = useState("");
  const [qrElegido, setQrElegido] = useState(qrs[0]?.id ?? null);
  const [conCliente, setConCliente] = useState(false);
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [sugerencias, setSugerencias] = useState<ClienteEncontrado[]>([]);
  const [pendiente, iniciar] = useTransition();
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [conCupon, setConCupon] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [cupon, setCupon] = useState<Promocion | null>(null);
  const [validandoCupon, setValidandoCupon] = useState(false);

  // Mismo motor que el servidor: el total mostrado es el que se cobrará.
  const resultado = aplicarPromociones(lineas, cupon ? [...promociones, cupon] : promociones);
  const total = resultado.total;
  const cuponAplicado = resultado.aplicadas.find((a) => a.cuponId);

  async function aplicarCupon() {
    if (!codigo.trim()) return;
    setValidandoCupon(true);
    try {
      const r = await consultarCupon(codigo);
      if (r.ok) setCupon(r.datos);
      else toast.error(r.error);
    } catch {
      toast.error("No se pudo validar el cupón. Revisa la conexión.");
    } finally {
      setValidandoCupon(false);
    }
  }

  const recibidoNormalizado = recibido.replace(",", ".");
  const vuelto = metodo === "efectivo" && /^\d+(\.\d{1,2})?$/.test(recibidoNormalizado) ? cambio(total, recibidoNormalizado) : null;
  const puedeCobrar = metodo === "qr" ? qrs.length > 0 : vuelto !== null;
  const qr = qrs.find((q) => q.id === qrElegido);

  // Búsqueda de clientes existentes (con pausa para no consultar en cada tecla).
  const consulta = (clienteTelefono || clienteNombre).trim();
  const ultimaConsulta = useRef("");
  useEffect(() => {
    if (!conCliente || consulta.length < 2) return;
    const t = setTimeout(async () => {
      ultimaConsulta.current = consulta;
      const r = await buscarClientes(consulta);
      if (ultimaConsulta.current === consulta) setSugerencias(r);
    }, 300);
    return () => clearTimeout(t);
  }, [consulta, conCliente]);

  /** Sin conexión: la venta queda en la cola del dispositivo con el mismo UUID (sin duplicados al sincronizar). */
  async function cobrarSinConexion() {
    if (cupon) {
      toast.error("Los cupones necesitan conexión. Quita el cupón para vender sin internet.");
      return;
    }
    if (!instantanea) {
      toast.error("No hay datos guardados en este dispositivo para vender sin conexión. Conéctate una vez para descargarlos.");
      return;
    }
    const local = await registrarVentaLocal({
      uuid,
      instantanea,
      promo: resultado,
      metodoPago: metodo,
      montoRecibido: metodo === "efectivo" ? recibidoNormalizado : null,
      cambio: metodo === "efectivo" ? vuelto : null,
      clienteNombre: conCliente ? clienteNombre.trim() : "",
      clienteTelefono: conCliente ? clienteTelefono.trim() : "",
    });
    onExito(local);
  }

  function cobrar() {
    if (!puedeCobrar || pendiente) return;
    iniciar(async () => {
      if (!navigator.onLine) return cobrarSinConexion();
      try {
        const r = await registrarVenta({
          uuid,
          lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad })),
          cuponCodigo: cupon ? codigo : "",
          metodoPago: metodo,
          montoRecibido: metodo === "efectivo" ? recibidoNormalizado : null,
          clienteNombre: conCliente ? clienteNombre : "",
          clienteTelefono: conCliente ? clienteTelefono : "",
        });
        if (r.ok) return onExito(r.datos);
        setErrores(r.campos ?? {});
        toast.error(r.error);
        onError();
      } catch {
        // Se cortó la red durante el cobro: se guarda en el dispositivo. Si el servidor alcanzó a
        // registrarla, al sincronizar devolverá la misma venta (mismo UUID) y no habrá duplicado.
        await cobrarSinConexion();
      }
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && !pendiente && onCerrar()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">Cobrar</DialogTitle>
          <DialogDescription>
            Total a cobrar <span className="cifras ml-1 font-display text-2xl font-extrabold text-foreground">{formatoBs(total)}</span>
            {Number(resultado.descuento) > 0 && (
              <span className="cifras ml-2 text-sm font-semibold text-exito">(ahorra {formatoBs(resultado.descuento)})</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            cobrar();
          }}
        >
          <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-2 gap-2">
            {(
              [
                { valor: "efectivo", titulo: "Efectivo", icono: Banknote },
                { valor: "qr", titulo: "QR", icono: QrCode },
              ] as const
            ).map(({ valor, titulo, icono: Icono }) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={metodo === valor}
                onClick={() => setMetodo(valor)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-2xl border-2 py-4 text-lg font-bold transition-colors",
                  metodo === valor ? "border-primary bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent",
                )}
              >
                <Icono className="size-6" /> {titulo}
              </button>
            ))}
          </div>

          {metodo === "efectivo" ? (
            <div className="space-y-3">
              <label htmlFor="recibido" className="font-semibold">
                Monto recibido
              </label>
              <div className="flex items-center rounded-2xl border bg-background px-4 focus-within:ring-3 focus-within:ring-ring/50">
                <span className="font-display text-xl font-bold text-muted-foreground">Bs</span>
                <input
                  id="recibido"
                  value={recibido}
                  onChange={(e) => setRecibido(e.target.value.replace(/[^\d.,]/g, "").slice(0, 10))}
                  inputMode="decimal"
                  autoFocus
                  placeholder="0,00"
                  aria-invalid={errores.montoRecibido ? true : undefined}
                  className="cifras h-14 w-full bg-transparent px-3 font-display text-3xl font-extrabold outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {montosSugeridos(total).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setRecibido(m.replace(".", ","))}
                    className="cifras rounded-full border px-4 py-2 text-sm font-bold transition-colors hover:bg-accent"
                  >
                    {m === total ? "Exacto" : formatoBs(m)}
                  </button>
                ))}
              </div>
              <div
                className={cn(
                  "flex items-center justify-between rounded-2xl p-4",
                  vuelto !== null ? "bg-ficha-verde text-ficha-verde-foreground" : "bg-muted text-muted-foreground",
                )}
                aria-live="polite"
              >
                <span className="font-bold">Cambio</span>
                <span className="cifras font-display text-3xl font-extrabold">
                  {vuelto !== null ? formatoBs(vuelto) : recibido ? "No alcanza" : "—"}
                </span>
              </div>
            </div>
          ) : qrs.length === 0 ? (
            <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
              No hay un QR de cobro configurado para esta sucursal. Pide al administrador que lo cargue en “QR de cobro”.
            </p>
          ) : (
            <div className="space-y-3">
              {qrs.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {qrs.map((q) => (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setQrElegido(q.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm font-semibold",
                        qrElegido === q.id ? "border-transparent bg-nav-activo text-nav-activo-foreground" : "hover:bg-accent",
                      )}
                    >
                      {q.nombre}
                    </button>
                  ))}
                </div>
              )}
              {qr && (
                <figure className="mx-auto max-w-72 rounded-3xl bg-white p-4 text-center shadow-sm">
                  <img src={qr.imagenUrl} alt={`QR de cobro ${qr.nombre}`} className="mx-auto aspect-square w-full object-contain" />
                  <figcaption className="mt-2 text-sm font-semibold text-neutral-700">{qr.nombre}</figcaption>
                </figure>
              )}
              <p className="text-center text-sm text-muted-foreground">
                Muestra el QR al cliente y confirma cuando veas el pago de <strong className="text-foreground">{formatoBs(total)}</strong>.
              </p>
            </div>
          )}

          <div className="rounded-2xl border">
            <button
              type="button"
              onClick={() => setConCupon((v) => !v)}
              aria-expanded={conCupon}
              className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold"
            >
              <TicketPercent className="size-5 text-muted-foreground" />
              Cupón {cupon ? <span className="font-mono text-primary">{codigo}</span> : <span className="font-normal text-muted-foreground">(opcional)</span>}
              <ChevronDown className={cn("ml-auto size-4 transition-transform", conCupon && "rotate-180")} />
            </button>
            {conCupon && (
              <div className="space-y-2 border-t p-4">
                {cupon ? (
                  <div className="flex items-center gap-3 rounded-xl bg-muted p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{cupon.nombre}</p>
                      <p className={cn("text-sm", cuponAplicado ? "font-semibold text-exito" : "text-muted-foreground")}>
                        {cuponAplicado
                          ? `Descuento: ${formatoBs(cuponAplicado.descuento)}`
                          : "No mejora las promociones actuales: no se usará"}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" aria-label="Quitar cupón" onClick={() => { setCupon(null); setCodigo(""); }}>
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={codigo}
                      onChange={(e) => setCodigo(e.target.value.toUpperCase().replace(/\s/g, ""))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          aplicarCupon();
                        }
                      }}
                      placeholder="CÓDIGO"
                      aria-label="Código de cupón"
                      maxLength={40}
                      className="font-mono uppercase"
                    />
                    <Button type="button" variant="outline" disabled={!codigo.trim() || validandoCupon} onClick={aplicarCupon}>
                      {validandoCupon ? <Loader2 className="size-4 animate-spin" /> : "Aplicar"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border">
            <button
              type="button"
              onClick={() => setConCliente((v) => !v)}
              aria-expanded={conCliente}
              className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold"
            >
              <UserRound className="size-5 text-muted-foreground" />
              Datos del cliente <span className="font-normal text-muted-foreground">(opcional)</span>
              <ChevronDown className={cn("ml-auto size-4 transition-transform", conCliente && "rotate-180")} />
            </button>
            {conCliente && (
              <div className="space-y-2 border-t p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre" aria-label="Nombre del cliente" maxLength={120} />
                  <Input
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value)}
                    placeholder="Celular"
                    aria-label="Celular del cliente"
                    type="tel"
                    inputMode="tel"
                    aria-invalid={errores.clienteTelefono ? true : undefined}
                  />
                </div>
                {errores.clienteTelefono && <p className="text-sm text-destructive">{errores.clienteTelefono}</p>}
                {sugerencias.length > 0 && consulta.length >= 2 && (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Clientes encontrados">
                    {sugerencias.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setClienteNombre(c.nombre ?? "");
                            setClienteTelefono(c.telefono ?? "");
                            setSugerencias([]);
                          }}
                          className="rounded-full border px-3 py-1 text-xs font-semibold hover:bg-accent"
                        >
                          {c.nombre ?? "Sin nombre"} {c.telefono && <span className="cifras text-muted-foreground">· {c.telefono}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-muted-foreground">Sirve para enviarle el comprobante por WhatsApp.</p>
              </div>
            )}
          </div>

          <Button type="submit" size="lg" disabled={!puedeCobrar || pendiente} className="h-14 w-full rounded-2xl text-lg font-bold">
            {pendiente ? "Registrando…" : metodo === "qr" ? "Pago QR recibido · Confirmar" : "Confirmar venta"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
