import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";
import { listCrmEtapasActivasPg } from "@/lib/crm/crm-prospectos-pg";

/**
 * GET /api/crm/etapas
 * Etapas CRM activas del tenant (columnas Kanban del funnel).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;
    const dataSchema = await fetchDataSchemaForEmpresaId(empresaId);
    const pool = getChatPostgresPool();

    const usePg = Boolean(pool && isLikelyUnexposedTenantChatSchema(dataSchema));

    console.info("[crm-funnel][board]", "request", {
      empresa_id: empresaId,
      data_schema: dataSchema,
      modo: usePg ? "postgres_directo" : "postgrest",
    });

    if (usePg && pool) {
      const rows = await listCrmEtapasActivasPg(pool, dataSchema, empresaId);
      if (rows !== null) {
        console.info("[crm-funnel][board]", "postgres_ok", {
          empresa_id: empresaId,
          data_schema: dataSchema,
          modo: "postgres_directo",
          etapas: rows.length,
        });
        return NextResponse.json(successResponse(rows));
      }
      return NextResponse.json(
        errorResponse("No se pudieron listar etapas CRM vía Postgres"),
        { status: 500 }
      );
    }

    const { data, error } = await supabase
      .from("crm_etapas")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("activo", true)
      .order("orden", { ascending: true });

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }
    console.info("[crm-funnel][board]", "postgrest_ok", {
      empresa_id: empresaId,
      data_schema: dataSchema,
      modo: "postgrest",
      etapas: (data ?? []).length,
    });
    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
