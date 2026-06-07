import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { updateEntidadBancaria } from "@/lib/configuracion/server/entidades-bancarias-pg";

/** PATCH /api/configuracion/entidades-bancarias/[id] — edita nombre/código/tipo/activo. */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
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
    const patch: { nombre?: string; codigo?: string | null; tipo?: string | null; activo?: boolean } = {};
    if (o.nombre !== undefined) patch.nombre = String(o.nombre);
    if (o.codigo !== undefined) patch.codigo = o.codigo == null ? null : String(o.codigo);
    if (o.tipo !== undefined) patch.tipo = o.tipo == null ? null : String(o.tipo);
    if (o.activo !== undefined) patch.activo = Boolean(o.activo);

    const entidad = await updateEntidadBancaria(schema, ctx.auth.empresa_id, id, patch);
    return NextResponse.json(successResponse({ entidad }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "No se pudo actualizar la entidad.";
    const status = /Ya existe|vacío|no encontrada|Nada para/.test(msg) ? 400 : 500;
    return NextResponse.json(errorResponse(msg), { status });
  }
}
