"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Badge from "@/components/ui/Badge";
import { getCompraDetalle, getFacturaSignedUrl } from "@/lib/compras/storage";
import type { CompraDetalle } from "@/lib/compras/types";

function formatGs(valor: number) {
  return `Gs. ${Math.round(valor).toLocaleString("es-PY")}`;
}

function formatFecha(iso: string) {
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

const ivaLabel: Record<string, string> = {
  exenta: "Exenta",
  "5": "IVA 5%",
  "10": "IVA 10%",
};

function DatoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

export default function CompraDetallePage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";

  const [data, setData] = useState<CompraDetalle | null>(null);
  const [cargando, setCargando] = useState(true);
  const [noEncontrada, setNoEncontrada] = useState(false);
  const [abriendoFactura, setAbriendoFactura] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    setCargando(true);
    getCompraDetalle(id).then((d) => {
      if (cancel) return;
      if (!d) setNoEncontrada(true);
      else setData(d);
      setCargando(false);
    });
    return () => { cancel = true; };
  }, [id]);

  async function verFactura() {
    setAbriendoFactura(true);
    try {
      const r = await getFacturaSignedUrl(id);
      if (r?.factura_url) window.open(r.factura_url, "_blank", "noopener");
      else alert("No se pudo abrir la factura.");
    } finally {
      setAbriendoFactura(false);
    }
  }

  if (cargando) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="San Antonio · Adquisiciones" title="Detalle de compra" backHref="/compras" backLabel="Compras" />
        <p className="text-slate-500 animate-pulse">Cargando…</p>
      </div>
    );
  }

  if (noEncontrada || !data) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="San Antonio · Adquisiciones" title="Detalle de compra" backHref="/compras" backLabel="Compras" />
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-slate-500">
          No se encontró la compra solicitada.
        </div>
      </div>
    );
  }

  const { compra, items, movimientos } = data;
  const esUSD = compra.moneda === "USD";
  // Líneas a mostrar: multiproducto (compras_items) o, si no hay, la línea inline legacy.
  const lineas =
    items.length > 0
      ? items
      : [
          {
            id: compra.id,
            producto_id: compra.producto_id,
            producto_nombre: compra.producto_nombre,
            sku: "",
            cantidad: compra.cantidad,
            costo_unitario: compra.costo_unitario,
            iva_tipo: compra.iva_tipo,
            subtotal: compra.subtotal,
            monto_iva: compra.monto_iva,
            total_linea: compra.total,
          },
        ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Adquisiciones"
        title={`Compra ${compra.numero_control}`}
        backHref="/compras"
        backLabel="Compras"
        actions={
          compra.factura_path ? (
            <button
              type="button"
              onClick={verFactura}
              disabled={abriendoFactura}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-4 py-2.5 rounded-lg transition-colors disabled:opacity-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
              </svg>
              {abriendoFactura ? "Abriendo…" : "Ver factura"}
            </button>
          ) : undefined
        }
      />

      {/* Datos generales */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-5xl">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Datos de la compra</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <DatoItem label="N° Control" value={<span className="font-mono">{compra.numero_control}</span>} />
          <DatoItem label="Fecha" value={formatFecha(compra.fecha)} />
          <DatoItem label="Proveedor" value={compra.proveedor_nombre} />
          <DatoItem
            label="Estado"
            value={<Badge tone="neutral">{compra.estado ?? "—"}</Badge>}
          />
          <DatoItem
            label="Pago"
            value={
              <Badge tone={compra.tipo_pago === "credito" ? "warning" : "neutral"}>
                {compra.tipo_pago === "contado"
                  ? "Contado"
                  : compra.tipo_pago === "credito"
                  ? `Crédito ${compra.plazo_dias ?? ""}d`
                  : "—"}
              </Badge>
            }
          />
          <DatoItem label="Moneda" value={esUSD ? `USD (TC ${compra.tipo_cambio.toLocaleString("es-PY")})` : "Guaraníes"} />
          <DatoItem label="Timbrado" value={compra.nro_timbrado || "—"} />
          <DatoItem label="Líneas" value={String(items.length > 0 ? items.length : 1)} />
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:justify-end gap-2 sm:gap-8 text-sm">
          <div className="flex justify-between sm:block sm:text-right">
            <span className="text-slate-500 sm:block">Subtotal</span>
            <span className="font-medium tabular-nums text-slate-800">{formatGs(compra.subtotal)}</span>
          </div>
          <div className="flex justify-between sm:block sm:text-right">
            <span className="text-slate-500 sm:block">IVA</span>
            <span className="font-medium tabular-nums text-slate-800">
              {compra.monto_iva > 0 ? formatGs(compra.monto_iva) : "—"}
            </span>
          </div>
          <div className="flex justify-between sm:block sm:text-right">
            <span className="text-slate-500 sm:block">Total</span>
            <span className="text-lg font-bold tabular-nums text-slate-900">{formatGs(compra.total)}</span>
          </div>
        </div>
      </div>

      {/* Productos comprados */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-5xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">Productos comprados</h2>
          {items.length === 0 && (
            <span className="text-xs text-slate-400">Compra mono-producto (sin detalle de líneas)</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b text-slate-500">
                <th className="py-2.5 pr-4 font-medium">Producto</th>
                <th className="py-2.5 pr-4 font-medium">SKU</th>
                <th className="py-2.5 pr-4 font-medium text-right">Cant.</th>
                <th className="py-2.5 pr-4 font-medium text-right">Costo unit.</th>
                <th className="py-2.5 pr-4 font-medium">IVA</th>
                <th className="py-2.5 pr-4 font-medium text-right">Subtotal</th>
                <th className="py-2.5 font-medium text-right">Total línea</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 font-medium text-slate-800">{l.producto_nombre}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-slate-500">{l.sku || "—"}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{l.cantidad}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{formatGs(l.costo_unitario)}</td>
                  <td className="py-3 pr-4 text-xs text-slate-500">{ivaLabel[l.iva_tipo] ?? l.iva_tipo}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{formatGs(l.subtotal)}</td>
                  <td className="py-3 text-right tabular-nums font-semibold text-slate-800">{formatGs(l.total_linea)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Factura adjunta */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-5xl">
        <h2 className="text-base font-semibold text-slate-800 mb-3">Factura adjunta</h2>
        {compra.factura_path ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              {compra.factura_nombre_original || "Factura del proveedor"}
            </span>
            <button
              type="button"
              onClick={verFactura}
              disabled={abriendoFactura}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50"
            >
              {abriendoFactura ? "Abriendo…" : "Ver factura"}
            </button>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin factura adjunta.</p>
        )}
      </div>

      {/* Movimientos generados */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-5xl">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Movimientos de inventario generados</h2>
        {movimientos.length === 0 ? (
          <p className="text-sm text-slate-400">No se encontraron movimientos relacionados a esta compra.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Producto</th>
                  <th className="py-2.5 pr-4 font-medium">Tipo</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Cantidad</th>
                  <th className="py-2.5 pr-4 font-medium">Referencia</th>
                  <th className="py-2.5 font-medium text-right">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-medium text-slate-800">
                      {m.producto_nombre}
                      {m.producto_sku && <span className="ml-2 font-mono text-xs text-slate-400">{m.producto_sku}</span>}
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={m.tipo === "ENTRADA" ? "success" : "neutral"}>{m.tipo}</Badge>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{m.cantidad}</td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-500">{m.referencia ?? "—"}</td>
                    <td className="py-3 text-right tabular-nums text-slate-500 text-xs">{formatFecha(m.fecha)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
