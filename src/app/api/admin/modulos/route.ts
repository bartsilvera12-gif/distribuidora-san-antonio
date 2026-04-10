import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { supabaseDbSchemaOption, supabaseServiceRoleClientOptions } from "@/lib/supabase/schema";
import { resolveUsuarioErpFromAuthUser } from "@/lib/auth/resolve-usuario-erp";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !key) {
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

    const supabaseSr = createClient(url, key, { ...supabaseServiceRoleClientOptions });
    const usuario = await resolveUsuarioErpFromAuthUser(supabaseSr, user);
    if (!usuario || (usuario.rol ?? "").trim() !== "super_admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    const { data, error } = await supabaseSr.from("modulos").select("*");

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
