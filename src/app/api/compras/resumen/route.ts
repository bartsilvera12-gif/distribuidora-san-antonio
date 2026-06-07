import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getResumenCompras } from "@/lib/compras/server/compras-pg";
import { asuncionDayBoundsUtc, asuncionMonthBoundsUtc } from "@/lib/fechas/asuncion-bounds";

/**
 * GET /api/compras/resumen — mini-dashboard de compras (agregados SQL
 * server-side; zona horaria America/Asuncion). No trae todas las compras al
 * cliente.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const day = asuncionDayBoundsUtc();
    const month = asuncionMonthBoundsUtc();
    const resumen = await getResumenCompras(schema, ctx.auth.empresa_id, {
      dayStart: day.start,
      dayEnd: day.end,
      monthStart: month.start,
      monthEnd: month.end,
    });

    return NextResponse.json(successResponse(resumen));
  } catch (err) {
    console.error("[/api/compras/resumen GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el resumen de compras."), { status: 500 });
  }
}
