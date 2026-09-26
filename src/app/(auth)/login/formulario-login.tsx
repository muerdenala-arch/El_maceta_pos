"use client";

import { UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { TecladoPin } from "@/components/seguridad/teclado-pin";
import { escribirAlmacen, leerAlmacen } from "@/lib/almacen";
import { iniciarSesion } from "@/lib/auth/acciones";
import { CLAVE_DESBLOQUEO, CLAVE_ULTIMO_USUARIO } from "@/lib/auth/constantes";

export function FormularioLogin() {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intentoError, setIntentoError] = useState(0);
  const [ocupado, iniciar] = useTransition();

  // Recordar el usuario del dispositivo: en el día a día solo se escribe el PIN.
  useEffect(() => {
    const ultimo = leerAlmacen("local", CLAVE_ULTIMO_USUARIO);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage solo existe en el cliente
    if (ultimo) setUsuario(ultimo);
  }, []);

  function enviar() {
    if (!usuario.trim()) {
      setError("Ingresa tu usuario");
      setIntentoError((n) => n + 1);
      return;
    }
    iniciar(async () => {
      const r = await iniciarSesion({ usuario, pin });
      if (r.ok) {
        escribirAlmacen("local", CLAVE_ULTIMO_USUARIO, usuario.trim().toLowerCase());
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
      <label className="relative block">
        <span className="sr-only">Usuario</span>
        <UserRound className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={usuario}
          onChange={(e) => {
            setUsuario(e.target.value);
            setError(null);
          }}
          name="usuario"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Usuario"
          className="h-12 w-full rounded-xl border bg-secondary/60 pr-4 pl-12 text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
        />
      </label>

      <p className="mt-6 mb-3 text-center text-sm font-semibold text-muted-foreground">Ingresa tu PIN</p>
      <TecladoPin
        valor={pin}
        onCambiar={(v) => {
          setPin(v);
          setError(null);
        }}
        onEnviar={enviar}
        ocupado={ocupado}
        error={error}
        intentoError={intentoError}
      />
    </form>
  );
}
