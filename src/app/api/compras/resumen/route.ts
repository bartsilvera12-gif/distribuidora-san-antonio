import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getResumenCompras } from "@/lib/compras/server/compras-pg";
import { asuncionDayBoundsUtc, asuncionRangeBoundsUtc } from "@/lib/fechas/asuncion-bounds";

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
    const url = new URL(request.url);
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    const day = asuncionDayBoundsUtc();
    const range = asuncionRangeBoundsUtc(desde, hasta);
    const resumen = await getResumenCompras(schema, ctx.auth.empresa_id, {
      dayStart: day.start,
      dayEnd: day.end,
      rangeStart: range.start,
      rangeEnd: range.end,
    });

    return NextResponse.json(successResponse(resumen));
  } catch (err) {
    console.error("[/api/compras/resumen GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el resumen de compras."), { status: 500 });
  }
}
