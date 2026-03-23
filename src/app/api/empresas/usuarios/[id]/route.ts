import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAuthUserId(supabase: any, usuario: { auth_user_id?: string | null; email?: string }): Promise<string | null> {
  if (usuario.auth_user_id) return usuario.auth_user_id;
  const emailBuscado = (usuario.email ?? "").trim().toLowerCase();
  if (!emailBuscado) return null;
  let page = 1;
  while (true) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 500 });
    const users = data?.users ?? [];
    const found = users.find((u: { id: string; email?: string }) => (u.email ?? "").toLowerCase() === emailBuscado);
    if (found) return found.id;
    if (users.length < 500) break;
    page++;
  }
  return null;
}

/** Obtiene un usuario. Solo si pertenece a la empresa del usuario autenticado (o super_admin). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Config no disponible" }, { status: 500 });
    }

    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: currentUser } = await supabase
      .from("usuarios")
      .select("empresa_id, rol")
      .eq("email", user.email)
      .single();

    const { data: usuario, error } = await supabase
      .from("usuarios")
      .select("id, nombre, email, telefono, fecha_nacimiento, rol, estado, created_at, empresa_id")
      .eq("id", id)
      .single();

    if (error || !usuario) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (currentUser?.rol !== "super_admin" && usuario.empresa_id !== currentUser?.empresa_id) {
      return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
    }

    const { empresa_id: _e, ...rest } = usuario;
    return NextResponse.json(rest);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** Actualiza un usuario. Solo si pertenece a la empresa del usuario autenticado (o super_admin). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Config no disponible" }, { status: 500 });
    }

    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    });
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const { data: currentUser } = await supabase
      .from("usuarios")
      .select("empresa_id, rol")
      .eq("email", user.email)
      .single();

    const body = await req.json();
    const { nombre, email, telefono, fecha_nacimiento, estado } = body;

    const { data: usuario, error: errGet } = await supabase
      .from("usuarios")
      .select("id, email, estado, auth_user_id, empresa_id")
      .eq("id", id)
      .single();

    if (errGet || !usuario) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    if (currentUser?.rol !== "super_admin" && usuario.empresa_id !== currentUser?.empresa_id) {
      return NextResponse.json({ error: "Sin permiso para editar este usuario" }, { status: 403 });
    }

    const authUserId = await getAuthUserId(supabase, usuario);

    const updates: Record<string, unknown> = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (estado !== undefined) updates.estado = estado;
    if (telefono !== undefined) updates.telefono = telefono || null;
    if (fecha_nacimiento !== undefined) updates.fecha_nacimiento = fecha_nacimiento || null;

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
      if (!usuario.auth_user_id) updates.auth_user_id = authUserId;
    }

    if (Object.keys(updates).length > 0) {
      const { error: errUpdate } = await supabase.from("usuarios").update(updates).eq("id", id);
      if (errUpdate) {
        return NextResponse.json({ error: errUpdate.message }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
