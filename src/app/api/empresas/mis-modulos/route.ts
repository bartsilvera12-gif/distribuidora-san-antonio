import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Config no disponible" }, { status: 500 });
    }

    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    });

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user?.email) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: usuario, error: errUsuario } = await supabase
      .from("usuarios")
      .select("id, empresa_id")
      .eq("email", user.email)
      .single();

    if (errUsuario || !usuario?.empresa_id) {
      return NextResponse.json([]);
    }

    const { data: emData, error: errEm } = await supabase
      .from("empresa_modulos")
      .select("modulo_id")
      .eq("empresa_id", usuario.empresa_id)
      .eq("activo", true);

    if (errEm) {
      return NextResponse.json({ error: errEm.message }, { status: 400 });
    }

    let moduloIds = (emData ?? []).map((r) => r.modulo_id).filter(Boolean);

    const { data: umData, error: errUm } = await supabase
      .from("usuario_modulos")
      .select("modulo_id")
      .eq("usuario_id", usuario.id);

    if (!errUm && umData && umData.length > 0) {
      const usuarioModuloIds = umData.map((r) => (r as { modulo_id: string }).modulo_id);
      moduloIds = moduloIds.filter((id) => usuarioModuloIds.includes(id));
    }

    if (moduloIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data: modulos, error: errModulos } = await supabase
      .from("modulos")
      .select("id, nombre, slug")
      .in("id", moduloIds);

    if (errModulos) {
      return NextResponse.json({ error: errModulos.message }, { status: 400 });
    }

    const result = (modulos ?? []).map((m) => ({
      id: m.id,
      nombre: m.nombre ?? "",
      slug: m.slug ?? "",
    }));

    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
