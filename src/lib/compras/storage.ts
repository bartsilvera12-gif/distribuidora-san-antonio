import type { Compra, CompraItem, CompraDetalle, ResumenCompras, Moneda, TipoPago } from "./types";

interface CompraApiRow {
  id: string; numero_control: string; proveedor_id: string; proveedor_nombre: string;
  producto_id: string; producto_nombre: string; cantidad: string | number; moneda: string;
  tipo_cambio: string | number; costo_unitario_original: string | number;
  costo_unitario: string | number; iva_tipo: string;
  subtotal: string | number; monto_iva: string | number; total: string | number;
  precio_venta: string | number; margen_venta: string | number | null;
  tipo_pago: string; plazo_dias: number | null; nro_timbrado: string; estado: string;
  fecha: string;
  items_count?: number | string | null;
  factura_path?: string | null;
  factura_nombre_original?: string | null;
  factura_mime_type?: string | null;
}

function mapRow(r: CompraApiRow): Compra {
  return {
    id: r.id,
    numero_control: r.numero_control,
    proveedor_id: r.proveedor_id,
    proveedor_nombre: r.proveedor_nombre,
    producto_id: r.producto_id,
    producto_nombre: r.producto_nombre,
    cantidad: Number(r.cantidad),
    moneda: (r.moneda === "USD" ? "USD" : "PYG") as Compra["moneda"],
    tipo_cambio: Number(r.tipo_cambio),
    costo_unitario_original: Number(r.costo_unitario_original),
    costo_unitario: Number(r.costo_unitario),
    iva_tipo: r.iva_tipo as Compra["iva_tipo"],
    subtotal: Number(r.subtotal),
    monto_iva: Number(r.monto_iva),
    total: Number(r.total),
    precio_venta: Number(r.precio_venta),
    margen_venta: r.margen_venta != null ? Number(r.margen_venta) : 0,
    tipo_pago: r.tipo_pago as Compra["tipo_pago"],
    plazo_dias: r.plazo_dias ?? undefined,
    nro_timbrado: r.nro_timbrado,
    fecha: r.fecha,
    estado: r.estado,
    items_count: r.items_count != null ? Number(r.items_count) : undefined,
    factura_path: r.factura_path ?? null,
    factura_nombre_original: r.factura_nombre_original ?? null,
    factura_mime_type: r.factura_mime_type ?? null,
  };
}

