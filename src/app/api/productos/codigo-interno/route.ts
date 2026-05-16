import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

export const INTERNAL_CODE_PREFIX = "INT-";

// Identificador SQL seguro: solo permite [a-zA-Z0-9_] tras validar el schema
// proveniente del catalogo. Nunca se concatena input del usuario.
function quoteIdent(ident: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) {
    throw new Error(`Schema invalido: ${ident}`);
  }
  return `"${ident}"`;
}

function empresaShort(nombre: string | null | undefined): string {
  const raw = (nombre ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const alnum = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return alnum.slice(0, 3) || "EMP";
}

function yyyymm(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

/**
 * POST /api/productos/codigo-interno
 *
 * Genera atomicamente un codigo interno unico por empresa via funcion plpgsql
 * `incrementar_secuencia_producto(empresa_id)` instalada en cada schema tenant.
 * UPSERT con ON CONFLICT DO UPDATE bloquea la fila — no hay race condition.
 *
 * Formato: INT-{EMPRESA_SHORT}-{YYYYMM}-{SEQ6}
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;

    // Nombre de empresa para prefijo (catalogo zentra_erp.empresas)
    const catalog = createServiceRoleClient();
    const { data: emp } = await catalog
      .from("empresas")
      .select("nombre_empresa")
      .eq("id", empresaId)
      .maybeSingle();
    const short = empresaShort((emp as { nombre_empresa?: string | null } | null)?.nombre_empresa);

    // Resolver schema del tenant
    const schema = await fetchDataSchemaForEmpresaId(empresaId);
    const schemaQ = quoteIdent(schema);

    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json(errorResponse("Pool de Postgres no disponible."), { status: 500 });
    }

    // Llamada atomica
    const { rows } = await pool.query<{ v: string }>(
      `SELECT ${schemaQ}.incrementar_secuencia_producto($1::uuid) AS v`,
      [empresaId]
    );
    const nextValue = Number(rows[0]?.v ?? 0);
    if (!Number.isFinite(nextValue) || nextValue <= 0) {
      return NextResponse.json(errorResponse("No se pudo generar la secuencia."), { status: 500 });
    }

    const seq6 = String(nextValue).padStart(6, "0");
    const codigo = `${INTERNAL_CODE_PREFIX}${short}-${yyyymm()}-${seq6}`;

    return NextResponse.json(successResponse({ codigo, interno: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
