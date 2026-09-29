/** Textos del Torneo de Pulseada compartidos por pantallas, PDF y Excel. */
import type { Formato } from "./pulseada";

export const FORMATOS: Record<Formato, { titulo: string; ayuda: string }> = {
  eliminacion_directa: {
    titulo: "Eliminación directa",
    ayuda: "Quien pierde queda fuera. Al final, combate por el 3.er lugar. Rápido y fácil de seguir.",
  },
  doble_eliminacion: {
    titulo: "Doble eliminación",
    ayuda: "Hay que perder 2 veces para quedar fuera (llave de perdedores y gran final). Más justo, más largo.",
  },
  todos_contra_todos: {
    titulo: "Todos contra todos",
    ayuda: "Cada uno compite con todos y suma puntos por victoria. Ideal para grupos chicos (hasta 6–8).",
  },
};
