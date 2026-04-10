import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/dashboard/tenant-tables
 * Filas de tablas operativas para el dashboard (misma empresa, service role + schema tenant).
 * Evita depender del cliente browser + RLS en esquemas `erp_*`.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const empresaId = auth.empresa_id;

    const now = new Date();
    const anio = now.getFullYear();
    const mes = now.getMonth() + 1;
    const inicioMes = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const finMes = `${anio}-${String(mes).padStart(2, "0")}-31`;

    const [
      clientesQ,
      facturasQ,
      pagosQ,
      tipificacionesQ,
      productosQ,
      ventasQ,
      ventasItemsQ,
      comprasQ,
      gastosQ,
      suscripcionesDashQ,
      bajasQ,
      suscBajasQ,
    ] = await Promise.all([
      supabase.from("clientes").select("*").eq("empresa_id", empresaId).is("deleted_at", null),
      supabase.from("facturas").select("*").eq("empresa_id", empresaId),
      supabase.from("pagos").select("id, factura_id, monto, fecha_pago").eq("empresa_id", empresaId),
      supabase.from("tipificaciones").select("*").eq("empresa_id", empresaId),
      supabase.from("productos").select("*").eq("empresa_id", empresaId),
      supabase.from("ventas").select("*").eq("empresa_id", empresaId),
      supabase.from("ventas_items").select("*").eq("empresa_id", empresaId),
      supabase.from("compras").select("*").eq("empresa_id", empresaId),
      supabase.from("gastos").select("id, monto, fecha").eq("empresa_id", empresaId),
      supabase
        .from("suscripciones")
        .select("id, cliente_id, precio, moneda, fecha_inicio, created_at")
        .eq("empresa_id", empresaId),
      supabase
        .from("clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .not("baja_operativa_at", "is", null)
        .gte("baja_operativa_at", inicioMes)
        .lte("baja_operativa_at", finMes + "T23:59:59.999Z"),
      supabase
        .from("suscripciones")
        .select("cliente_id, precio")
        .eq("empresa_id", empresaId)
        .eq("estado", "cancelada"),
    ]);

    const firstErr =
      clientesQ.error ||
      facturasQ.error ||
      pagosQ.error ||
      tipificacionesQ.error ||
      productosQ.error ||
      ventasQ.error ||
      ventasItemsQ.error ||
      comprasQ.error ||
      gastosQ.error ||
      suscripcionesDashQ.error ||
      bajasQ.error ||
      suscBajasQ.error;

    if (firstErr) {
      return NextResponse.json(errorResponse(firstErr.message), { status: 400 });
    }

    return NextResponse.json(
      successResponse({
        clientes: clientesQ.data ?? [],
        facturas: facturasQ.data ?? [],
        pagos: pagosQ.data ?? [],
        tipificaciones: tipificacionesQ.data ?? [],
        productos: productosQ.data ?? [],
        ventas: ventasQ.data ?? [],
        ventas_items: ventasItemsQ.data ?? [],
        compras: comprasQ.data ?? [],
        gastos: gastosQ.data ?? [],
        suscripciones: suscripcionesDashQ.data ?? [],
        clientes_baja_mes: bajasQ.data ?? [],
        suscripciones_canceladas: suscBajasQ.data ?? [],
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
