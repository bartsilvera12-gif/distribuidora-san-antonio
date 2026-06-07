"use client";

import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import MontoInput from "@/components/ui/MontoInput";
import {
  getEntidadesBancarias,
  type EntidadBancaria,
} from "@/lib/configuracion/entidades-bancarias";
import type { PagoDetalleVenta } from "@/lib/ventas/types";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#0EA5E9] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/20";

/** Normaliza para búsqueda insensible a acentos/mayúsculas (ej: "itau" matchea "Itaú"). */
const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();

/**
 * Popup que se despliega al confirmar una venta por transferencia/tarjeta.
 * Captura banco (autocompletado por código o nombre), titular (solo transfer),
 * monto (precargado con el total de la venta) y N° de comprobante.
 */
export default function PagoDetalleModal({
  open,
  metodo,
  totalVenta,
  guardando = false,
  errorExterno = null,
  onClose,
  onConfirmar,
}: {
  open: boolean;
  metodo: "transferencia" | "tarjeta";
  totalVenta: number;
  guardando?: boolean;
  errorExterno?: string | null;
  onClose: () => void;
  onConfirmar: (d: PagoDetalleVenta) => void | Promise<void>;
}) {
  const [entidades, setEntidades] = useState<EntidadBancaria[]>([]);
  const [bancoQuery, setBancoQuery] = useState("");
  const [sel, setSel] = useState<EntidadBancaria | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [titular, setTitular] = useState("");
  const [monto, setMonto] = useState<number>(0);
  const [comprobante, setComprobante] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Al abrir: cargar entidades activas y precargar el monto con el total.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setBancoQuery("");
    setSel(null);
    setDropdownOpen(false);
    setTitular("");
    setComprobante("");
    setMonto(Math.round(totalVenta));
    getEntidadesBancarias()
      .then(setEntidades)
      .catch(() => setEntidades([]));
  }, [open, totalVenta]);

  const sugerencias = useMemo(() => {
    const term = norm(bancoQuery);
    if (!term) return entidades.slice(0, 8);
    return entidades
      .filter((e) => norm(e.nombre).includes(term) || norm(e.codigo ?? "").includes(term))
      .slice(0, 8);
  }, [entidades, bancoQuery]);

  function onBancoChange(v: string) {
    setBancoQuery(v);
    setSel(null);
    setDropdownOpen(true);
    // Autocompletar por código exacto (insensible a acentos/mayúsculas).
    const term = norm(v);
    if (term) {
      const exact = entidades.find((e) => norm(e.codigo ?? "") === term);
      if (exact) elegir(exact);
    }
  }

  function elegir(e: EntidadBancaria) {
    setSel(e);
    setBancoQuery(e.codigo ? `${e.codigo} · ${e.nombre}` : e.nombre);
    setDropdownOpen(false);
  }

  function handleConfirmar() {
    setError(null);
    const bancoNombre = sel?.nombre ?? (bancoQuery.trim() || null);
    if (!bancoNombre) {
      setError("Indicá el banco (por código o nombre).");
      return;
    }
    if (metodo === "transferencia" && !titular.trim()) {
      setError("Ingresá el titular que envía la transferencia.");
      return;
    }
    if (!(monto > 0)) {
      setError("El monto debe ser mayor a 0.");
      return;
    }
    if (!comprobante.trim()) {
      setError("Ingresá el N° de comprobante.");
      return;
    }
    onConfirmar({
      metodo_pago: metodo,
      entidad_bancaria_id: sel?.id ?? null,
      banco_codigo: sel?.codigo ?? null,
      banco_nombre: bancoNombre,
      titular: metodo === "transferencia" ? titular.trim() : null,
      monto: Math.round(monto),
      nro_comprobante: comprobante.trim() || null,
    });
  }

  const titulo = metodo === "transferencia" ? "Datos de la transferencia" : "Datos de la tarjeta";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={titulo}
      description="Estos datos quedan registrados en la conciliación entre cuentas."
      maxWidthClass="max-w-md"
    >
      <div className="space-y-4">
        {/* Banco */}
        <div className="relative">
          <label className="mb-1 block text-xs text-slate-600">Banco / entidad *</label>
          <input
            value={bancoQuery}
            onChange={(e) => onBancoChange(e.target.value)}
            onFocus={() => setDropdownOpen(true)}
            onBlur={() => window.setTimeout(() => setDropdownOpen(false), 150)}
            placeholder="Código o nombre (ej: 100 o Itaú)"
            className={inputClass}
            autoFocus
          />
          {dropdownOpen && sugerencias.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {sugerencias.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onMouseDown={(ev) => ev.preventDefault()}
                  onClick={() => elegir(e)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[#E5F4F4]"
                >
                  <span className="font-medium text-slate-800">{e.nombre}</span>
                  <span className="font-mono text-xs text-slate-400">{e.codigo ?? ""}</span>
                </button>
              ))}
            </div>
          )}
          {entidades.length === 0 && (
            <p className="mt-1 text-[11px] text-amber-600">
              No hay entidades cargadas. Podés escribir el banco a mano o cargarlas en Configuración → Entidades bancarias.
            </p>
          )}
        </div>

        {/* Titular (solo transferencia) */}
        {metodo === "transferencia" && (
          <div>
            <label className="mb-1 block text-xs text-slate-600">Titular que envía *</label>
            <input
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
              placeholder="Nombre del remitente"
              className={inputClass}
            />
          </div>
        )}

        {/* Monto */}
        <div>
          <label className="mb-1 block text-xs text-slate-600">Monto (Gs.) *</label>
          <MontoInput value={monto} onChange={setMonto} decimals={false} className={inputClass} />
          <p className="mt-1 text-[11px] text-slate-400">
            Precargado con el total de la venta. Ajustalo si corresponde.
          </p>
        </div>

        {/* Comprobante */}
        <div>
          <label className="mb-1 block text-xs text-slate-600">N° de comprobante *</label>
          <input
            value={comprobante}
            onChange={(e) => setComprobante(e.target.value)}
            placeholder="N° de comprobante / referencia"
            className={inputClass}
          />
        </div>

        {(error || errorExterno) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error ?? errorExterno}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={guardando}
            className="rounded-lg bg-[#0EA5E9] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#0284C7] disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Confirmar venta"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
