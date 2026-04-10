import { createServerClient } from "@supabase/ssr";
import { supabaseDbSchemaOption } from "@/lib/supabase/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { resolveUsuarioErpFromAuthUser } from "@/lib/auth/resolve-usuario-erp";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveEffectiveModules } from "@/lib/modulos/resolve-effective-modules";

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
      ...supabaseDbSchemaOption,
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
    if (!user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const usuario = await resolveUsuarioErpFromAuthUser(supabase, user);
    if (!usuario) {
      return NextResponse.json([]);
    }

    const modulos = await resolveEffectiveModules(supabase, {
      id: usuario.id,
      empresa_id: usuario.empresa_id,
      rol: usuario.rol,
    });

    return NextResponse.json(
      modulos.map((m) => ({
        id: m.id,
        nombre: m.nombre,
        slug: m.slug,
      }))
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
