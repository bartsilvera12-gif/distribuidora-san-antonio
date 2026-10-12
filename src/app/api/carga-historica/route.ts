import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getCargaHistoricaConfig, upsertCargaHistoricaConfig } from "@/lib/carga-historica/server";
import { toCalendarDateStr } from "@/lib/fechas/calendario";

/**
 * GET /api/carga-historica — devuelve la configuración de carga histórica de la
 * empresa { fechaCorte, habilitada }. La usan los formularios (compras, ventas,
 * inventario, gastos, pagos) para mostrar/gated el selector de fecha y derivar
 * es_historico. La validación autoritativa se hace igualmente en cada endpoint.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const cfg = await getCargaHistoricaConfig(schema, ctx.auth.empresa_id);
    return NextResponse.json(successResponse(cfg));
  } catch (err) {
    console.error("[/api/carga-historica GET]", err instanceof Error ? err.message : err);
    // No bloquear la UI: devolver deshabilitada por defecto.
    return NextResponse.json(successResponse({ fechaCorte: null, habilitada: false }));
  }
}

/**
 * PUT /api/carga-historica — configura la fecha de corte y habilita/cierra el
 * período de carga histórica de la empresa. Body: { fechaCorte, habilitada }.
 */
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const fechaCorte = toCalendarDateStr(String(body.fechaCorte ?? ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) {
      return NextResponse.json(errorResponse("fechaCorte inválida (YYYY-MM-DD)."), { status: 400 });
    }
    const habilitada = body.habilitada !== false; // default true
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    await upsertCargaHistoricaConfig(schema, ctx.auth.empresa_id, { fechaCorte, habilitada });
    return NextResponse.json(successResponse({ fechaCorte, habilitada }));
  } catch (err) {
    console.error("[/api/carga-historica PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar la configuración."), { status: 500 });
  }
}
