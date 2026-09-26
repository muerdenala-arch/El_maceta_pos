"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne, sql } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { sucursales, usuarios } from "@/db/schema";
import {
  conPermiso,
  esViolacionUnica,
  exito,
  fallo,
  falloValidacion,
  type Resultado,
} from "@/lib/acciones/resultado";
import { registrarAuditoria } from "@/lib/auditoria";
import { autorizar } from "@/lib/auth/sesion";
import { esquemaPin } from "@/lib/validaciones/auth";
import { idPositivo } from "@/lib/validaciones/comunes";
import {
  esquemaCrearUsuario,
  esquemaEditarUsuario,
  type DatosCrearUsuario,
  type DatosEditarUsuario,
} from "@/lib/validaciones/admin";

const MENSAJE_ULTIMO_ADMIN = "Debe quedar al menos un administrador activo";

async function sucursalValidaParaCajero(sucursalId: number | null) {
  if (sucursalId === null) return true;
  const [s] = await db
    .select({ id: sucursales.id })
    .from(sucursales)
    .where(and(eq(sucursales.id, sucursalId), eq(sucursales.tipo, "sucursal"), eq(sucursales.activo, true)));
  return !!s;
}

/** ¿Quedaría algún administrador activo si se quita a `excluirId`? */
async function hayOtroAdminActivo(excluirId: number) {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(usuarios)
    .where(and(eq(usuarios.rol, "admin"), eq(usuarios.activo, true), ne(usuarios.id, excluirId)));
  return total > 0;
}

export async function crearUsuario(entrada: DatosCrearUsuario): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const validado = esquemaCrearUsuario.safeParse(entrada);
    if (!validado.success) return falloValidacion(validado.error);
    const { pin, ...datos } = validado.data;

    if (!(await sucursalValidaParaCajero(datos.sucursalId))) {
      return fallo("Revisa los datos marcados", { sucursalId: "Sucursal inválida o inactiva" });
    }

    try {
      const [nuevo] = await db
        .insert(usuarios)
        .values({ ...datos, pinHash: await bcrypt.hash(pin, 10) })
        .returning({ id: usuarios.id });
      // Nunca se registra el PIN, ni siquiera cifrado.
      await registrarAuditoria("usuario_creado", { usuarioId: sesion.uid, detalle: { id: nuevo.id, ...datos } });
    } catch (e) {
      if (esViolacionUnica(e, "usuarios_usuario_uq")) {
        return fallo("Revisa los datos marcados", { usuario: "Ese usuario ya existe" });
      }
      throw e;
    }
    refresh();
    return exito();
  });
}

export async function editarUsuario(entrada: DatosEditarUsuario): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const validado = esquemaEditarUsuario.safeParse(entrada);
    if (!validado.success) return falloValidacion(validado.error);
    const { id, ...datos } = validado.data;

    const [actual] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    if (!actual) return fallo("El usuario ya no existe");
    if (actual.rol !== datos.rol) {
      if (id === sesion.uid) return fallo("No puedes cambiar tu propio rol");
      if (actual.rol === "admin" && actual.activo && !(await hayOtroAdminActivo(id))) return fallo(MENSAJE_ULTIMO_ADMIN);
    }
    if (!(await sucursalValidaParaCajero(datos.sucursalId))) {
      return fallo("Revisa los datos marcados", { sucursalId: "Sucursal inválida o inactiva" });
    }

    // Si cambia el rol o la sucursal, su sesión abierta deja de valer (obtenerSesion lo compara).
    await db.update(usuarios).set(datos).where(eq(usuarios.id, id));
    await registrarAuditoria("usuario_editado", {
      usuarioId: sesion.uid,
      detalle: { id, antes: { nombre: actual.nombre, rol: actual.rol, sucursalId: actual.sucursalId }, despues: datos },
    });
    refresh();
    return exito();
  });
}

export async function cambiarEstadoUsuario(entrada: { id: number; activo: boolean }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const id = idPositivo.parse(entrada.id);
    const activo = entrada.activo === true;

    const [actual] = await db.select().from(usuarios).where(eq(usuarios.id, id));
    if (!actual) return fallo("El usuario ya no existe");
    if (!activo) {
      if (id === sesion.uid) return fallo("No puedes desactivar tu propio usuario");
      if (actual.rol === "admin" && !(await hayOtroAdminActivo(id))) return fallo(MENSAJE_ULTIMO_ADMIN);
    } else if (actual.rol === "cajero" && !(await sucursalValidaParaCajero(actual.sucursalId))) {
      return fallo("Su sucursal está inactiva: asígnale otra antes de activarlo");
    }

    // Desactivado → su sesión se cierra en la siguiente petición.
    await db.update(usuarios).set({ activo }).where(eq(usuarios.id, id));
    await registrarAuditoria("usuario_estado", { usuarioId: sesion.uid, detalle: { id, activo } });
    refresh();
    return exito();
  });
}

export async function restablecerPin(entrada: { id: number; pin: string }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const id = idPositivo.parse(entrada.id);
    const pin = esquemaPin.safeParse(entrada.pin);
    if (!pin.success) return fallo("Revisa los datos marcados", { pin: pin.error.issues[0].message });

    const [actualizado] = await db
      .update(usuarios)
      .set({ pinHash: await bcrypt.hash(pin.data, 10), intentosFallidos: 0, bloqueadoHasta: null })
      .where(eq(usuarios.id, id))
      .returning({ id: usuarios.id });
    if (!actualizado) return fallo("El usuario ya no existe");
    await registrarAuditoria("pin_restablecido", { usuarioId: sesion.uid, detalle: { id } });
    refresh();
    return exito();
  });
}

export async function desbloquearUsuario(entrada: { id: number }): Promise<Resultado> {
  return conPermiso(async () => {
    const sesion = await autorizar("admin");
    const id = idPositivo.parse(entrada.id);
    await db.update(usuarios).set({ intentosFallidos: 0, bloqueadoHasta: null }).where(eq(usuarios.id, id));
    await registrarAuditoria("usuario_desbloqueado", { usuarioId: sesion.uid, detalle: { id } });
    refresh();
    return exito();
  });
}
