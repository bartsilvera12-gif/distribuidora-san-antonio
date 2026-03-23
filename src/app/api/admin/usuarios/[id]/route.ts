import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Config no disponible");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Obtiene el auth user id: usa auth_user_id si existe, sino busca por email en listUsers */
async function getAuthUserId(supabase: ReturnType<typeof getSupabase>, usuario: { auth_user_id?: string | null; email?: string }) {
  if (usuario.auth_user_id) return usuario.auth_user_id;
  const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  return data?.users?.find((u) => u.email === usuario.email)?.id ?? null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { nombre, email, estado, modulo_ids } = body;

    const supabase = getSupabase();

    const { data: usuario, error: errGet } = await supabase
      .from("usuarios")
      .select("id, email, nombre, estado, auth_user_id")
      .eq("id", id)
      .single();

    if (errGet || !usuario) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const authUserId = await getAuthUserId(supabase, usuario);

    const updates: Record<string, unknown> = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (estado !== undefined) updates.estado = estado;

    if (estado !== undefined && authUserId) {
      const banDuration = estado === "inactivo" ? "876000h" : "none";
      await supabase.auth.admin.updateUserById(authUserId, {
        ban_duration: banDuration,
      } as { ban_duration?: string });
    }

    const nuevoEmail = email !== undefined ? email.trim().toLowerCase() : null;
    const emailCambia = nuevoEmail !== null && nuevoEmail !== (usuario.email ?? "");

    if (emailCambia) {
      if (!authUserId) {
        return NextResponse.json(
          { error: "No se puede cambiar el email: usuario de autenticación no encontrado." },
          { status: 400 }
        );
      }
      const { error: errAuth } = await supabase.auth.admin.updateUserById(authUserId, {
        email: nuevoEmail,
        email_confirm: true,
      });
      if (errAuth) {
        return NextResponse.json({ error: `Error al actualizar email: ${errAuth.message}` }, { status: 400 });
      }
      updates.email = nuevoEmail;
    }

    if (Object.keys(updates).length > 0) {
      const { error: errUpdate } = await supabase
        .from("usuarios")
        .update(updates)
        .eq("id", id);
      if (errUpdate) {
        return NextResponse.json({ error: errUpdate.message }, { status: 400 });
      }
    }

    if (Array.isArray(modulo_ids)) {
      const { error: errDel } = await supabase.from("usuario_modulos").delete().eq("usuario_id", id);
      if (errDel) {
        return NextResponse.json({ error: `Error al guardar módulos. Ejecutá las migraciones: ${errDel.message}` }, { status: 400 });
      }
      if (modulo_ids.length > 0) {
        const rows = modulo_ids.map((modulo_id: string) => ({ usuario_id: id, modulo_id }));
        const { error: errMod } = await supabase.from("usuario_modulos").insert(rows);
        if (errMod) {
          return NextResponse.json({ error: `Error al guardar módulos: ${errMod.message}` }, { status: 400 });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
