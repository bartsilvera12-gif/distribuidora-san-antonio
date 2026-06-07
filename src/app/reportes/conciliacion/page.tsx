"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import MesSelector from "@/components/reportes/MesSelector";
import { getConciliacionReporte } from "@/lib/reportes/storage";
import { mesActualAsuncion } from "@/lib/fechas/asuncion-bounds";
import type { ConciliacionReporte } from "@/lib/reportes/types";

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
const metodoLabel = (m: string) =>
  m === "transferencia" ? "Transferencia" : m === "tarjeta" ? "Tarjeta" : m;

export default function ConciliacionReportePage() {
  const [mes, setMes] = useState(mesActualAsuncion());
  const [data, setData] = useState<ConciliacionReporte | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getConciliacionReporte(mes).then((d) => {
      if (!cancel) {
        setData(d);
        setCargando(false);
      }
    });
    return () => {
      cancel = true;
    };
  }, [mes]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Reportes"
        title="Conciliación entre cuentas"
        description="Transferencias y tarjetas registradas al cobrar ventas del período"
        backHref="/reportes"
        backLabel="Reportes"
        actions={
          <div className="flex items-center gap-3">
            <MesSelector mes={mes} onChange={setMes} />
            <ExportExcelButton url={`/api/reportes/conciliacion/export?mes=${mes}`} />
          </div>
        }
      />

      {cargando ? (
        <p className="text-slate-500 animate-pulse">Cargando…</p>
      ) : !data ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-slate-500">
          No se pudo cargar la conciliación.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard compact label="Total general" value={formatGs(data.totalGeneral)} accent hint={`${data.cantidadTotal} movimiento(s)`} />
            <StatCard compact label="Transferencias" value={formatGs(data.totalTransferencias)} hint={`${data.cantidadTransferencias} mov.`} />
            <StatCard compact label="Tarjetas" value={formatGs(data.totalTarjetas)} hint={`${data.cantidadTarjetas} mov.`} />
            <StatCard compact label="Movimientos" value={String(data.cantidadTotal)} />
          </div>

          {/* Por banco */}
          {data.porBanco.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="text-base font-semibold text-slate-800 mb-4">Por banco / entidad</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Banco / entidad</th>
                      <th className="py-2.5 pr-4 font-medium text-right">Movimientos</th>
                      <th className="py-2.5 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.porBanco.map((b) => (
                      <tr key={b.banco} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 text-slate-700">{b.banco}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{b.cantidad}</td>
                        <td className="py-3 text-right tabular-nums font-semibold text-slate-800">{formatGs(b.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Movimientos */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Movimientos del mes</h2>
            {data.movimientos.length === 0 ? (
              <p className="text-sm text-slate-400">No hay transferencias ni tarjetas registradas en el período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Fecha</th>
                      <th className="py-2.5 pr-4 font-medium">N° Venta</th>
                      <th className="py-2.5 pr-4 font-medium">Método</th>
                      <th className="py-2.5 pr-4 font-medium">Banco / entidad</th>
                      <th className="py-2.5 pr-4 font-medium">Titular</th>
                      <th className="py-2.5 pr-4 font-medium text-right">Monto</th>
                      <th className="py-2.5 pr-4 font-medium">N° Comprobante</th>
                      <th className="py-2.5 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movimientos.map((m) => (
                      <tr key={m.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 text-slate-600 text-xs tabular-nums">{formatFecha(m.fecha)}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-500">{m.numero_control ?? "—"}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                              m.metodo_pago === "transferencia"
                                ? "bg-sky-50 text-sky-700"
                                : "bg-violet-50 text-violet-700"
                            }`}
                          >
                            {metodoLabel(m.metodo_pago)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {m.banco_codigo ? <span className="font-mono text-xs text-slate-400">{m.banco_codigo} · </span> : null}
                          {m.banco_nombre ?? "—"}
                        </td>
                        <td className="py-3 pr-4 text-slate-600">{m.titular ?? "—"}</td>
                        <td className="py-3 pr-4 text-right tabular-nums font-semibold text-slate-800">{formatGs(m.monto)}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-500">{m.nro_comprobante ?? "—"}</td>
                        <td className="py-3 text-slate-600 capitalize">{m.venta_estado ?? "—"}</td>
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
