import type { ReactNode } from "react";

/**
 * Superficie de contenido estándar: blanca, borde suave, sombra sutil y un
 * ring turquesa muy tenue. Reemplaza el patrón inline repetido
 * `bg-white border border-slate-200 rounded-xl shadow-sm ring-1 ring-[#4FAEB2]/15`.
 */
export default function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  /** Aplica padding interno cómodo (p-6). Desactivar para tablas a sangre. */
  padded?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/10 ${
        padded ? "p-5 sm:p-6" : ""
      } ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

/**
 * Encabezado de sección dentro de una Card (título + descripción + acción).
 */
export function CardHeader({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-slate-400">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
