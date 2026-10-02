"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { PIN_MAX, PIN_MIN, TecladoPin } from "@/components/seguridad/teclado-pin";
import { escribirAlmacen } from "@/lib/almacen";
import { iniciarSesion } from "@/lib/auth/acciones";
import { CLAVE_DESBLOQUEO } from "@/lib/auth/constantes";
import { guardarCredencialLocal } from "@/lib/offline/pin-local";

/** Pausa sin teclear tras la que se prueba solo un PIN de 4 o 5 dígitos (quien sigue escribiendo no la alcanza). */
const PAUSA_PRUEBA_MS = 450;

/**
 * Ingreso solo con el PIN: el servidor reconoce al usuario y lo lleva a su pantalla. Con un PIN válido se entra sin
 * tocar "Ingresar": se prueba solo al llegar a 4 o 5 dígitos (tras una pausa breve) y al instante con 6.
 */
export function FormularioLogin() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intentoError, setIntentoError] = useState(0);
  const [ocupado, iniciar] = useTransition();
  // Lo último tecleado y la prueba automática en curso (para no cruzar respuestas viejas con lo que se escribe ahora).
  const actual = useRef("");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prueba = useRef<Promise<unknown> | null>(null);
  const entrando = useRef(false);

  const cancelarPrueba = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
  };
  useEffect(() => cancelarPrueba, []);

  async function entrar(r: Extract<Awaited<ReturnType<typeof iniciarSesion>>, { ok: true }>, valor: string) {
    entrando.current = true;
    cancelarPrueba();
    // Verificador local para desbloquear sin internet (nunca se guarda el PIN).
    await guardarCredencialLocal(r.usuario, r.usuarioId, valor);
    escribirAlmacen("session", CLAVE_DESBLOQUEO, "1");
    router.replace(r.destino);
    router.refresh();
  }

  /** Prueba silenciosa: si el PIN es válido entra; si no, no molesta (se sigue escribiendo). */
  function probar(valor: string) {
    if (!navigator.onLine || entrando.current) return;
    prueba.current = iniciarSesion({ pin: valor, automatico: true })
      .then(async (r) => {
        if (entrando.current) return;
        if (r.ok) return entrar(r, valor);
        // Solo se avisa si quedó bloqueado por intentos; un PIN aún incompleto no es un error.
        if (actual.current === valor && /Demasiados intentos/.test(r.error)) {
          setError(r.error);
          setIntentoError((n) => n + 1);
          setPin("");
          actual.current = "";
        }
      })
      .catch(() => {});
  }

  function enviar(valor = pin) {
    cancelarPrueba();
    if (entrando.current) return;
    if (!navigator.onLine) {
      setError("Sin conexión: ingresar requiere internet. Si tu sesión seguía abierta, vuelve a la app y desbloquéala con tu PIN.");
      setIntentoError((n) => n + 1);
      return;
    }
    iniciar(async () => {
      // Primero termina la prueba automática anterior: así el servidor ve los dígitos en orden (un solo intento).
      await prueba.current;
      if (entrando.current) return;
      const r = await iniciarSesion({ pin: valor });
      if (r.ok) return entrar(r, valor);
      setError(r.error);
      setIntentoError((n) => n + 1);
      setPin("");
      actual.current = "";
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
          actual.current = v;
          setError(null);
          cancelarPrueba();
          if (ocupado) return;
          // Con el largo máximo se entra al instante; con 4 o 5 dígitos, tras una pausa sin teclear.
          if (v.length === PIN_MAX) enviar(v);
          else if (v.length >= PIN_MIN) temporizador.current = setTimeout(() => actual.current === v && probar(v), PAUSA_PRUEBA_MS);
        }}
        onEnviar={() => enviar()}
        ocupado={ocupado}
        error={error}
        intentoError={intentoError}
      />
    </form>
  );
}
