import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { listCompras, insertCompraMultiConImpacto } from "@/lib/compras/server/compras-pg";
import type { CompraItemInput } from "@/lib/compras/server/compras-pg";

const IVA_OK = ["exenta", "5", "10"];
function ivaRate(t: string): number {
  return t === "5" ? 0.05 : t === "10" ? 0.10 : 0;
}

/**
 * Construye y valida las líneas de compra. Acepta `items[]` (multiproducto) o,
 * por compat, los campos inline de una compra mono-producto. Recalcula
 * subtotal/IVA/total por línea en el server para evitar drift/tampering.
 */
function parseItems(body: Record<string, unknown>): { items: CompraItemInput[] } | { error: string } {
  const rawList = Array.isArray(body.items) && body.items.length > 0
    ? (body.items as unknown[])
    : [body]; // legacy: una sola línea con los campos inline del body

  const items: CompraItemInput[] = [];
  for (const x of rawList) {
    if (!x || typeof x !== "object") return { error: "Línea de compra inválida." };
    const r = x as Record<string, unknown>;
    const producto_id = String(r.producto_id ?? "").trim();
    if (!producto_id) return { error: "Cada línea debe tener un producto." };
    const cantidad = Number(r.cantidad) || 0;
    if (cantidad <= 0) return { error: "La cantidad de cada línea debe ser mayor a 0." };
    const costo_unitario = Number(r.costo_unitario) || 0;
    if (costo_unitario <= 0) return { error: "El costo unitario de cada línea debe ser mayor a 0." };
    const iva_tipo = IVA_OK.includes(String(r.iva_tipo)) ? String(r.iva_tipo) : "10";
    const costo_unitario_original = Number(r.costo_unitario_original) || costo_unitario;
    const subtotal = cantidad * costo_unitario;
    const monto_iva = subtotal * ivaRate(iva_tipo);
    items.push({
      producto_id,
      producto_nombre: String(r.producto_nombre ?? ""),
      sku: String(r.sku ?? ""),
      cantidad,
      costo_unitario,
      costo_unitario_original,
      iva_tipo,
      subtotal,
      monto_iva,
      total_linea: subtotal + monto_iva,
    });
  }
  return { items };
}

/**
 * GET /api/compras — lista via PG directo.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const rows = await listCompras(schema, ctx.auth.empresa_id);
    return NextResponse.json(successResponse({ compras: rows }));
  } catch (err) {
    console.error("[/api/compras GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las compras."), { status: 500 });
  }
}

/**
 * POST /api/compras — crea compra + movimiento ENTRADA + actualiza producto.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const empresaId = ctx.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const req = (k: string) => body[k] != null && String(body[k]).trim() !== "";

    if (!req("proveedor_id")) return NextResponse.json(errorResponse("Falta el proveedor."), { status: 400 });
    if (!req("nro_timbrado"))
      return NextResponse.json(errorResponse("Falta el N° de timbrado."), { status: 400 });

    const parsed = parseItems(body);
    if ("error" in parsed) return NextResponse.json(errorResponse(parsed.error), { status: 400 });
    if (parsed.items.length === 0)
      return NextResponse.json(errorResponse("Agregá al menos una línea de producto."), { status: 400 });

    try {
      const out = await insertCompraMultiConImpacto(schema, empresaId, {
        proveedor_id: String(body.proveedor_id),
        proveedor_nombre: String(body.proveedor_nombre ?? ""),
        moneda: body.moneda === "USD" ? "USD" : "PYG",
        tipo_cambio: Number(body.tipo_cambio) || 1,
        tipo_pago: body.tipo_pago === "credito" ? "credito" : "contado",
        plazo_dias: body.plazo_dias != null && String(body.plazo_dias).trim() !== ""
          ? parseInt(String(body.plazo_dias), 10) || null : null,
        nro_timbrado: String(body.nro_timbrado).trim().toUpperCase(),
        created_by: ctx.auth.usuarioCatalogId ?? null,
        usuario_nombre: ctx.auth.usuarioNombre ?? ctx.auth.user?.email ?? null,
        items: parsed.items,
      });

      return NextResponse.json(successResponse({
        compra: out.compra,
        movimiento_id: out.movimiento_id,
        warning: out.movimiento_warning,
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      const code = (e as { code?: string })?.code;
      const detail = (e as { detail?: string })?.detail;
      console.error("[/api/compras POST]", { schema, empresaId, msg, code, detail });
      if (code === "23503") {
        return NextResponse.json(
          errorResponse("Proveedor o producto inválido. Verificá los datos seleccionados."),
          { status: 400 }
        );
      }
      if (code === "23505") {
        return NextResponse.json(
          errorResponse("Conflicto al generar el número de control. Reintentá."),
          { status: 409 }
        );
      }
      return NextResponse.json(
        errorResponse("No se pudo guardar la compra. Revisá los datos e intentá nuevamente."),
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[/api/compras POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo guardar la compra."), { status: 500 });
  }
}
