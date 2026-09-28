"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PIN_MAX, TecladoPin } from "@/components/seguridad/teclado-pin";
import { escribirAlmacen } from "@/lib/almacen";
import { iniciarSesion } from "@/lib/auth/acciones";
import { CLAVE_DESBLOQUEO } from "@/lib/auth/constantes";
import { guardarCredencialLocal } from "@/lib/offline/pin-local";

/** Ingreso solo con el PIN: el servidor reconoce al usuario y lo lleva a su pantalla. */
export function FormularioLogin() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intentoError, setIntentoError] = useState(0);
  const [ocupado, iniciar] = useTransition();

  function enviar(valor = pin) {
    if (!navigator.onLine) {
      setError("Sin conexión: ingresar requiere internet. Si tu sesión seguía abierta, vuelve a la app y desbloquéala con tu PIN.");
      setIntentoError((n) => n + 1);
      return;
    }
    iniciar(async () => {
      const r = await iniciarSesion({ pin: valor });
      if (r.ok) {
        // Verificador local para desbloquear sin internet (nunca se guarda el PIN).
        await guardarCredencialLocal(r.usuario, r.usuarioId, valor);
        escribirAlmacen("session", CLAVE_DESBLOQUEO, "1");
        router.replace(r.destino);
        router.refresh();
      } else {
        setError(r.error);
        setIntentoError((n) => n + 1);
        setPin("");
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      <p className="mb-3 text-center text-sm font-semibold text-muted-foreground">Ingresa tu PIN</p>
      <TecladoPin
        valor={pin}
        onCambiar={(v) => {
          setPin(v);
          setError(null);
          // Con el largo máximo se entra solo, sin tocar "Ingresar".
          if (v.length === PIN_MAX && !ocupado) enviar(v);
        }}
        onEnviar={() => enviar()}
        ocupado={ocupado}
        error={error}
        intentoError={intentoError}
      />
    </form>
  );
}
