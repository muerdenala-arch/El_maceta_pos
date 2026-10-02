"use client";

/* eslint-disable @next/next/no-img-element -- imagen del QR configurado */
import { Banknote, ChevronDown, Loader2, Percent, QrCode, ShieldCheck, TicketPercent, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DialogoAutorizacion, type AutorizacionDada } from "@/components/seguridad/dialogo-autorizacion";
import { cambio, montosSugeridos } from "@/lib/caja/calculos";
import { nivelDescuento } from "@/lib/caja/descuento-manual";
import type { QrCobro } from "@/lib/caja/consultas";
import type { CotizacionCombos } from "@/lib/combos/calculo";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { textoDescuentoCupon } from "@/lib/promociones/cupones";
import type { LineaCarrito, Promocion } from "@/lib/promociones/motor";
import { calcularVenta, mensajeCupon, type CuponVenta } from "@/lib/promociones/venta";
import { nuevoUuid } from "@/lib/uuid";
import type { Instantanea } from "@/lib/offline/base";
import { registrarVentaLocal, type VentaLocalRealizada } from "@/lib/offline/venta-local";
import { buscarClientes, consultarCupon, registrarVenta, type ClienteEncontrado, type VentaRealizada } from "../acciones";

type Props = {
  lineas: LineaCarrito[];
  /** Combos del carrito, ya cotizados (el servidor los vuelve a cotizar con los precios de la BD). */
  combos: CotizacionCombos;
  promociones: Promocion[];
  /** Categoría de un producto (para cupones por categoría sobre los productos de un combo). */
  categoriaDe: (productoId: number) => number | null;
  /** Máximo descuento manual que puede dar por su cuenta quien vende, en % (0 = no puede). */
  descuentoManualMaximo: number;
  /** Hasta qué % puede autorizar el encargado con su PIN; más que eso, solo un administrador. */
  descuentoManualConPin: number;
  /** Copia local: permite vender sin conexión. */
  instantanea: Instantanea | null;
  qrs: QrCobro[];
  onCerrar: () => void;
  onExito: (venta: VentaRealizada | VentaLocalRealizada) => void;
  onError: () => void;
};

