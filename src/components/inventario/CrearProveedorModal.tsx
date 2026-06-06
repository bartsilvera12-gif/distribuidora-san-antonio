"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { createProveedor } from "@/lib/proveedores/storage";

export interface ProveedorCreado {
  id: string;
  nombre: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se invoca con el proveedor recién creado para que el caller lo agregue y seleccione. */
  onCreated: (proveedor: ProveedorCreado) => void;
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none bg-white text-sm";
const labelClass = "block text-sm font-medium text-slate-700 mb-2";

/** Modal para crear un proveedor sin salir de "Nuevo producto". */
export default function CrearProveedorModal({ open, onClose, onCreated }: Props) {
  const [nombre, setNombre] = useState("");
  const [ruc, setRuc] = useState("");
  const [telefono, setTelefono] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  // Reset al abrir + foco en el primer campo.
  useEffect(() => {
    if (open) {
      setNombre("");
      setRuc("");
      setTelefono("");
      setError(null);
      setSaving(false);
      setTimeout(() => nombreRef.current?.focus(), 50);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    const nombreT = nombre.trim();
    if (!nombreT) {
      setError("El nombre es obligatorio.");
      nombreRef.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await createProveedor({
        nombre: nombreT,
        ruc: ruc.trim() || null,
        telefono: telefono.trim() || null,
      });
      if (!result.ok) {
        setError(result.error || "No se pudo crear el proveedor.");
        return;
      }
      onCreated({ id: result.proveedor.id, nombre: result.proveedor.nombre });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de red. Intentá nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo proveedor"
      description="Se creará y quedará seleccionado en el producto."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div>
          <label className={labelClass}>Nombre del proveedor</label>
          <input
            ref={nombreRef}
            type="text"
            value={nombre}
            onChange={(e) => {
              setError(null);
              setNombre(e.target.value);
            }}
            placeholder="Ej: DISTRIBUIDORA CENTRAL"
            className={`${inputClass} uppercase`}
            autoComplete="off"
            maxLength={160}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              RUC <span className="text-xs font-normal text-gray-400 ml-1">(opcional)</span>
            </label>
            <input
              type="text"
              value={ruc}
              onChange={(e) => setRuc(e.target.value)}
              placeholder="Ej: 80012345-6"
              className={inputClass}
              autoComplete="off"
              maxLength={40}
            />
          </div>
          <div>
            <label className={labelClass}>
              Teléfono <span className="text-xs font-normal text-gray-400 ml-1">(opcional)</span>
            </label>
            <input
              type="text"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 0981 123 456"
              className={inputClass}
              autoComplete="off"
              maxLength={40}
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="border border-slate-200 px-5 py-2.5 rounded-lg text-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
