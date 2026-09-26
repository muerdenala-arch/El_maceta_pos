"use client";

import { LogOut } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { FondoAmbiental } from "@/components/marca/fondo-ambiental";
import { Logo } from "@/components/marca/logo";
import { escribirAlmacen, leerAlmacen } from "@/lib/almacen";
import { cerrarSesion, desbloquear } from "@/lib/auth/acciones";
import { CLAVE_DESBLOQUEO, MINUTOS_INACTIVIDAD } from "@/lib/auth/constantes";
import { guardarCredencialLocal, verificarPinLocal } from "@/lib/offline/pin-local";
import { TecladoPin } from "./teclado-pin";

const EVENTOS_ACTIVIDAD = ["pointerdown", "keydown", "touchstart", "wheel", "mousemove"] as const;
const LIMITE_MS = MINUTOS_INACTIVIDAD * 60_000;

type Props = {
  nombre: string;
  /** Nombre de usuario e id: para validar el PIN sin conexión contra la copia local. */
  usuario: string;
  usuarioId: number;
  marca: { nombre: string; logoUrl: string | null };
  children: React.ReactNode;
};

/**
 * Bloqueo de sesión (sección 7):
 * - tras MINUTOS_INACTIVIDAD sin interacción muestra una capa que pide el PIN;
 * - al reabrir la app (sessionStorage vacío) también la pide.
 * El contenido sigue montado debajo (con `inert`), así el carrito en curso no se pierde.
 */
export function GuardiaBloqueo({ nombre, usuario, usuarioId, marca, children }: Props) {
  // null = aún no se leyó sessionStorage (primer render): se tapa la pantalla para no mostrar datos.
  const [bloqueado, setBloqueado] = useState<boolean | null>(null);
  const ultimaActividad = useRef(0);

  const bloquear = useCallback(() => {
    escribirAlmacen("session", CLAVE_DESBLOQUEO, "0");
    setBloqueado(true);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage solo existe en el cliente
    setBloqueado(leerAlmacen("session", CLAVE_DESBLOQUEO) !== "1");
  }, []);

  useEffect(() => {
    if (bloqueado !== false) return;
    ultimaActividad.current = Date.now();
    const marcar = () => {
      ultimaActividad.current = Date.now();
    };
    // Se compara contra la hora real (no un setTimeout largo), porque los navegadores
    // pausan los temporizadores de pestañas en segundo plano o con el celular suspendido.
    const revisar = () => {
      if (Date.now() - ultimaActividad.current >= LIMITE_MS) bloquear();
    };
    EVENTOS_ACTIVIDAD.forEach((e) => window.addEventListener(e, marcar, { passive: true }));
    document.addEventListener("visibilitychange", revisar);
    const intervalo = window.setInterval(revisar, 15_000);
    return () => {
      EVENTOS_ACTIVIDAD.forEach((e) => window.removeEventListener(e, marcar));
      document.removeEventListener("visibilitychange", revisar);
      window.clearInterval(intervalo);
    };
  }, [bloqueado, bloquear]);

  return (
    <>
      <div inert={bloqueado !== false} aria-hidden={bloqueado !== false} className="contents">
        {children}
      </div>
      {bloqueado === null && <div className="fixed inset-0 z-[100] bg-background" />}
      <AnimatePresence>
        {bloqueado && (
          <PantallaBloqueo
            nombre={nombre}
            usuario={usuario}
            usuarioId={usuarioId}
            marca={marca}
            onDesbloqueado={() => {
              escribirAlmacen("session", CLAVE_DESBLOQUEO, "1");
              setBloqueado(false);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function PantallaBloqueo({
  nombre,
  usuario,
  usuarioId,
  marca,
  onDesbloqueado,
}: {
  nombre: string;
  usuario: string;
  usuarioId: number;
  marca: Props["marca"];
  onDesbloqueado: () => void;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [intentoError, setIntentoError] = useState(0);
  const [ocupado, iniciar] = useTransition();

  const irAlLogin = () => {
    escribirAlmacen("session", CLAVE_DESBLOQUEO, null);
    router.replace("/login");
    router.refresh();
  };

  const fallar = (mensaje: string) => {
    setPin("");
    setError(mensaje);
    setIntentoError((n) => n + 1);
  };

  /** Sin conexión: contra el verificador guardado en el dispositivo (sección 8 del plan). */
  const desbloquearSinConexion = async () => {
    const r = await verificarPinLocal(usuario, pin).catch(() => "sin-credencial" as const);
    if (r === "ok") return onDesbloqueado();
    if (r === "incorrecto") return fallar("PIN incorrecto");
    if (r === "bloqueado") return fallar("Demasiados intentos sin conexión: conéctate a internet para desbloquear.");
    fallar("Sin conexión y sin PIN guardado en este dispositivo: conéctate para desbloquear.");
  };

  const enviar = () =>
    iniciar(async () => {
      if (!navigator.onLine) return desbloquearSinConexion();
      let r;
      try {
        r = await desbloquear(pin);
      } catch {
        return desbloquearSinConexion(); // la red se cortó en el intento
      }
      if (r.ok) {
        await guardarCredencialLocal(usuario, usuarioId, pin);
        return onDesbloqueado();
      }
      fallar(r.error);
      if (r.sesionCerrada) setTimeout(irAlLogin, 2500);
    });

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Pantalla bloqueada"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] isolate flex overflow-y-auto bg-background/95 p-4 backdrop-blur-md"
    >
      <FondoAmbiental />
      <div className="m-auto w-full max-w-[26rem] rounded-[2rem] border bg-card/90 px-7 pt-8 pb-7 shadow-2xl sm:px-8">
        <div className="flex flex-col items-center text-center">
          <Logo nombre={marca.nombre} url={marca.logoUrl} className="size-20 p-1" />
          <p className="mt-4 text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Sesión bloqueada
          </p>
          <h2 className="mt-1 text-2xl font-extrabold">{nombre}</h2>
          <p className="mt-5 mb-3 text-sm font-semibold text-muted-foreground">Ingresa tu PIN para continuar</p>
        </div>
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
          textoBoton="Desbloquear"
        />
        <button
          type="button"
          onClick={() => iniciar(async () => {
            await cerrarSesion();
            irAlLogin();
          })}
          className="mx-auto mt-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <LogOut className="size-4" />
          ¿No eres tú? Cerrar sesión
        </button>
      </div>
    </motion.div>
  );
}
