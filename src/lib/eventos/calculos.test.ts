import { describe, expect, it } from "vitest";
import { esquemaParticipante, esquemaPesajes, pesoKg } from "@/lib/validaciones/eventos";
import {
  aCentikg,
  cambioSospechoso,
  diasRestantes,
  evolucion,
  kilosPerdidos,
  porcentajePerdido,
  tablaPosiciones,
  textoKilos,
  textoPorcentaje,
  type PesajeCalculo,
} from "./calculos";

describe("kilos y porcentaje perdido", () => {
  it("kilos = inicial − último; porcentaje = kilos ÷ inicial × 100 con 2 decimales", () => {
    expect(kilosPerdidos(aCentikg("90.00"), aCentikg("85.50"))).toBe(450);
    expect(porcentajePerdido(aCentikg("90"), aCentikg("85.5"))).toBe(500); // 5,00 %
    expect(porcentajePerdido(aCentikg("87.3"), aCentikg("84.1"))).toBe(367); // 3,2/87,3 = 3,6655… → 3,67
    expect(porcentajePerdido(aCentikg("120"), aCentikg("119"))).toBe(83); // 0,8333… → 0,83
    expect(textoPorcentaje(367)).toBe("3,67 %");
    expect(textoKilos(450)).toBe("4,50 kg");
  });

  it("si subió de peso, kilos y porcentaje son negativos", () => {
    expect(kilosPerdidos(8000, 8150)).toBe(-150);
    expect(porcentajePerdido(8000, 8150)).toBe(-188); // −1,875 → −1,88
    expect(textoKilos(-150)).toBe("−1,50 kg");
  });

  it("acepta comas y evita errores de coma flotante", () => {
    expect(aCentikg("85,55")).toBe(8555);
    expect(aCentikg(70.1)).toBe(7010);
  });

  it("detecta cambios de más de 10 % y cuenta los días que faltan", () => {
    expect(cambioSospechoso(8000, 8800)).toBe(false); // justo 10 %
    expect(cambioSospechoso(8000, 7100)).toBe(true);
    expect(diasRestantes("2026-10-21", "2026-10-01")).toBe(20);
    expect(diasRestantes("2026-10-21", "2026-10-21")).toBe(0);
    expect(diasRestantes("2026-10-21", "2026-10-23")).toBe(-2);
  });
});

const participantes = [
  { id: 1, nombre: "Ana", pesoInicial: "100.00" },
  { id: 2, nombre: "Beto", pesoInicial: "50.00" },
  { id: 3, nombre: "Carla", pesoInicial: "80.00" },
  { id: 4, nombre: "Dani", pesoInicial: "80.00" },
  { id: 5, nombre: "Eva", pesoInicial: "70.00" },
];
let n = 0;
const p = (participanteId: number, fecha: string, peso: string, esPesajeFinal = false): PesajeCalculo => ({ id: ++n, participanteId, fecha, peso, esPesajeFinal });

