import type { ReactNode } from "react";

/**
 * Tarjeta KPI del ERP: etiqueta, valor grande, ícono opcional y subtítulo /
 * variación opcional. Blanca, borde suave, acento turquesa.
 */
export default function StatCard({
  label,
  value,
  icon,
  hint,
  accent = false,
  className,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  /** Texto secundario debajo del valor (ej. "0 transacciones"). */
  hint?: ReactNode;
  /** Resalta el valor en turquesa (para la métrica principal). */
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-[#4FAEB2]/10 ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          {label}
        </p>
        {icon ? <span className="text-lg leading-none text-[#4FAEB2]">{icon}</span> : null}
      </div>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight ${accent ? "text-[#3F8E91]" : "text-slate-900"}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
