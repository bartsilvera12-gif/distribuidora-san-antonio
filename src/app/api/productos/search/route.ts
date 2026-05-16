import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { signProductoImagen } from "@/lib/inventario/imagen-storage";

interface ProductoSearchHit {
  id: string;
  nombre: string;
  sku: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean;
  precio_venta: number;
  stock_actual: number;
  unidad_medida: string;
  imagen_path: string | null;
  imagen_url: string | null;
}

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

/**
 * GET /api/productos/search?q=...&limit=30
 *
 * Busqueda case-insensitive por nombre, sku o codigo_barras usando ilike %q%.
 * Apoyada por indices GIN trigram aplicados en F3.
 *
 * Reglas:
 *  - Sin query (`q` vacio o <2 chars): devuelve los primeros productos activos por nombre.
 *  - Resuelve empresa/schema via getTenantSupabaseFromAuth → multi-tenant seguro.
 *  - Devuelve `imagen_url_signed` (TTL 1h) si hay imagen_path.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const url = new URL(request.url);
    const qRaw = (url.searchParams.get("q") ?? "").trim();
    const q = qRaw.slice(0, 100);
    const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = Math.max(1, Math.min(MAX_LIMIT, Number.isFinite(limitParam) ? limitParam : DEFAULT_LIMIT));

    let query = supabase
      .from("productos")
      .select("id, nombre, sku, codigo_barras, codigo_barras_interno, precio_venta, stock_actual, unidad_medida, imagen_path, imagen_url")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("nombre")
      .limit(limit);

    if (q.length >= 2) {
      // Escapar caracteres especiales de PostgREST `or`: , ( )
      const safe = q.replace(/[,()*%]/g, " ");
      const pattern = `%${safe}%`;
      query = query.or(
        `nombre.ilike.${pattern},sku.ilike.${pattern},codigo_barras.ilike.${pattern}`
      );
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 500 });
    }

    const rows = (data ?? []) as Array<Record<string, unknown>>;

    // Firmar URLs solo para los hits con imagen_path. Best-effort: si falla,
    // devolver null y que la UI use placeholder.
    const hits: ProductoSearchHit[] = await Promise.all(
      rows.map(async (r) => {
        const imagenPath = (r.imagen_path as string | null) ?? null;
        const signed = imagenPath ? await signProductoImagen(supabase, imagenPath, 3600) : null;
        return {
          id: r.id as string,
          nombre: (r.nombre as string) ?? "",
          sku: (r.sku as string) ?? "",
          codigo_barras: (r.codigo_barras as string | null) ?? null,
          codigo_barras_interno: r.codigo_barras_interno === true,
          precio_venta: Number(r.precio_venta ?? 0),
          stock_actual: Number(r.stock_actual ?? 0),
          unidad_medida: (r.unidad_medida as string) ?? "Unidad",
          imagen_path: imagenPath,
          imagen_url: signed ?? ((r.imagen_url as string | null) ?? null),
        };
      })
    );

    return NextResponse.json(successResponse({ items: hits, count: hits.length, q }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
