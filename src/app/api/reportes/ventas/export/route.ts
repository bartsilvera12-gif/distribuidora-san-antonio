import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getReporteVentas } from "@/lib/reportes/server/reportes-pg";
import { asuncionMesBoundsUtc, normalizarMes } from "@/lib/fechas/asuncion-bounds";
import { sheetFromRows, buildXlsxBufferSheets, xlsxResponseHeaders } from "@/lib/excel/export";

/** GET /api/reportes/ventas/export?mes=YYYY-MM → XLSX (Resumen + Ventas + Items vendidos). */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  try {
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const mes = normalizarMes(new URL(request.url).searchParams.get("mes"));
    const { start, end } = asuncionMesBoundsUtc(mes);
    const r = await getReporteVentas(schema, ctx.auth.empresa_id, { mes, start, end, mesInicio: `${mes}-01` });

    const resumen = [
      { concepto: "Reporte", valor: "Ventas" },
      { concepto: "Mes", valor: mes },
      { concepto: "Total vendido", valor: r.totalVendido },
      { concepto: "Cantidad de ventas", valor: r.cantidad },
      { concepto: "Ticket promedio", valor: Math.round(r.ticketPromedio) },
      { concepto: "Venta más alta", valor: r.ventaMasAlta ? `${r.ventaMasAlta.numero_control} (${r.ventaMasAlta.total})` : "—" },
      { concepto: "Total minorista", valor: r.porTipoPrecio.minorista },
      { concepto: "Total mayorista", valor: r.porTipoPrecio.mayorista },
      { concepto: "Total al costo", valor: r.porTipoPrecio.costo },
      { concepto: "Producto más vendido", valor: r.productoMasVendido ? `${r.productoMasVendido.producto_nombre} (${r.productoMasVendido.cantidad})` : "—" },
      { concepto: "Producto mayor facturación", valor: r.productoMayorFacturacion ? `${r.productoMayorFacturacion.producto_nombre} (${r.productoMayorFacturacion.total})` : "—" },
    ];

    const buf = buildXlsxBufferSheets([
      sheetFromRows("Resumen", resumen, [
        { header: "Concepto", value: (x) => x.concepto, width: 32 },
        { header: "Valor", value: (x) => x.valor, width: 40 },
      ]),
      sheetFromRows("Ventas", r.ventas, [
        { header: "Fecha", value: (v) => (v.fecha ? new Date(v.fecha) : ""), width: 20 },
        { header: "N° Venta", value: (v) => v.numero_control, width: 16 },
        { header: "Ítems", value: (v) => v.items_count, width: 8 },
        { header: "Subtotal", value: (v) => v.subtotal, width: 14 },
        { header: "IVA", value: (v) => v.monto_iva, width: 14 },
        { header: "Total", value: (v) => v.total, width: 14 },
        { header: "Método pago", value: (v) => v.metodo_pago ?? "", width: 14 },
        { header: "Estado", value: (v) => v.estado, width: 14 },
      ]),
      sheetFromRows("Items vendidos", r.items, [
        { header: "Fecha", value: (i) => (i.fecha ? new Date(i.fecha) : ""), width: 20 },
        { header: "N° Venta", value: (i) => i.numero_control, width: 16 },
        { header: "Producto", value: (i) => i.producto_nombre, width: 32 },
        { header: "SKU", value: (i) => i.sku, width: 18 },
        { header: "Cantidad", value: (i) => i.cantidad, width: 10 },
        { header: "Tipo precio", value: (i) => i.tipo_precio, width: 14 },
        { header: "Precio unit.", value: (i) => i.precio_venta, width: 14 },
        { header: "Subtotal", value: (i) => i.subtotal, width: 14 },
        { header: "IVA", value: (i) => i.monto_iva, width: 14 },
        { header: "Total línea", value: (i) => i.total_linea, width: 14 },
      ]),
    ]);
    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`ventas-${mes}`) });
  } catch (err) {
    console.error("[/api/reportes/ventas/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
