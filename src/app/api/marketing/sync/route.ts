import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { previewSyncMarketing, regenerarMesCompleto, sincronizarClientesMarketing } from "@/lib/marketing/generador";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase no configurado");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * GET /api/marketing/sync?preview=1&mes=YYYY-MM
 * Preview de sincronización: clientes a marcar, tareas a generar. No ejecuta nada.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol();
    if (!auth?.user?.email) {
      return NextResponse.json(errorResponse("No autenticado"), { status: 401 });
    }

    if (!isAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo administradores pueden sincronizar marketing"), { status: 403 });
    }

    const empresaId = auth.empresa_id;
    if (!empresaId) {
      return NextResponse.json(errorResponse("Usuario sin empresa asignada"), { status: 403 });
    }

    const url = new URL(request.url);
    const mes = url.searchParams.get("mes") || new Date().toISOString().slice(0, 7);

    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json(errorResponse("Formato mes inválido (usar YYYY-MM)"), { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const previewData = await previewSyncMarketing({
      empresa_id: empresaId,
      mes,
      supabaseClient: supabaseAdmin,
    });
    return NextResponse.json(successResponse(previewData));
  } catch (err) {
    console.error("[api/marketing/sync] GET:", err);
    return NextResponse.json(errorResponse("Error en preview"), { status: 500 });
  }
}

/**
 * POST /api/marketing/sync
 * Ejecuta sincronización: marca clientes y genera tareas.
 * Body: { mes: "YYYY-MM", confirmar: true }
 */
export async function POST(request: NextRequest) {
  try {

    const auth = await getAuthWithRol();
    if (!auth?.user?.email) {
      return NextResponse.json(errorResponse("No autenticado"), { status: 401 });
    }

    if (!isAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo administradores pueden sincronizar marketing"), { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const mes = typeof body.mes === "string" ? body.mes : new Date().toISOString().slice(0, 7);
    const confirmar = body.confirmar === true;

    if (!confirmar) {
      return NextResponse.json(errorResponse("Debe enviar confirmar: true para ejecutar"), { status: 400 });
    }

    if (!/^\d{4}-\d{2}$/.test(mes)) {
      return NextResponse.json(errorResponse("Formato mes inválido (usar YYYY-MM)"), { status: 400 });
    }

    const empresaId = auth.empresa_id;
    if (!empresaId) {
      return NextResponse.json(errorResponse("Usuario sin empresa asignada"), { status: 403 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const clientesActualizados = await sincronizarClientesMarketing(empresaId, supabaseAdmin);
    const resultado = await regenerarMesCompleto({
      empresa_id: empresaId,
      mes,
      supabaseClient: supabaseAdmin,
    });

    return NextResponse.json(
      successResponse({
        mes,
        clientes_actualizados: clientesActualizados,
        tareas_eliminadas: resultado.eliminadas,
        tareas_generadas: resultado.generadas,
        tareas_omitidas: resultado.omitidas,
        errores: resultado.errores,
      })
    );
  } catch (err) {
    console.error("[api/marketing/sync] POST:", err);
    return NextResponse.json(errorResponse("Error al sincronizar"), { status: 500 });
  }
}
