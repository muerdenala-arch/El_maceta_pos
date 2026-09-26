/* eslint-disable @next/next/no-img-element -- logo propio */
import { fechaHoraComprobante, numeroComprobante, type DatosComprobante, type TamanoImpresion } from "@/lib/comprobante/datos";
import { formatoBs } from "@/lib/formato";
import { cn } from "@/lib/utils";

/**
 * Comprobante de venta con aspecto de papel (siempre negro sobre blanco, también en modo oscuro).
 * Térmica: ancho imprimible de 48 mm (rollo de 58) o 72 mm (rollo de 80). Carta: tabla completa.
 */
export function Comprobante({ datos, tamano }: { datos: DatosComprobante; tamano: TamanoImpresion }) {
  const { negocio, sucursal, venta } = datos;
  const termica = tamano !== "carta";

  return (
    <article
      className={cn(
        "comprobante bg-white text-black",
        termica ? "px-1 py-2 font-mono leading-snug" : "p-2 font-sans leading-normal",
        tamano === "58mm" && "text-[9px]",
        tamano === "80mm" && "text-[11px]",
        tamano === "carta" && "text-[12px]",
      )}
      style={{ width: tamano === "58mm" ? "48mm" : tamano === "80mm" ? "72mm" : "100%" }}
    >
      <header className={cn("text-center", !termica && "flex items-start justify-between gap-6 text-left")}>
        <div className={cn(termica ? "flex flex-col items-center" : "flex items-center gap-4")}>
          {negocio.logoUrl && (
            <img
              src={negocio.logoUrl}
              alt=""
              className={cn("object-contain", termica ? "mb-1 h-14 w-14 grayscale" : "h-20 w-20")}
            />
          )}
          <div>
            <p className={cn("font-bold uppercase", termica ? "text-[1.35em]" : "text-2xl")}>{negocio.nombre}</p>
            {negocio.nit && <p>NIT {negocio.nit}</p>}
            <p>{sucursal.nombre}</p>
            {sucursal.direccion && <p>{sucursal.direccion}</p>}
            {sucursal.telefono && <p>Tel. {sucursal.telefono}</p>}
          </div>
        </div>
        <div className={cn(termica ? "mt-2" : "text-right")}>
          <p className="font-bold">NOTA DE VENTA</p>
          <p className="font-bold">N.º {numeroComprobante(venta.numero)}</p>
          <p>{fechaHoraComprobante(venta.fecha)}</p>
        </div>
      </header>

      {venta.anulada && (
        <p className="my-2 border-2 border-black py-1 text-center text-[1.2em] font-bold">*** VENTA ANULADA ***</p>
      )}

      <Separador termica={termica} />
      <div className={cn(!termica && "grid grid-cols-2 gap-x-6")}>
        <p>Cajero: {venta.cajero}</p>
        {venta.cliente?.nombre && <p>Cliente: {venta.cliente.nombre}</p>}
        {venta.cliente?.telefono && <p>Cel.: {venta.cliente.telefono}</p>}
      </div>
      <Separador termica={termica} />

      {termica ? (
        <ul className="space-y-1">
          {venta.lineas.map((l, i) => (
            <li key={i}>
              <p className="font-bold">{l.nombre}</p>
              {l.detalle && <p className="text-[0.9em]">{l.detalle}</p>}
              <p className="flex justify-between gap-2">
                <span>
                  {l.cantidad} x {formatoBs(l.precioUnitario)}
                </span>
                <span>{formatoBs(l.subtotal)}</span>
              </p>
              {Number(l.descuento) > 0 && (
                <p className="flex justify-between gap-2">
                  <span className="truncate">{l.promocion ?? "Descuento"}</span>
                  <span>−{formatoBs(l.descuento)}</span>
                </p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1">Producto</th>
              <th className="py-1 text-right">Cant.</th>
              <th className="py-1 text-right">P. unit.</th>
              <th className="py-1 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {venta.lineas.map((l, i) => (
              <tr key={i} className="border-b border-neutral-300 align-top">
                <td className="py-1">
                  <span className="font-semibold">{l.nombre}</span>
                  {l.detalle && <span className="block text-[0.9em] text-neutral-600">{l.detalle}</span>}
                </td>
                <td className="py-1 text-right">{l.cantidad}</td>
                <td className="py-1 text-right">{formatoBs(l.precioUnitario)}</td>
                <td className="py-1 text-right">
                  {formatoBs(l.subtotal)}
                  {Number(l.descuento) > 0 && (
                    <span className="block text-[0.85em] text-neutral-600">
                      {l.promocion ?? "Desc."} −{formatoBs(l.descuento)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Separador termica={termica} />
      <div className={cn("space-y-0.5", !termica && "ml-auto w-72")}>
        {Number(venta.descuento) > 0 && (
          <>
            <Fila etiqueta="Subtotal" valor={formatoBs(venta.subtotal)} />
            <Fila etiqueta="Descuentos" valor={`−${formatoBs(venta.descuento)}`} />
            {venta.cupon && <Fila etiqueta="Cupón" valor={venta.cupon} />}
          </>
        )}
        <Fila etiqueta="TOTAL" valor={formatoBs(venta.total)} fuerte />
        <Fila etiqueta="Pago" valor={venta.metodoPago === "efectivo" ? "Efectivo" : venta.estadoPago === "qr_por_confirmar" ? "QR (por confirmar)" : "QR"} />
        {venta.metodoPago === "efectivo" && venta.montoRecibido && (
          <>
            <Fila etiqueta="Recibido" valor={formatoBs(venta.montoRecibido)} />
            <Fila etiqueta="Cambio" valor={formatoBs(venta.cambio ?? "0")} />
          </>
        )}
      </div>
      <Separador termica={termica} />

      <footer className="text-center">
        <p className="font-bold">{negocio.mensajeAgradecimiento}</p>
        <p className="mt-1 text-[0.85em]">Documento no válido como factura fiscal</p>
      </footer>
    </article>
  );
}

function Separador({ termica }: { termica: boolean }) {
  return <hr className={cn("my-1.5 border-black", termica ? "border-dashed" : "my-3 border-neutral-300")} />;
}

function Fila({ etiqueta, valor, fuerte }: { etiqueta: string; valor: string; fuerte?: boolean }) {
  return (
    <p className={cn("flex justify-between gap-3", fuerte && "text-[1.3em] font-bold")}>
      <span>{etiqueta}</span>
      <span>{valor}</span>
    </p>
  );
}
