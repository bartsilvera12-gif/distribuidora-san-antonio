import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresca la sesión Supabase en cookies antes de Route Handlers / RSC.
 * Solo NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (sin db.schema en getUser).
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}

/**
 * Excluir TODO `/api/*` del middleware.
 *
 * Las rutas API se autentican solas vía `resolveApiAuthContext` (Bearer token de
 * localStorage, o cookies como fallback), así que el `auth.getUser()` del
 * middleware ahí era un viaje de red a Supabase Auth REDUNDANTE por cada llamada
 * de datos. Sacarlo elimina ~1 round-trip a Auth por request /api/*.
 *
 * El refresh de sesión en cookies se mantiene para navegaciones de páginas / RSC,
 * que es donde el servidor sí lee la cookie. (Antes solo se excluía
 * `/api/webhooks`, que Meta llama sin cookies; ahora queda cubierto por excluir
 * `/api` entero.)
 */
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
