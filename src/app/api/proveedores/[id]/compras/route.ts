import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getProveedorDetalleCompras } from "@/lib/proveedores/server/proveedores-reportes-pg";

/**
 * GET /api/proveedores/[id]/compras — para el detalle del proveedor:
 * métricas (cantidad/total/última), historial de compras y productos más
 * comprados a ese proveedor.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const detalle = await getProveedorDetalleCompras(schema, ctx.auth.empresa_id, id);
    return NextResponse.json(successResponse(detalle));
  } catch (err) {
    console.error("[/api/proveedores/[id]/compras GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el detalle del proveedor."), { status: 500 });
  }
}
