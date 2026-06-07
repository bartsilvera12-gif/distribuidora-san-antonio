"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import MesSelector from "@/components/reportes/MesSelector";
import { getEstadoCuentaReporte } from "@/lib/reportes/storage";
import { mesActualAsuncion } from "@/lib/fechas/asuncion-bounds";
import type { EstadoCuentaReporte } from "@/lib/reportes/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}
function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

export default function EstadoCuentaReportePage() {
  const [mes, setMes] = useState(mesActualAsuncion());
  const [data, setData] = useState<EstadoCuentaReporte | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    setCargando(true);
    getEstadoCuentaReporte(mes).then((d) => { if (!cancel) { setData(d); setCargando(false); } });
    return () => { cancel = true; };
  }, [mes]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Reportes"
        title="Estado de cuenta"
        description="Saldos, movimientos y situación financiera del período"
        backHref="/reportes"
        backLabel="Reportes"
        actions={
          <div className="flex items-center gap-3">
            <MesSelector mes={mes} onChange={setMes} />
            <ExportExcelButton url={`/api/reportes/estado-cuenta/export?mes=${mes}`} />
          </div>
        }
      />

      {cargando ? (
        <p className="text-slate-500 animate-pulse">Cargando…</p>
      ) : !data ? (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-slate-500">
          No se pudo cargar el estado de cuenta.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard compact label="Ingresos por ventas" value={formatGs(data.ingresosVentas)} accent />
            <StatCard compact label="Compras" value={formatGs(data.compras)} />
            <StatCard compact label="Gastos" value={formatGs(data.gastos)} />
            <StatCard
              compact
              label="Resultado"
              value={formatGs(data.resultado)}
              hint="Ventas − Compras − Gastos"
            />
            <StatCard compact label="Por cobrar" value={formatGs(data.porCobrar)} hint="Ventas a crédito del período" />
            <StatCard compact label="Por pagar" value={formatGs(data.porPagar)} hint="Compras a crédito del período" />
          </div>

          <p className="text-xs text-slate-400 -mt-4">
            Por cobrar/pagar se calculan sobre operaciones a crédito del período. El ERP de San Antonio no
            registra pagos parciales aplicados a ventas/compras, por lo que no se descuentan abonos.
          </p>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Movimientos del período</h2>
            {data.movimientos.length === 0 ? (
              <p className="text-sm text-slate-400">No hay movimientos en el período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="py-2.5 pr-4 font-medium">Fecha</th>
                      <th className="py-2.5 pr-4 font-medium">Tipo</th>
                      <th className="py-2.5 pr-4 font-medium">Referencia</th>
                      <th className="py-2.5 pr-4 font-medium">Descripción</th>
                      <th className="py-2.5 pr-4 font-medium text-right">Entrada</th>
                      <th className="py-2.5 font-medium text-right">Salida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.movimientos.map((m, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <td className="py-3 pr-4 text-slate-600 text-xs tabular-nums">{formatFecha(m.fecha)}</td>
                        <td className="py-3 pr-4">{m.tipo}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-500">{m.referencia || "—"}</td>
                        <td className="py-3 pr-4 text-slate-600">{m.descripcion || "—"}</td>
                        <td className="py-3 pr-4 text-right tabular-nums text-emerald-600">{m.entrada > 0 ? formatGs(m.entrada) : "—"}</td>
                        <td className="py-3 text-right tabular-nums text-red-600">{m.salida > 0 ? formatGs(m.salida) : "—"}</td>
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