describe("tabla de posiciones", () => {
  // Ana: −5 kg (5 %) · Beto: −5 kg (10 %) · Carla y Dani: −4 kg (5 %) · Eva: sin pesaje.
  const pesajes = [p(1, "2026-10-08", "95"), p(2, "2026-10-08", "45"), p(3, "2026-10-08", "76"), p(4, "2026-10-08", "76")];

  it("por porcentaje: en empate de porcentaje gana quien perdió más kilos", () => {
    const t = tablaPosiciones({ participantes, pesajes, criterio: "porcentaje", finalizado: false });
    expect(t.map((f) => [f.nombre, f.posicion])).toEqual([
      ["Beto", 1],
      ["Ana", 2], // 5 % y 5 kg: le gana a Carla y Dani (5 % pero 4 kg)
      ["Carla", 3],
      ["Dani", 3], // empate total: comparten puesto
      ["Eva", null],
    ]);
    expect(t.at(-1)).toMatchObject({ estado: "sin_pesaje", kilos: null });
  });

  it("por kilos: en empate de kilos gana quien perdió más porcentaje", () => {
    const t = tablaPosiciones({ participantes, pesajes, criterio: "kilos", finalizado: false });
    expect(t.map((f) => [f.nombre, f.posicion])).toEqual([
      ["Beto", 1], // 5 kg = 10 %
      ["Ana", 2], // 5 kg = 5 %
      ["Carla", 3],
      ["Dani", 3],
      ["Eva", null],
    ]);
  });

  it("tras un empate se salta el puesto siguiente (1, 2, 3, 3, 5)", () => {
    const t = tablaPosiciones({ participantes, pesajes: [...pesajes, p(5, "2026-10-08", "69")], criterio: "porcentaje", finalizado: false });
    expect(t.map((f) => f.posicion)).toEqual([1, 2, 3, 3, 5]);
  });

  it("usa el último pesaje y marca si subió o bajó de puesto respecto a la jornada anterior", () => {
    const segunda = [...pesajes, p(3, "2026-10-15", "70"), p(1, "2026-10-15", "96")]; // Carla −10 kg (12,5 %)
    const t = tablaPosiciones({ participantes, pesajes: segunda, criterio: "porcentaje", finalizado: false });
    const carla = t.find((f) => f.nombre === "Carla")!;
    const ana = t.find((f) => f.nombre === "Ana")!;
    expect(carla).toMatchObject({ posicion: 1, movimiento: "sube", cambioPuestos: 2, kilos: 1000, porcentaje: 1250 });
    expect(ana).toMatchObject({ pesoActual: 9600, movimiento: "baja" });
    expect(t.find((f) => f.nombre === "Dani")).toMatchObject({ posicion: 3, movimiento: "igual" }); // Carla sube y Ana baja: Dani sigue 3.º
  });

  it("finalizado: solo cuenta el pesaje final; sin él queda como 'No completó'", () => {
    const conFinal = [...pesajes, p(1, "2026-10-21", "90", true), p(2, "2026-10-21", "46", true)];
    const t = tablaPosiciones({ participantes, pesajes: conFinal, criterio: "porcentaje", finalizado: true });
    expect(t.map((f) => [f.nombre, f.posicion, f.estado])).toEqual([
      ["Ana", 1, "clasificado"], // 10 %
      ["Beto", 2, "clasificado"], // 8 %
      ["Carla", null, "no_completo"],
      ["Dani", null, "no_completo"],
      ["Eva", null, "no_completo"],
    ]);
  });

  it("la evolución empieza en el peso inicial", () => {
    const [ana] = evolucion(participantes.slice(0, 1), pesajes, "2026-10-01");
    expect(ana.puntos).toEqual([
      { fecha: "2026-10-01", peso: 10000, porcentaje: 0 },
      { fecha: "2026-10-08", peso: 9500, porcentaje: 500 },
    ]);
  });
});

describe("validaciones", () => {
  const valido = { eventoId: 1, nombreCompleto: "Ana Pérez", cedulaIdentidad: "1234567", telefono: "71234567", pesoInicial: "85,5", aceptaParticipar: true as const };

  it("peso entre 30 y 300 kg", () => {
    expect(pesoKg.parse("85,5")).toBe("85.50");
    for (const malo of ["29.9", "300.01", "abc", "85,555"]) expect(pesoKg.safeParse(malo).success).toBe(false);
    expect(pesoKg.parse("300")).toBe("300.00");
  });

  it("cédula y celular bolivianos, normalizados", () => {
    const r = esquemaParticipante.parse({ ...valido, cedulaIdentidad: " 1234567 - 1a  lp ", telefono: "+591 712-34567" });
    expect(r).toMatchObject({ cedulaIdentidad: "1234567-1A LP", telefono: "71234567", pesoInicial: "85.50" });
    expect(esquemaParticipante.safeParse({ ...valido, cedulaIdentidad: "12AB" }).success).toBe(false);
    expect(esquemaParticipante.safeParse({ ...valido, telefono: "2234567" }).success).toBe(false);
  });

  it("la casilla de aceptación es obligatoria", () => {
    expect(esquemaParticipante.safeParse({ ...valido, aceptaParticipar: false }).success).toBe(false);
  });

  it("un pesaje por participante en cada jornada", () => {
    const base = { eventoId: 1, fecha: "2026-10-08", esPesajeFinal: false, confirmarCambios: false };
    expect(esquemaPesajes.safeParse({ ...base, lineas: [{ participanteId: 1, peso: "80" }, { participanteId: 1, peso: "81" }] }).success).toBe(false);
  });
});
