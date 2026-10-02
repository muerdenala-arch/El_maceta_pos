/**
 * Ejecuta un script que necesita los módulos de la app ("@/…", `server-only`, la conexión con await):
 * los carga con Vite, igual que las pruebas. Uso: node src/db/ejecutar.mjs src/db/<script>.ts [argumentos]
 */
import path from "node:path";
import { createServer } from "vite";

const [script] = process.argv.splice(2, 1);
const raiz = process.cwd();
const servidor = await createServer({
  configFile: false,
  root: raiz,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { "@": path.join(raiz, "src"), "server-only": path.join(raiz, "src/test/vacio.ts") } },
});
let codigo = 0;
try {
  await servidor.ssrLoadModule(`/${script.split(path.sep).join("/")}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  codigo = 1;
}
await servidor.close();
// La conexión a la base queda abierta: se termina el proceso de forma explícita.
process.exit(codigo);
