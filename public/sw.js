/*
 * Service worker de El Maseta (sección 8 del plan: la app abre y vende sin internet).
 * Escrito a mano (sin Serwist) para tener control total y un comportamiento fácil de auditar:
 *
 * - /_next/static/*            → caché primero (archivos con hash, no cambian).
 * - Fotos (/api/archivos, Blob) → caché primero; se guardan al verlas o al precargarlas.
 * - Pantallas del cajero y login (navegación) → red primero (4 s); sin red, la última copia guardada.
 * - Peticiones RSC (navegación interna de Next) → solo red. Si falla, Next navega "a la antigua"
 *   y esta misma lógica sirve la copia guardada de la pantalla.
 * - POST (acciones, /api/sync) → nunca se tocan.
 *
 * Los nombres de caché coinciden con src/lib/offline/precarga.ts.
 */
const CACHE_PAGINAS = "maseta-paginas-v1";
const CACHE_ESTATICOS = "maseta-estaticos-v1";
const CACHE_IMAGENES = "maseta-imagenes-v1";
const VIGENTES = [CACHE_PAGINAS, CACHE_ESTATICOS, CACHE_IMAGENES];
const PAGINA_SIN_CONEXION = "/sin-conexion";
const ESPERA_RED_MS = 4000;

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_PAGINAS)
      .then((c) => c.add(PAGINA_SIN_CONEXION))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k.startsWith("maseta-") && !VIGENTES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data === "borrar-paginas") evento.waitUntil(caches.delete(CACHE_PAGINAS));
});

function conTiempoLimite(promesa, ms) {
  return new Promise((resolver, rechazar) => {
    const t = setTimeout(() => rechazar(new Error("tiempo agotado")), ms);
    promesa.then(
      (r) => {
        clearTimeout(t);
        resolver(r);
      },
      (e) => {
        clearTimeout(t);
        rechazar(e);
      },
    );
  });
}

async function cachePrimero(peticion, nombreCache) {
  const cache = await caches.open(nombreCache);
  const guardada = await cache.match(peticion, { ignoreVary: true });
  if (guardada) return guardada;
  const respuesta = await fetch(peticion);
  if (respuesta.ok || respuesta.type === "opaque") cache.put(peticion, respuesta.clone()).catch(() => {});
  return respuesta;
}

const esPantallaGuardable = (ruta) => ruta === "/login" || ruta.startsWith("/cajero/") || ruta === PAGINA_SIN_CONEXION;

async function navegacion(peticion) {
  const url = new URL(peticion.url);
  const clave = url.pathname; // sin ?parámetros
  const cache = await caches.open(CACHE_PAGINAS);
  try {
    const respuesta = await conTiempoLimite(fetch(peticion), ESPERA_RED_MS);
    // Solo pantallas reales (no redirecciones, p. ej. a la apertura de caja o al login).
    if (esPantallaGuardable(clave) && respuesta.ok && !respuesta.redirected && respuesta.type === "basic") {
      cache.put(clave, respuesta.clone()).catch(() => {});
    }
    return respuesta;
  } catch {
    const guardada = (await cache.match(clave)) || (clave === "/" ? await cache.match("/cajero/venta") : undefined);
    return guardada || (await cache.match(PAGINA_SIN_CONEXION)) || Response.error();
  }
}

self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  if (peticion.method !== "GET") return;
  const url = new URL(peticion.url);

  const mismoOrigen = url.origin === self.location.origin;
  const esImagen = (mismoOrigen && url.pathname.startsWith("/api/archivos/")) || url.hostname.endsWith(".public.blob.vercel-storage.com");
  if (esImagen) {
    evento.respondWith(cachePrimero(peticion, CACHE_IMAGENES));
    return;
  }
  if (!mismoOrigen) return;

  if (url.pathname.startsWith("/_next/static/")) {
    evento.respondWith(cachePrimero(peticion, CACHE_ESTATICOS));
    return;
  }
  // Navegación interna de Next (RSC): solo red; si falla, Next recarga la pantalla y entra por "navigate".
  if (peticion.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (peticion.mode === "navigate") {
    evento.respondWith(navegacion(peticion));
  }
});
