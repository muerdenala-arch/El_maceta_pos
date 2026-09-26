/**
 * Acceso seguro a localStorage/sessionStorage: puede fallar (modo privado estricto, sitio bloqueado)
 * y en ese caso la app sigue funcionando sin recordar el valor.
 */
type Almacen = "local" | "session";

function almacen(tipo: Almacen) {
  return tipo === "local" ? window.localStorage : window.sessionStorage;
}

export function leerAlmacen(tipo: Almacen, clave: string): string | null {
  try {
    return almacen(tipo).getItem(clave);
  } catch {
    return null;
  }
}

export function escribirAlmacen(tipo: Almacen, clave: string, valor: string | null) {
  try {
    if (valor === null) almacen(tipo).removeItem(clave);
    else almacen(tipo).setItem(clave, valor);
  } catch {
    // Sin almacenamiento disponible: se ignora.
  }
}
