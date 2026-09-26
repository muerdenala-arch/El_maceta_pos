import { useId } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Etiqueta + control + mensaje de error/ayuda. El control recibe id y aria-* por render prop,
 * para que el lector de pantalla asocie la etiqueta y el error.
 */
export function Campo({
  etiqueta,
  error,
  ayuda,
  opcional,
  className,
  children,
}: {
  etiqueta: string;
  error?: string;
  ayuda?: React.ReactNode;
  opcional?: boolean;
  className?: string;
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => React.ReactNode;
}) {
  const id = useId();
  const idMensaje = `${id}-mensaje`;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="font-semibold">
        {etiqueta}
        {opcional && <span className="font-normal text-muted-foreground">(opcional)</span>}
      </Label>
      {children({
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error || ayuda ? idMensaje : undefined,
      })}
      {error ? (
        <p id={idMensaje} className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : (
        ayuda && (
          <p id={idMensaje} className="text-xs text-muted-foreground">
            {ayuda}
          </p>
        )
      )}
    </div>
  );
}
