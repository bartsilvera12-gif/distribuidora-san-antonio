import { NextRequest, NextResponse } from "next/server";
import { listProspectosForEmpresa } from "@/lib/crm/storage";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/crm/prospectos
 * Prospectos + notas del tenant (service role en schema de datos de la empresa).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const items = await listProspectosForEmpresa(ctx.supabase, ctx.auth.empresa_id);
    return NextResponse.json(successResponse(items));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
