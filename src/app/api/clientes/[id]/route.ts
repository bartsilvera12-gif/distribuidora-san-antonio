import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase no configurado");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * DELETE /api/clientes/:id
 * Eliminación lógica (soft delete). Solo administradores.
 * Requiere: { deletion_reason: string } en el body.
 * No permite eliminar si hay suscripciones, facturas, pagos, ventas o tipificaciones.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthWithRol();
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    if (!isAdmin(auth)) {
      return NextResponse.json(errorResponse("Solo usuarios administradores pueden eliminar clientes"), { status: 403 });
    }

    const { id: clienteId } = await params;
    if (!clienteId) {
      return NextResponse.json(errorResponse("id es obligatorio"), { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const deletionReason = typeof body.deletion_reason === "string" ? body.deletion_reason.trim() : "";
    if (!deletionReason) {
      return NextResponse.json(errorResponse("El motivo de eliminación es obligatorio"), { status: 400 });
    }

    const supabase = getSupabase();

    // Verificar que el cliente existe, no está eliminado y pertenece a la empresa
    const { data: cliente, error: errCliente } = await supabase
      .from("clientes")
      .select("id, empresa_id, deleted_at")
      .eq("id", clienteId)
      .eq("empresa_id", auth.empresa_id)
      .is("deleted_at", null)
      .single();

    if (errCliente || !cliente) {
      return NextResponse.json(errorResponse("Cliente no encontrado o ya eliminado"), { status: 404 });
    }

    // Verificar ausencia de relaciones que impiden la baja
    const [susc, facturas, ventas, tipif] = await Promise.all([
      supabase.from("suscripciones").select("id").eq("cliente_id", clienteId).limit(1),
      supabase.from("facturas").select("id").eq("cliente_id", clienteId).limit(1),
      supabase.from("ventas").select("id").eq("cliente_id", clienteId).limit(1),
      supabase.from("tipificaciones").select("id").eq("cliente_id", clienteId).limit(1),
    ]);

    const tieneSuscripciones = (susc.data?.length ?? 0) > 0;
    const tieneFacturas = (facturas.data?.length ?? 0) > 0;
    const tieneVentas = (ventas.data?.length ?? 0) > 0;
    const tieneTipificaciones = (tipif.data?.length ?? 0) > 0;

    let tienePagos = false;
    const facturaIds = (facturas.data ?? []).map((f) => f.id);
    if (facturaIds.length > 0) {
      const { data: pagosData } = await supabase
        .from("pagos")
        .select("id")
        .in("factura_id", facturaIds)
        .limit(1);
      tienePagos = (pagosData?.length ?? 0) > 0;
    }

    if (tieneSuscripciones || tieneFacturas || tienePagos || tieneVentas || tieneTipificaciones) {
      const partes: string[] = [];
      if (tieneSuscripciones) partes.push("suscripciones");
      if (tieneFacturas) partes.push("facturas");
      if (tienePagos) partes.push("pagos");
      if (tieneVentas) partes.push("ventas");
      if (tieneTipificaciones) partes.push("tipificaciones");
      return NextResponse.json(
        errorResponse(`No se puede eliminar: el cliente tiene ${partes.join(", ")} asociados`),
        { status: 400 }
      );
    }

    const { error: errUpdate } = await supabase
      .from("clientes")
      .update({
        deleted_at:         new Date().toISOString(),
        deleted_by_user_id: auth.user.id,
        deletion_reason:    deletionReason,
        updated_at:         new Date().toISOString(),
      })
      .eq("id", clienteId)
      .is("deleted_at", null);

    if (errUpdate) {
      return NextResponse.json(errorResponse(errUpdate.message), { status: 500 });
    }

    return NextResponse.json(successResponse({ deleted: true }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
