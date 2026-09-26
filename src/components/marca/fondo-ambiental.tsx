/** Fondo con luces difusas (naranja arriba a la izquierda, verde abajo a la derecha). */
export function FondoAmbiental() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -top-40 -left-40 size-[36rem] rounded-full bg-[var(--brillo-1)] blur-[120px]" />
      <div className="absolute -right-40 -bottom-48 size-[34rem] rounded-full bg-[var(--brillo-2)] blur-[120px]" />
      <div className="absolute top-1/3 left-1/2 size-[22rem] -translate-x-1/2 rounded-full bg-[var(--brillo-3)] blur-[110px]" />
    </div>
  );
}
