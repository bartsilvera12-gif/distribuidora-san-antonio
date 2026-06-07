import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  getCompraById,
  listCompraItems,
  listMovimientosDeCompra,
} from "@/lib/compras/server/compras-pg";

/**
 * GET /api/compras/[id] — detalle de una compra: cabecera + líneas
 * (compras_items) + movimientos de inventario relacionados (origen='compra',
 * referencia=numero_control). La factura se obtiene aparte vía
 * GET /api/compras/[id]/factura (URL firmada on-demand).
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
    const compra = await getCompraById(schema, ctx.auth.empresa_id, id);
    if (!compra) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const [items, movimientos] = await Promise.all([
      listCompraItems(schema, ctx.auth.empresa_id, id),
      listMovimientosDeCompra(schema, ctx.auth.empresa_id, compra.numero_control),
    ]);

    return NextResponse.json(successResponse({ compra, items, movimientos }));
  } catch (err) {
    console.error("[/api/compras/[id] GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar la compra."), { status: 500 });
  }
}
