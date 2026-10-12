import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getSaldoInicial, upsertSaldoInicial } from "@/lib/carga-historica/server";
import { toCalendarDateStr } from "@/lib/fechas/calendario";

/** GET /api/carga-historica/saldo-inicial — saldo inicial de caja y bancos. */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const saldo = await getSaldoInicial(schema, ctx.auth.empresa_id);
    return NextResponse.json(successResponse(saldo));
  } catch (err) {
    console.error("[/api/carga-historica/saldo-inicial GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo leer el saldo inicial."), { status: 500 });
  }
}

/**
 * PUT /api/carga-historica/saldo-inicial — guarda el saldo inicial de caja y
 * (opcional) bancos a la fecha de corte.
 * Body: { fechaCorte, cajaInicial, bancos?: [{entidad_bancaria_id?, nombre, saldo}], observaciones? }
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    if (!isAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo un administrador puede configurar los saldos iniciales."), { status: 403 });
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const fechaCorte = toCalendarDateStr(String(body.fechaCorte ?? ""));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) {
      return NextResponse.json(errorResponse("fechaCorte inválida (YYYY-MM-DD)."), { status: 400 });
    }
    const cajaInicial = Number(body.cajaInicial);
    if (!Number.isFinite(cajaInicial) || cajaInicial < 0) {
      return NextResponse.json(errorResponse("cajaInicial debe ser un número >= 0."), { status: 400 });
    }

    const bancosRaw = Array.isArray(body.bancos) ? (body.bancos as unknown[]) : [];
    const bancos = bancosRaw.map((b) => {
      const r = (b ?? {}) as Record<string, unknown>;
      const saldo = Number(r.saldo);
      return {
        entidad_bancaria_id: r.entidad_bancaria_id != null ? String(r.entidad_bancaria_id) : null,
        nombre: String(r.nombre ?? "").trim(),
        saldo: Number.isFinite(saldo) ? saldo : 0,
      };
    }).filter((b) => b.nombre !== "");

    // No se permiten saldos negativos (condición obligatoria).
    if (bancos.some((b) => b.saldo < 0)) {
      return NextResponse.json(errorResponse("Los saldos bancarios no pueden ser negativos."), { status: 400 });
    }

    const observaciones = typeof body.observaciones === "string" ? body.observaciones.slice(0, 2000) : null;

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    await upsertSaldoInicial(schema, auth.empresa_id, { fechaCorte, cajaInicial, bancos, observaciones });
    return NextResponse.json(successResponse({ fechaCorte, cajaInicial, bancos, observaciones }));
  } catch (err) {
    console.error("[/api/carga-historica/saldo-inicial PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar el saldo inicial."), { status: 500 });
  }
}
