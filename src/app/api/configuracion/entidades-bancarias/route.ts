import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  listEntidadesBancarias,
  createEntidadBancaria,
} from "@/lib/configuracion/server/entidades-bancarias-pg";

/** GET /api/configuracion/entidades-bancarias[?todas=1] — lista entidades (activas o todas). */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const incluirInactivas = new URL(request.url).searchParams.get("todas") === "1";
    const entidades = await listEntidadesBancarias(schema, ctx.auth.empresa_id, { incluirInactivas });
    return NextResponse.json(successResponse({ entidades }));
  } catch (err) {
    console.error("[/api/configuracion/entidades-bancarias GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las entidades bancarias."), { status: 500 });
  }
}

/** POST /api/configuracion/entidades-bancarias — crea una entidad. */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }
    const o = (body ?? {}) as Record<string, unknown>;
    const nombre = String(o.nombre ?? "").trim();
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    const codigo = o.codigo == null ? null : String(o.codigo);
    const tipo = o.tipo == null ? null : String(o.tipo);

    const entidad = await createEntidadBancaria(schema, ctx.auth.empresa_id, { nombre, codigo, tipo });
    return NextResponse.json(successResponse({ entidad }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo crear la entidad.";
    const status = /Ya existe|obligatorio|vacío/.test(msg) ? 400 : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