export function DialogoCobro({ lineas, combos, promociones, categoriaDe, descuentoManualMaximo, descuentoManualConPin, instantanea, qrs, onCerrar, onExito, onError }: Props) {
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
  const [cupon, setCupon] = useState<CuponVenta | null>(null);
  const [errorCupon, setErrorCupon] = useState<string | null>(null);
  const [validandoCupon, setValidandoCupon] = useState(false);
  const [conManual, setConManual] = useState(false);
  const [porcentajeManual, setPorcentajeManual] = useState("");
  const [motivoManual, setMotivoManual] = useState("");

  const [autorizacion, setAutorizacion] = useState<(AutorizacionDada & { porcentaje: string }) | null>(null);
  const [pidiendoPin, setPidiendoPin] = useState(false);

  // Descuento manual: hasta el máximo de quien vende; por encima, con el PIN del encargado o de un administrador.
  // Siempre con motivo.
  const porcentaje = porcentajeManual.replace(",", ".");
  const porcentajeValido = /^\d{1,3}(\.\d{1,2})?$/.test(porcentaje) && Number(porcentaje) > 0 && Number(porcentaje) <= 100;
  const nivel = nivelDescuento(Number(porcentaje) || 0, { propio: descuentoManualMaximo, encargado: descuentoManualConPin });
  // El permiso vale solo para el porcentaje que se autorizó.
  const autorizado = autorizacion !== null && Number(autorizacion.porcentaje) === Number(porcentaje);
  const manualExcedido = porcentajeValido && nivel !== "libre" && !autorizado;
  const manualActivo = conManual && porcentajeValido && !manualExcedido;
  const manual = manualActivo ? { porcentaje, motivo: motivoManual.trim() } : null;
  const faltaMotivo = manualActivo && motivoManual.trim().length < 4;

  // Mismo cálculo que el servidor: el total mostrado es el que se cobrará.
  const resultado = calcularVenta({ lineas, combos, promociones, cupon, manualPorcentaje: manual?.porcentaje, categoriaDe });
  const total = resultado.total;
  const ahorro = resultado.descuento;
  const estadoCupon = resultado.cupon;
  // Un cupón que no se puede usar en este carrito bloquea el cobro hasta quitarlo (el servidor también lo rechaza).
  const cuponBloquea = estadoCupon?.estado === "minimo" || estadoCupon?.estado === "no_aplica";

  async function aplicarCupon() {
    if (!codigo.trim()) return;
    setValidandoCupon(true);
    setErrorCupon(null);
    try {
      const r = await consultarCupon(codigo);
      if (r.ok) setCupon(r.datos);
      else setErrorCupon(r.error);
    } catch {
      setErrorCupon("No se pudo validar el cupón. Revisa la conexión.");
    } finally {
      setValidandoCupon(false);
    }
  }

  const recibidoNormalizado = recibido.replace(",", ".");
  const vuelto = metodo === "efectivo" && /^\d+(\.\d{1,2})?$/.test(recibidoNormalizado) ? cambio(total, recibidoNormalizado) : null;
  const puedeCobrar = (metodo === "qr" ? qrs.length > 0 : vuelto !== null) && !cuponBloquea && !faltaMotivo && !(conManual && manualExcedido);
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
    if (manual && nivel !== "libre") {
      toast.error("Un descuento autorizado con PIN necesita conexión. Bájalo o quítalo para vender sin internet.");
      return;
    }
    const local = await registrarVentaLocal({
      uuid,
      instantanea,
      calculo: resultado,
      combos,
      descuentoManual: manual,
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
          lineas: lineas.map((l) => ({ productoId: l.productoId, cantidad: l.cantidad, fraccion: !!l.fraccion })),
          combos: combos.combos.map((c) => ({ comboId: c.comboId, cantidad: c.cantidad })),
          cuponCodigo: cupon ? cupon.codigo : "",
          descuentoManual: manual,
          autorizacion: manual && nivel !== "libre" ? (autorizacion?.token ?? null) : null,
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
    <>
    <Dialog open onOpenChange={(v) => !v && !pendiente && onCerrar()}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-extrabold">Cobrar</DialogTitle>
          <DialogDescription>
            Total a cobrar <span className="cifras ml-1 font-display text-2xl font-extrabold text-foreground">{formatoBs(total)}</span>
            {Number(ahorro) > 0 && <span className="cifras ml-2 text-sm font-semibold text-exito">(ahorra {formatoBs(ahorro)})</span>}
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
              Cupón {cupon ? <span className="font-mono text-primary">{cupon.codigo}</span> : <span className="font-normal text-muted-foreground">(opcional)</span>}
              <ChevronDown className={cn("ml-auto size-4 transition-transform", conCupon && "rotate-180")} />
            </button>
            {conCupon && (
              <div className="space-y-2 border-t p-4">
                {cupon && estadoCupon ? (
                  <div
                    role="status"
                    className={cn(
                      "flex items-center gap-3 rounded-xl p-3",
                      estadoCupon.estado === "aplicado" ? "bg-ficha-verde text-ficha-verde-foreground" : cuponBloquea ? "bg-destructive/10 text-destructive" : "bg-muted",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">
                        {cupon.codigo} · {textoDescuentoCupon(cupon, formatoBs)}
                      </p>
                      <p className="text-sm font-semibold">{mensajeCupon(estadoCupon, formatoBs)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Quitar cupón"
                      onClick={() => {
                        setCupon(null);
                        setCodigo("");
                        setErrorCupon(null);
                      }}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Input
                        value={codigo}
                        onChange={(e) => {
                          setCodigo(e.target.value.toUpperCase().replace(/\s/g, ""));
                          setErrorCupon(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            aplicarCupon();
                          }
                        }}
                        placeholder="CÓDIGO"
                        aria-label="Código de cupón"
                        aria-invalid={errorCupon ? true : undefined}
                        maxLength={40}
                        className="font-mono uppercase"
                      />
                      <Button type="button" variant="outline" disabled={!codigo.trim() || validandoCupon} onClick={aplicarCupon}>
                        {validandoCupon ? <Loader2 className="size-4 animate-spin" /> : "Aplicar"}
                      </Button>
                    </div>
                    {errorCupon && (
                      <p className="text-sm font-semibold text-destructive" role="alert">
                        {errorCupon}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {Math.max(descuentoManualMaximo, descuentoManualConPin) > 0 && (
            <div className="rounded-2xl border">
              <button
                type="button"
                onClick={() => setConManual((v) => !v)}
                aria-expanded={conManual}
                className="flex w-full items-center gap-2 px-4 py-3 text-left font-semibold"
              >
                <Percent className="size-5 text-muted-foreground" />
                Descuento manual{" "}
                {manualActivo ? (
                  <span className="cifras text-primary">−{formatoBs(resultado.descuentoManual)}</span>
                ) : (
                  <span className="font-normal text-muted-foreground">
                    {descuentoManualMaximo > 0 ? `(hasta ${descuentoManualMaximo.toLocaleString("es-BO")} %)` : "(con PIN del encargado)"}
                  </span>
                )}
                <ChevronDown className={cn("ml-auto size-4 transition-transform", conManual && "rotate-180")} />
              </button>
              {conManual && (
                <div className="space-y-2 border-t p-4">
                  <div className="flex items-center gap-2">
                    <Input
                      value={porcentajeManual}
                      onChange={(e) => setPorcentajeManual(e.target.value.replace(/[^\d.,]/g, "").slice(0, 6))}
                      inputMode="decimal"
                      placeholder="0"
                      aria-label="Porcentaje de descuento manual"
                      aria-invalid={manualExcedido ? true : undefined}
                      className="cifras w-24 text-lg font-bold"
                    />
                    <span className="font-bold">%</span>
                    {manualActivo && <span className="cifras ml-auto text-sm font-semibold text-exito">−{formatoBs(resultado.descuentoManual)}</span>}
                  </div>
                  {manualExcedido && (
                    <div className="space-y-2 rounded-xl border border-aviso/50 bg-aviso/10 p-3" role="alert">
                      <p className="text-sm font-semibold">
                        {nivel === "pin"
                          ? descuentoManualMaximo > 0
                            ? `Más de ${descuentoManualMaximo.toLocaleString("es-BO")} % necesita el PIN del encargado o de un administrador.`
                            : "Este descuento necesita el PIN del encargado o de un administrador."
                          : `El encargado autoriza hasta ${descuentoManualConPin.toLocaleString("es-BO")} %: este descuento necesita el PIN de un administrador.`}
                      </p>
                      <Button type="button" variant="outline" size="sm" onClick={() => setPidiendoPin(true)}>
                        <ShieldCheck className="size-4" /> Autorizar con PIN
                      </Button>
                    </div>
                  )}
                  {manualActivo && nivel !== "libre" && autorizacion && (
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-exito">
                      <ShieldCheck className="size-4" /> Autorizado por {autorizacion.autorizador}
                    </p>
                  )}
                  <Input
                    value={motivoManual}
                    onChange={(e) => setMotivoManual(e.target.value)}
                    placeholder="Motivo del descuento (obligatorio)"
                    aria-label="Motivo del descuento manual"
                    aria-invalid={faltaMotivo ? true : undefined}
                    maxLength={300}
                  />
                  <p className="text-xs text-muted-foreground">Se aplica sobre el total, después de los demás descuentos. Queda registrado con tu nombre y el motivo.</p>
                </div>
              )}
            </div>
          )}

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
    {pidiendoPin && (
      <DialogoAutorizacion
        titulo="Autorizar descuento"
        descripcion={
          <>
            Descuento manual de <strong>{Number(porcentaje).toLocaleString("es-BO")} %</strong> sobre esta venta.
          </>
        }
        proposito="descuento"
        referencia={uuid}
        porcentaje={porcentaje}
        onCerrar={() => setPidiendoPin(false)}
        onAutorizado={(a) => {
          setAutorizacion({ ...a, porcentaje });
          setPidiendoPin(false);
        }}
      />
    )}
    </>
  );
}
