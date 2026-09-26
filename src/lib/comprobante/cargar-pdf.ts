/**
 * Único punto de carga del generador de PDF (jsPDF pesa: se carga bajo demanda).
 * Turbopack crea un fragmento distinto por cada `import()`: usar siempre esta función hace que la
 * descarga anticipada (para trabajar sin internet) y los botones "PDF"/"WhatsApp" pidan el mismo archivo.
 */
export const cargarGeneradorPdf = () => import("./pdf");
