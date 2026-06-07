import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getResumenProveedores } from "@/lib/proveedores/server/proveedores-reportes-pg";
import { asuncionRangeBoundsUtc } from "@/lib/fechas/asuncion-bounds";

/** GET /api/proveedores/resumen?desde&hasta — cards de resumen operativo. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const url = new URL(request.url);
    const range = asuncionRangeBoundsUtc(url.searchParams.get("desde"), url.searchParams.get("hasta"));
    const resumen = await getResumenProveedores(schema, ctx.auth.empresa_id, {
      rangeStart: range.start,
      rangeEnd: range.end,
    });
    return NextResponse.json(successResponse(resumen));
  } catch (err) {
    console.error("[/api/proveedores/resumen GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el resumen de proveedores."), { status: 500 });
  }
}