export async function getCompras(): Promise<Compra[]> {
  try {
    const r = await fetch("/api/compras", { credentials: "include", cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) {
      console.error("[compras] getCompras:", (j as { error?: string })?.error ?? r.status);
      return [];
    }
    const list = ((j.data as { compras?: CompraApiRow[] }).compras ?? []) as CompraApiRow[];
    return list.map(mapRow);
  } catch (e) {
    console.error("[compras] getCompras:", e);
    return [];
  }
}

export interface SaveCompraResult {
  success: true;
  compra: Compra;
  warning?: string | null;
}
export interface SaveCompraError {
  success: false;
  error: string;
}

/** Cabecera + líneas para una compra multiproducto. */
export interface SaveCompraMultiInput {
  proveedor_id: string;
  proveedor_nombre: string;
  moneda: Moneda;
  tipo_cambio: number;
  tipo_pago: TipoPago;
  plazo_dias?: number;
  nro_timbrado: string;
  items: CompraItem[];
}

/**
 * Crea una compra multiproducto: cabecera en `compras` + N líneas en
 * `compras_items`, con impacto de stock/costo por línea (server-side).
 */
export async function saveCompraMulti(
  datos: SaveCompraMultiInput
): Promise<SaveCompraResult | SaveCompraError> {
  try {
    const r = await fetch("/api/compras", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proveedor_id: datos.proveedor_id,
        proveedor_nombre: datos.proveedor_nombre,
        moneda: datos.moneda,
        tipo_cambio: datos.tipo_cambio,
        tipo_pago: datos.tipo_pago,
        plazo_dias: datos.plazo_dias ?? null,
        nro_timbrado: datos.nro_timbrado,
        items: datos.items,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) {
      const err = (j as { error?: string })?.error ?? `Error ${r.status} al guardar la compra.`;
      console.error("[compras] saveCompraMulti:", err);
      return { success: false, error: err };
    }
    const data = j.data as { compra?: CompraApiRow; warning?: string | null };
    if (!data.compra) return { success: false, error: "Respuesta inválida del servidor." };
    return { success: true, compra: mapRow(data.compra), warning: data.warning ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red";
    console.error("[compras] saveCompraMulti:", e);
    return { success: false, error: msg };
  }
}

export async function saveCompra(
  datos: Omit<Compra, "id" | "numero_control" | "fecha">
): Promise<SaveCompraResult | SaveCompraError> {
  try {
    const r = await fetch("/api/compras", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) {
      const err = (j as { error?: string })?.error ?? `Error ${r.status} al guardar la compra.`;
      console.error("[compras] saveCompra:", err);
      return { success: false, error: err };
    }
    const data = j.data as { compra?: CompraApiRow; warning?: string | null };
    if (!data.compra) {
      return { success: false, error: "Respuesta inválida del servidor." };
    }
    return { success: true, compra: mapRow(data.compra), warning: data.warning ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red";
    console.error("[compras] saveCompra:", e);
    return { success: false, error: msg };
  }
}

// ─── Factura adjunta ────────────────────────────────────────────────────────────

export interface FacturaResult {
  factura_path: string | null;
  factura_url: string | null;
  factura_nombre_original: string | null;
  factura_mime_type: string | null;
}

/** Sube la factura (imagen o PDF) de una compra ya creada (POST con su id). */
export async function uploadFacturaCompra(
  compraId: string,
  file: File
): Promise<{ success: true; data: FacturaResult } | { success: false; error: string }> {
  try {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`/api/compras/${encodeURIComponent(compraId)}/factura`, {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) {
      return { success: false, error: (j as { error?: string })?.error ?? `Error ${r.status} al subir la factura.` };
    }
    return { success: true, data: j.data as FacturaResult };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Error de red" };
  }
}

/** Obtiene una URL firmada temporal para ver/descargar la factura de una compra. */
export async function getFacturaSignedUrl(compraId: string): Promise<FacturaResult | null> {
  try {
    const r = await fetch(`/api/compras/${encodeURIComponent(compraId)}/factura`, {
      credentials: "include",
      cache: "no-store",
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) return null;
    return j.data as FacturaResult;
  } catch {
    return null;
  }
}

// ─── Detalle y resumen ────────────────────────────────────────────────────────

interface CompraItemApiRow {
  id: string; producto_id: string; producto_nombre: string; sku: string;
  cantidad: string | number; costo_unitario: string | number; iva_tipo: string;
  subtotal: string | number; monto_iva: string | number; total_linea: string | number;
}
interface MovimientoApiRow {
  id: string; producto_nombre: string; producto_sku: string | null; tipo: string;
  cantidad: string | number; costo_unitario: string | number;
  referencia: string | null; fecha: string;
}

/** Detalle de una compra: cabecera + líneas + movimientos. */
export async function getCompraDetalle(id: string): Promise<CompraDetalle | null> {
  try {
    const r = await fetch(`/api/compras/${encodeURIComponent(id)}`, { credentials: "include", cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) return null;
    const d = j.data as { compra: CompraApiRow; items: CompraItemApiRow[]; movimientos: MovimientoApiRow[] };
    return {
      compra: mapRow(d.compra),
      items: (d.items ?? []).map((i) => ({
        id: i.id,
        producto_id: i.producto_id,
        producto_nombre: i.producto_nombre,
        sku: i.sku,
        cantidad: Number(i.cantidad),
        costo_unitario: Number(i.costo_unitario),
        iva_tipo: i.iva_tipo,
        subtotal: Number(i.subtotal),
        monto_iva: Number(i.monto_iva),
        total_linea: Number(i.total_linea),
      })),
      movimientos: (d.movimientos ?? []).map((m) => ({
        id: m.id,
        producto_nombre: m.producto_nombre,
        producto_sku: m.producto_sku,
        tipo: m.tipo,
        cantidad: Number(m.cantidad),
        costo_unitario: Number(m.costo_unitario),
        referencia: m.referencia,
        fecha: m.fecha,
      })),
    };
  } catch (e) {
    console.error("[compras] getCompraDetalle:", e);
    return null;
  }
}

/** Resumen/mini-dashboard de compras (agregados server-side). Rango opcional
 *  (YYYY-MM-DD); si se omite, el server usa el mes actual. */
export async function getResumenCompras(desde?: string, hasta?: string): Promise<ResumenCompras | null> {
  try {
    const qs = new URLSearchParams();
    if (desde) qs.set("desde", desde);
    if (hasta) qs.set("hasta", hasta);
    const q = qs.toString();
    const r = await fetch(`/api/compras/resumen${q ? `?${q}` : ""}`, { credentials: "include", cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) return null;
    return j.data as ResumenCompras;
  } catch (e) {
    console.error("[compras] getResumenCompras:", e);
    return null;
  }
}
