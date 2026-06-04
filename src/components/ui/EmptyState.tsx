import type { ReactNode } from "react";

/**
 * Estado vacío estándar del ERP: ícono/emoji opcional, título, descripción y
 * una acción opcional. Centrado, sobrio, con buen aire.
 */
export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  /** Emoji o ícono (ReactNode). */
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 py-12 text-center ${className ?? ""}`}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#E5F4F4] text-2xl text-[#3F8E91]">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description ? (
        <p className="mt-1 max-w-sm text-sm text-slate-400">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
