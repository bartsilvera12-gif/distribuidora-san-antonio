import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";

/**
 * GET /api/ventas/[id]/ticket?w=58|80
 *
 * Devuelve HTML imprimible del ticket interno NO FISCAL de la venta.
 * Lee: ventas + ventas_items + (opcional) proyectos.brief_data del pedido de cocina.
 *
 * No toca SIFEN, no genera XML, no usa timbrado. Es un comprobante interno
 * para caja/cocina/cliente, marcado como "no válido como factura legal".
 *
 * Query params:
 *  - w: ancho de papel térmico (58 o 80). Default 80.
 */

const NEGOCIO = "EN LO DE MARI";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatGs(v: number): string {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

interface VentaRow {
  id: string;
  numero_control: string;
  fecha: string;
  subtotal: number | string;
  monto_iva: number | string;
  total: number | string;
  observaciones: string | null;
}

interface ItemRow {
  producto_nombre: string;
  sku: string;
  cantidad: number | string;
  precio_venta: number | string;
  total_linea: number | string;
}

interface PedidoBrief {
  modalidad?: "local" | "delivery" | "carry_out";
  mesa?: string | null;
  cliente_nombre?: string | null;
  cliente_telefono?: string | null;
  direccion_entrega?: string | null;
  observacion?: string | null;
}

function modalidadLabel(m: string | null | undefined): string {
  if (m === "local") return "Local";
  if (m === "delivery") return "Delivery";
  if (m === "carry_out") return "Retiro";
  return "";
}

export async function GET(request: NextRequest, ctxParams: { params: Promise<{ id: string }> }) {
  const { id } = await ctxParams.params;
  const url = new URL(request.url);
  const wParam = url.searchParams.get("w");
  const widthMm = wParam === "58" ? 58 : 80;
  const fontPx = widthMm === 58 ? 11 : 12;

  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const empresaId = ctx.auth.empresa_id;

  // Venta
  const vQ = await ctx.supabase
    .from("ventas")
    .select("id, numero_control, fecha, subtotal, monto_iva, total, observaciones")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (vQ.error) {
    return new NextResponse(`Error: ${vQ.error.message}`, { status: 500 });
  }
  if (!vQ.data) {
    return new NextResponse("Venta no encontrada", { status: 404 });
  }
  const venta = vQ.data as unknown as VentaRow;

  // Items
  const iQ = await ctx.supabase
    .from("ventas_items")
    .select("producto_nombre, sku, cantidad, precio_venta, total_linea")
    .eq("venta_id", id)
    .eq("empresa_id", empresaId);
  if (iQ.error) {
    return new NextResponse(`Error items: ${iQ.error.message}`, { status: 500 });
  }
  const items = (iQ.data ?? []) as unknown as ItemRow[];

  // Pedido cocina (opcional) — busca card de Pedidos vinculada a esta venta.
  let brief: PedidoBrief | null = null;
  try {
    const pQ = await ctx.supabase
      .from("proyectos")
      .select("brief_data")
      .eq("empresa_id", empresaId)
      .filter("metadata->>venta_id", "eq", id)
      .limit(1)
      .maybeSingle();
    if (!pQ.error && pQ.data) {
      brief = (pQ.data as { brief_data: PedidoBrief }).brief_data ?? null;
    }
  } catch {
    brief = null;
  }

  const subtotal = Number(venta.subtotal);
  const ivaTotal = Number(venta.monto_iva);
  const total = Number(venta.total);

  // Render HTML térmico
  const modalidad = modalidadLabel(brief?.modalidad);
  const itemsRows = items
    .map((it) => {
      const cant = Number(it.cantidad);
      const punit = Number(it.precio_venta);
      const sub = Number(it.total_linea);
      return `<tr>
        <td class="qty">${cant}</td>
        <td class="name">${escapeHtml(it.producto_nombre)}</td>
        <td class="amt">${formatGs(sub)}</td>
      </tr>
      <tr class="sub"><td></td><td colspan="2">${cant} × ${formatGs(punit)}</td></tr>`;
    })
    .join("");

  const datosPedido: string[] = [];
  if (modalidad) datosPedido.push(`<div><strong>${modalidad}</strong>${brief?.mesa ? ` · Mesa ${escapeHtml(brief.mesa)}` : ""}</div>`);
  if (brief?.cliente_nombre) datosPedido.push(`<div>Cliente: ${escapeHtml(brief.cliente_nombre)}</div>`);
  if (brief?.cliente_telefono) datosPedido.push(`<div>Tel: ${escapeHtml(brief.cliente_telefono)}</div>`);
  if (brief?.direccion_entrega) datosPedido.push(`<div>Dir: ${escapeHtml(brief.direccion_entrega)}</div>`);
  const obs = brief?.observacion || venta.observaciones || "";

  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Ticket ${escapeHtml(venta.numero_control)} — ${NEGOCIO}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: ui-monospace, "Courier New", monospace; font-size: ${fontPx}px; color: #000; background: #f1f1f1; margin: 0; padding: 20px; }
  .paper { background: #fff; width: ${widthMm}mm; margin: 0 auto; padding: 6mm 4mm; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
  h1 { font-size: ${fontPx + 4}px; text-align: center; margin: 0 0 2mm; letter-spacing: 1px; }
  .center { text-align: center; }
  .meta { font-size: ${fontPx - 1}px; text-align: center; margin: 1mm 0 2mm; }
  hr { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  .pedido { font-size: ${fontPx}px; margin: 1mm 0 2mm; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 0.5mm 0; }
  td.qty { width: 8mm; }
  td.amt { width: 22mm; text-align: right; white-space: nowrap; }
  tr.sub td { color: #555; font-size: ${fontPx - 2}px; padding-bottom: 1mm; }
  .totales td { padding: 0.7mm 0; }
  .totales .lbl { text-align: left; }
  .totales .val { text-align: right; white-space: nowrap; }
  .total-row { font-weight: bold; font-size: ${fontPx + 2}px; border-top: 1px solid #000; }
  .obs { font-size: ${fontPx - 1}px; margin: 2mm 0; }
  .footer { font-size: ${fontPx - 2}px; text-align: center; margin-top: 3mm; font-style: italic; }
  .actions { max-width: ${widthMm}mm; margin: 8mm auto 0; text-align: center; }
  .actions button { padding: 8px 16px; font-size: 13px; cursor: pointer; border: 1px solid #333; background: #fff; border-radius: 6px; }
  .actions button:hover { background: #f5f5f5; }
  .actions a { margin-left: 12px; font-size: 13px; color: #444; }
  @media print {
    body { background: #fff; padding: 0; }
    .paper { width: ${widthMm}mm; box-shadow: none; padding: 2mm; }
    .actions { display: none; }
    @page { margin: 0; size: ${widthMm}mm auto; }
  }
</style>
</head>
<body>
  <div class="paper">
    <h1>${NEGOCIO}</h1>
    <div class="meta">
      ${escapeHtml(venta.numero_control)}<br>
      ${formatFecha(venta.fecha)}
    </div>
    ${datosPedido.length > 0 ? `<hr><div class="pedido">${datosPedido.join("")}</div>` : ""}
    <hr>
    <table>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>
    <hr>
    <table class="totales">
      <tbody>
        <tr><td class="lbl">Subtotal</td><td class="val">${formatGs(subtotal)}</td></tr>
        ${ivaTotal > 0 ? `<tr><td class="lbl">IVA</td><td class="val">${formatGs(ivaTotal)}</td></tr>` : ""}
        <tr class="total-row"><td class="lbl">TOTAL</td><td class="val">${formatGs(total)}</td></tr>
      </tbody>
    </table>
    ${obs ? `<hr><div class="obs">Obs: ${escapeHtml(obs)}</div>` : ""}
    <hr>
    <div class="footer">
      ¡Gracias por tu compra!<br>
      Comprobante interno — no válido como factura legal.
    </div>
  </div>
  <div class="actions">
    <button type="button" onclick="window.print()">Imprimir</button>
    <a href="?w=${widthMm === 80 ? 58 : 80}">Cambiar a ${widthMm === 80 ? 58 : 80}mm</a>
  </div>
  <script>
    // Auto-abrir diálogo de impresión cuando viene de auto=1
    try {
      var u = new URL(location.href);
      if (u.searchParams.get('auto') === '1') {
        setTimeout(function(){ window.print(); }, 250);
      }
    } catch (e) {}
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
