import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { BLOQUEO_PAGO_MENSAJE, BLOQUEO_PAGO_PATH, erpBloqueadoPorFaltaDePago } from "@/lib/bloqueo-pago";

/**
 * Refresca la sesión Supabase en cookies antes de Route Handlers / RSC.
 * Solo NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY (sin db.schema en getUser).
 */
export async function middleware(request: NextRequest) {
  // ===== Acceso suspendido por falta de pago (sistema de Neura, por dominio) =====
  if (await erpBloqueadoPorFaltaDePago(request.headers)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: BLOQUEO_PAGO_MENSAJE }, { status: 402 });
    }
    if (request.nextUrl.pathname !== BLOQUEO_PAGO_PATH) {
      const bloqueoUrl = request.nextUrl.clone();
      bloqueoUrl.pathname = BLOQUEO_PAGO_PATH;
      bloqueoUrl.search = "";
      return NextResponse.redirect(bloqueoUrl, 307);
    }
    return NextResponse.next({ request });
  }
  // Rehabilitado: quien quedó en /bloqueado vuelve al inicio.
  if (request.nextUrl.pathname === BLOQUEO_PAGO_PATH) {
    const inicio = request.nextUrl.clone();
    inicio.pathname = "/";
    inicio.search = "";
    return NextResponse.redirect(inicio, 307);
  }

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
