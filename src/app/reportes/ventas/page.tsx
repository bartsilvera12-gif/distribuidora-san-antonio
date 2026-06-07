"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import MesSelector from "@/components/reportes/MesSelector";
import { getVentasReporte } from "@/lib/reportes/storage";
import { mesActualAsuncion } from "@/lib/fechas/asuncion-bounds";
import type { VentasReporte } from "@/lib/reportes/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}
function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return iso;
  }
}

export default function VentasReportePage() {
  const [mes, setMes] = useState(mesActualAsuncion());
  const [data, setData] = useState<VentasReporte | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getVentasReporte(mes).then((d) => { if (!cancel) { setData(d); setCargando(false); } });
    return () => { cancel = true; };
  }, [mes]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Reportes"
        title="Ventas"
        description="Facturación y operaciones comerciales del período"
        backHref="/reportes"
        backLabel="Reportes"
        actions={
          <div className="flex items-center gap-3">
            <MesSelector mes={mes} onChange={setMes} />
            <ExportExcelButton url={`/api/reportes/ventas/export?mes=${mes}`} />
          </div>
        }
      />

      {cargando ? (
        <p className="text-slate-500 animate-pulse">Cargando…</p>
      ) : !data ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-slate-500">
          No se pudo cargar el reporte de ventas.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard compact label="Total vendido" value={formatGs(data.totalVendido)} accent />
            <StatCard compact label="Cantidad de ventas" value={String(data.cantidad)} />
            <StatCard compact label="Ticket promedio" value={formatGs(data.ticketPromedio)} />
            <StatCard compact label="Venta más alta" value={data.ventaMasAlta ? formatGs(data.ventaMasAlta.total) : "—"} hint={data.ventaMasAlta?.numero_control ?? "Sin ventas"} />
            <StatCard compact label="Minorista" value={formatGs(data.porTipoPrecio.minorista)} />
            <StatCard compact label="Mayorista" value={formatGs(data.porTipoPrecio.mayorista)} />
            <StatCard compact label="Al costo" value={formatGs(data.porTipoPrecio.costo)} />
            <StatCard compact label="Producto más vendido" value={data.productoMasVendido ? data.productoMasVendido.producto_nombre : "—"} hint={data.productoMasVendido ? `${data.productoMasVendido.cantidad} u.` : ""} />
          </div>
          {data.productoMayorFacturacion && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard compact label="Producto con mayor facturación" value={data.productoMayorFacturacion.producto_nombre} hint={formatGs(data.productoMayorFacturacion.total)} />
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Ventas del mes</h2>
            {data.ventas.length === 0 ? (
              <p className="text-sm text-slate-400">No hay ventas en el período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Fecha</th>
                      <th className="py-2.5 pr-4 font-medium">N° Venta</th>
                      <th className="py-2.5 pr-4 font-medium text-right">Ítems</th>
                      <th className="py-2.5 pr-4 font-medium text-right">Subtotal</th>
                      <th className="py-2.5 pr-4 font-medium text-right">IVA</th>
                      <th className="py-2.5 pr-4 font-medium text-right">Total</th>
                      <th className="py-2.5 pr-4 font-medium">Pago</th>
                      <th className="py-2.5 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ventas.map((v) => (
                      <tr key={v.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 text-slate-600 text-xs tabular-nums">{formatFecha(v.fecha)}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-500">{v.numero_control}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{v.items_count}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{formatGs(v.subtotal)}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-slate-500">{v.monto_iva > 0 ? formatGs(v.monto_iva) : "—"}</td>
                        <td className="py-3 pr-4 text-right tabular-nums font-semibold text-slate-800">{formatGs(v.total)}</td>
                        <td className="py-3 pr-4 text-slate-600 capitalize">{v.metodo_pago ?? "—"}</td>
                        <td className="py-3 text-slate-600 capitalize">{v.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
