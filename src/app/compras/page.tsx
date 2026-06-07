"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCompras, getResumenCompras, getFacturaSignedUrl } from "@/lib/compras/storage";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import { FancySelect } from "@/components/ui/FancySelect";
import MobileFab from "@/components/ui/MobileFab";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { Compra, TipoPago, ResumenCompras } from "@/lib/compras/types";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none bg-white";

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
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

export default function ComprasPage() {
  const [todas, setTodas] = useState<Compra[]>([]);
  const [resumen, setResumen] = useState<ResumenCompras | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipoPago, setFiltroTipoPago] = useState<TipoPago | "">("");

  useEffect(() => {
    let cancel = false;
    getCompras().then((data) => {
      if (cancel) return;
      setTodas([...data].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
    });
    getResumenCompras().then((r) => { if (!cancel) setResumen(r); });
    return () => { cancel = true; };
  }, []);

  const filtradas = todas.filter((c) => {
    const texto = busqueda.toLowerCase();
    const coincideTexto =
      texto === "" ||
      c.proveedor_nombre.toLowerCase().includes(texto) ||
      c.producto_nombre.toLowerCase().includes(texto) ||
      c.numero_control.toLowerCase().includes(texto);
    const coincideTipoPago = filtroTipoPago === "" || c.tipo_pago === filtroTipoPago;
    return coincideTexto && coincideTipoPago;
  });

  const hayFiltros = busqueda || filtroTipoPago;

  const [abriendoFactura, setAbriendoFactura] = useState<string | null>(null);
  async function verFactura(id: string) {
    setAbriendoFactura(id);
    try {
      const r = await getFacturaSignedUrl(id);
      if (r?.factura_url) window.open(r.factura_url, "_blank", "noopener");
      else alert("No se pudo abrir la factura.");
    } finally {
      setAbriendoFactura(null);
    }
  }

  return (
    <div className="space-y-8">

      <PageHeader
        eyebrow="San Antonio · Adquisiciones"
        title="Compras"
        description="Registro de órdenes de compra a proveedores"
        actions={
          <>
            <ExportExcelButton url="/api/compras/export" />
            <Button href="/compras/nueva" size="sm">
              <span aria-hidden>+</span> Nueva compra
            </Button>
          </>
        }
      />

      {resumen && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">
            Resumen de compras
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Compras hoy"
              value={formatGs(resumen.hoy.total)}
              hint={`${resumen.hoy.cantidad} ${resumen.hoy.cantidad === 1 ? "compra" : "compras"}`}
              accent
            />
            <StatCard
              label="Compras del mes"
              value={formatGs(resumen.mes.total)}
              hint={`${resumen.mes.cantidad} ${resumen.mes.cantidad === 1 ? "compra" : "compras"}`}
            />
            <StatCard
              label="Compra más alta (mes)"
              value={resumen.compraMasAlta ? formatGs(resumen.compraMasAlta.total) : "—"}
              hint={
                resumen.compraMasAlta
                  ? `${resumen.compraMasAlta.numero_control} · ${resumen.compraMasAlta.proveedor_nombre}`
                  : "Sin compras este mes"
              }
            />
            <StatCard
              label="Proveedor principal (mes)"
              value={resumen.proveedorPrincipal ? resumen.proveedorPrincipal.proveedor_nombre : "—"}
              hint={resumen.proveedorPrincipal ? formatGs(resumen.proveedorPrincipal.total) : "Sin compras este mes"}
            />
          </div>
          {resumen.productoMasGasto && (
            <div className="mt-4">
              <StatCard
                label="Producto con más gasto (mes)"
                value={resumen.productoMasGasto.producto_nombre}
                hint={formatGs(resumen.productoMasGasto.gasto)}
                className="sm:max-w-md"
              />
            </div>
          )}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm ring-1 ring-[#4FAEB2]/15 p-6">

        <div className="mb-5">
          <h2 className="text-base font-semibold text-slate-800">Órdenes de compra</h2>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-gray-100">
          <input
            type="text"
            placeholder="Buscar por proveedor, producto o N° control..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-72`}
          />
          <FancySelect
            value={filtroTipoPago}
            onChange={(v) => setFiltroTipoPago(v as TipoPago | "")}
            ariaLabel="Filtrar por tipo de pago"
            className="w-44"
            size="sm"
            options={[
              { value: "", label: "Todos los pagos" },
              { value: "contado", label: "Contado" },
              { value: "credito", label: "Crédito" },
            ]}
          />
          {hayFiltros && (
            <button
              onClick={() => { setBusqueda(""); setFiltroTipoPago(""); }}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
            >
              Limpiar filtros
            </button>
          )}
          <span className="ml-auto text-sm text-gray-400">
            {filtradas.length} de {todas.length} compras
          </span>
        </div>

        {/* Tabla — min-w fuerza scroll horizontal; columnas auxiliares
            (Costo unit., IVA, Margen, Pago) se ocultan en mobile/tablet. */}
        <EdgeScrollArea>
          <table className="w-full min-w-[1000px] lg:min-w-0 text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="py-3 pr-4 font-medium">N° Control</th>
                <th className="py-3 pr-4 font-medium">Proveedor</th>
                <th className="py-3 pr-4 font-medium">Producto</th>
                <th className="py-3 pr-4 font-medium text-right">Cant.</th>
                <th className="py-3 pr-4 font-medium text-right hidden lg:table-cell">Costo unit.</th>
                <th className="py-3 pr-4 font-medium hidden lg:table-cell">IVA</th>
                <th className="py-3 pr-4 font-medium text-right">Total</th>
                <th className="py-3 pr-4 font-medium text-right hidden lg:table-cell">Margen</th>
                <th className="py-3 pr-4 font-medium hidden md:table-cell">Pago</th>
                <th className="py-3 pr-4 font-medium">Factura</th>
                <th className="py-3 pr-4 font-medium">Fecha</th>
                <th className="py-3 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-gray-400">
                    {todas.length === 0
                      ? "No hay compras registradas"
                      : "Ninguna compra coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtradas.map((c) => (
                  <tr key={c.id} className="border-b border-slate-200 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="py-4 pr-4 font-mono text-xs text-gray-500">
                      {c.numero_control}
                    </td>
                    <td className="py-4 pr-4 font-medium text-gray-800">
                      {c.proveedor_nombre}
                    </td>
                    <td className="py-4 pr-4 text-gray-600">
                      {c.producto_nombre}
                      {(c.items_count ?? 0) > 1 && (
                        <span className="ml-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 align-middle">
                          +{(c.items_count ?? 0) - 1} más
                        </span>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-right tabular-nums text-gray-700">
                      {c.cantidad}
                    </td>
                    <td className="py-4 pr-4 text-right tabular-nums text-gray-600 text-xs hidden lg:table-cell">
                      {c.moneda === "USD" && c.costo_unitario_original != null ? (
                        <span>
                          USD {c.costo_unitario_original.toLocaleString("es-PY")}
                          <br />
                          <span className="text-gray-400">≈ {formatGs(c.costo_unitario)}</span>
                        </span>
                      ) : (
                        formatGs(c.costo_unitario ?? c.total)
                      )}
                    </td>
                    <td className="py-4 pr-4 text-xs text-gray-500 hidden lg:table-cell">
                      {c.iva_tipo ? ivaLabel[c.iva_tipo] : "—"}
                    </td>
                    <td className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800">
                      {formatGs(c.total)}
                    </td>
                    <td className="py-4 pr-4 text-right tabular-nums text-sm font-medium text-green-600 hidden lg:table-cell">
                      {c.margen_venta != null ? `${c.margen_venta.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-4 pr-4 hidden md:table-cell">
                      <Badge tone={c.tipo_pago === "credito" ? "warning" : "neutral"}>
                        {c.tipo_pago === "contado" ? "Contado" : c.tipo_pago === "credito" ? `Crédito ${c.plazo_dias ?? ""}d` : "—"}
                      </Badge>
                    </td>
                    <td className="py-4 pr-4">
                      {c.factura_path ? (
                        <button
                          type="button"
                          onClick={() => verFactura(c.id)}
                          disabled={abriendoFactura === c.id}
                          className="inline-flex items-center gap-1 text-xs font-medium text-sky-700 hover:text-sky-900 border border-sky-200 hover:bg-sky-50 px-2.5 py-1 rounded-md transition-colors disabled:opacity-50"
                          title="Ver factura adjunta"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                            <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                            <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" clipRule="evenodd" />
                          </svg>
                          {abriendoFactura === c.id ? "Abriendo…" : "Ver"}
                        </button>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-4 pr-4 text-gray-500 text-xs tabular-nums">
                      {formatFecha(c.fecha)}
                    </td>
                    <td className="py-4 text-right">
                      <Link
                        href={`/compras/${c.id}`}
                        className="text-sm font-medium text-[#3F8E91] hover:text-[#2F6F72] hover:underline"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </EdgeScrollArea>

      </div>

      <MobileFab href="/compras/nueva" label="Nueva compra" />
    </div>
  );
}
