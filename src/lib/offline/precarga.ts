/**
 * Descarga anticipada para trabajar sin internet: pantallas del cajero (con sus archivos JS/CSS)
 * y fotos de productos, QR y logo. Los nombres de caché son los mismos que usa public/sw.js.
 */
export const CACHE_PAGINAS = "maseta-paginas-v1";
export const CACHE_ESTATICOS = "maseta-estaticos-v1";
export const CACHE_IMAGENES = "maseta-imagenes-v1";

export const PAGINAS_CAJERO = ["/cajero/venta", "/cajero/gastos", "/cajero/bodega", "/cajero/ventas", "/cajero/cierre"];

const CLAVE_ULTIMA = "maseta:precarga";
export const CLAVE_LISTA = "maseta:precarga-lista";
const CADA_MS = 10 * 60_000;

function hayServiceWorker() {
  return typeof window !== "undefined" && "caches" in window && !!navigator.serviceWorker?.controller;
}

export async function precargar(imagenes: string[]) {
  if (!hayServiceWorker() || !navigator.onLine) return;
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE_ULTIMA) ?? 0);
    if (Date.now() - ultima < CADA_MS) return;
    sessionStorage.setItem(CLAVE_ULTIMA, String(Date.now()));
  } catch {
    /* sin sessionStorage: se precarga igual */
  }

  const [paginas, estaticos, fotos] = await Promise.all([caches.open(CACHE_PAGINAS), caches.open(CACHE_ESTATICOS), caches.open(CACHE_IMAGENES)]);
  for (const ruta of PAGINAS_CAJERO) {
    try {
      const r = await fetch(ruta, { credentials: "same-origin", headers: { Accept: "text/html" } });
      // Una redirección (p. ej. a la apertura de caja) no se guarda como si fuera esa pantalla.
      if (!r.ok || r.redirected) continue;
      const html = await r.clone().text();
      await paginas.put(ruta, r);
      const archivos = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? []);
      for (const a of archivos) if (!(await estaticos.match(a))) await estaticos.add(a).catch(() => {});
    } catch {
      /* se reintentará en la próxima precarga */
    }
  }
  // Archivos de la app que esta página ya cargó (incluidos los que se cargan bajo demanda, como el
  // generador de PDF): en la primera sesión del dispositivo pueden haberse pedido antes de que el
  // service worker tomara el control, así que se guardan explícitamente.
  const cargados = performance
    .getEntriesByType("resource")
    .map((e) => new URL(e.name))
    .filter((u) => u.origin === location.origin && u.pathname.startsWith("/_next/static/"))
    .map((u) => u.pathname);
  for (const a of new Set(cargados)) if (!(await estaticos.match(a))) await estaticos.add(a).catch(() => {});

  for (const url of new Set(imagenes)) {
    try {
      if (!(await fotos.match(url))) {
        const r = await fetch(url, { mode: url.startsWith("/") ? "same-origin" : "cors" });
        if (r.ok) await fotos.put(url, r);
      }
    } catch {
      /* foto no disponible: se verá el ícono */
    }
  }
  try {
    // Marca de "listo para trabajar sin conexión" (también la usan las pruebas de extremo a extremo).
    sessionStorage.setItem(CLAVE_LISTA, String(Date.now()));
  } catch {
    /* sin sessionStorage */
  }
}

/** Al cerrar sesión: las pantallas guardadas tienen datos del usuario, se borran del dispositivo. */
export async function borrarPaginasGuardadas() {
  try {
    if ("caches" in window) await caches.delete(CACHE_PAGINAS);
    sessionStorage.removeItem(CLAVE_ULTIMA);
  } catch {
    /* nada que borrar */
  }
}
