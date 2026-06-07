import { NextRequest } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getReporteConciliacion } from "@/lib/reportes/server/reportes-pg";
import { asuncionMesBoundsUtc, normalizarMes } from "@/lib/fechas/asuncion-bounds";
import { sheetFromRows, buildXlsxBufferSheets, xlsxResponseHeaders } from "@/lib/excel/export";

const metodoLabel = (m: string) =>
  m === "transferencia" ? "Transferencia" : m === "tarjeta" ? "Tarjeta" : m;

/** GET /api/reportes/conciliacion/export?mes=YYYY-MM → XLSX (Resumen + Movimientos + Por banco). */
export async function GET(request: NextRequest) {
  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) return new Response("Unauthorized", { status: 401 });
  try {
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const mes = normalizarMes(new URL(request.url).searchParams.get("mes"));
    const { start, end } = asuncionMesBoundsUtc(mes);
    const r = await getReporteConciliacion(schema, ctx.auth.empresa_id, { mes, start, end, mesInicio: `${mes}-01` });

    const resumen = [
      { concepto: "Reporte", valor: "Conciliación entre cuentas" },
      { concepto: "Mes", valor: mes },
      { concepto: "Total transferencias", valor: r.totalTransferencias },
      { concepto: "Cantidad transferencias", valor: r.cantidadTransferencias },
      { concepto: "Total tarjetas", valor: r.totalTarjetas },
      { concepto: "Cantidad tarjetas", valor: r.cantidadTarjetas },
      { concepto: "Total general", valor: r.totalGeneral },
      { concepto: "Movimientos", valor: r.cantidadTotal },
    ];

    const buf = buildXlsxBufferSheets([
      sheetFromRows("Resumen", resumen, [
        { header: "Concepto", value: (x) => x.concepto, width: 28 },
        { header: "Valor", value: (x) => x.valor, width: 36 },
      ]),
      sheetFromRows("Movimientos", r.movimientos, [
        { header: "Fecha", value: (m) => (m.fecha ? new Date(m.fecha) : ""), width: 20 },
        { header: "N° Venta", value: (m) => m.numero_control ?? "", width: 16 },
        { header: "Método", value: (m) => metodoLabel(m.metodo_pago), width: 16 },
        { header: "Código banco", value: (m) => m.banco_codigo ?? "", width: 14 },
        { header: "Banco / entidad", value: (m) => m.banco_nombre ?? "", width: 28 },
        { header: "Titular", value: (m) => m.titular ?? "", width: 24 },
        { header: "Monto", value: (m) => m.monto, width: 16 },
        { header: "N° Comprobante", value: (m) => m.nro_comprobante ?? "", width: 20 },
        { header: "Estado venta", value: (m) => m.venta_estado ?? "", width: 14 },
      ]),
      sheetFromRows("Por banco", r.porBanco, [
        { header: "Banco / entidad", value: (x) => x.banco, width: 28 },
        { header: "Movimientos", value: (x) => x.cantidad, width: 14 },
        { header: "Total", value: (x) => x.total, width: 18 },
      ]),
    ]);
    return new Response(new Uint8Array(buf), { status: 200, headers: xlsxResponseHeaders(`conciliacion-${mes}`) });
  } catch (err) {
    console.error("[/api/reportes/conciliacion/export]", err instanceof Error ? err.message : err);
    return new Response("No se pudo generar el Excel", { status: 500 });
  }
}
