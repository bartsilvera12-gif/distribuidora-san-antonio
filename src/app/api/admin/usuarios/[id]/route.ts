import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { nombre, email, estado } = body;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return NextResponse.json({ error: "Config no disponible" }, { status: 500 });
    }

    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Obtener usuario actual
    const { data: usuario, error: errGet } = await supabase
      .from("usuarios")
      .select("id, email, nombre, estado")
      .eq("id", id)
      .single();

    if (errGet || !usuario) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const authUser = authUsers?.users?.find((u) => u.email === usuario.email);

    const updates: Record<string, unknown> = {};
    if (nombre !== undefined) updates.nombre = nombre;
    if (estado !== undefined) updates.estado = estado;

    // Si cambia estado, banear/desbanear en Auth para impedir login
    if (estado !== undefined && authUser) {
      const banDuration = estado === "inactivo" ? "876000h" : "none"; // 100 años o desbanear
      await supabase.auth.admin.updateUserById(authUser.id, {
        ban_duration: banDuration,
      } as { ban_duration?: string });
    }

    // Si cambia el email, actualizar también en auth.users
    if (email !== undefined && email.trim() !== usuario.email && authUser) {
      const { error: errAuth } = await supabase.auth.admin.updateUserById(authUser.id, {
        email: email.trim().toLowerCase(),
      });
      if (errAuth) {
        return NextResponse.json({ error: errAuth.message }, { status: 400 });
      }
      updates.email = email.trim().toLowerCase();
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

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
