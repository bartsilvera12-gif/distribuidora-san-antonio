"use client";

import { useEffect, useRef, useState } from "react";
import Modal from "@/components/ui/Modal";
import { apiFetch } from "@/lib/api/fetch-with-supabase-session";

export interface CategoriaCreada {
  id: string;
  nombre: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Se invoca con la categoría recién creada para que el caller la agregue y seleccione. */
  onCreated: (categoria: CategoriaCreada) => void;
}

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] focus:outline-none bg-white text-sm";
const labelClass = "block text-sm font-medium text-slate-700 mb-2";

/** Modal para crear una categoría de producto sin salir de "Nuevo producto". */
export default function CrearCategoriaModal({ open, onClose, onCreated }: Props) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nombreRef = useRef<HTMLInputElement>(null);

  // Reset al abrir + foco en el primer campo.
  useEffect(() => {
    if (open) {
      setNombre("");
      setDescripcion("");
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
      const res = await apiFetch("/api/inventario/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: nombreT,
          descripcion: descripcion.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { categoria?: { id: string; nombre: string } };
        error?: string;
      };
      if (!res.ok || !json.success || !json.data?.categoria) {
        setError(json.error ?? `No se pudo crear la categoría (error ${res.status}).`);
        return;
      }
      onCreated({ id: json.data.categoria.id, nombre: json.data.categoria.nombre });
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
      title="Nueva categoría"
      description="Se creará y quedará seleccionada en el producto."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div>
          <label className={labelClass}>Nombre de la categoría</label>
          <input
            ref={nombreRef}
            type="text"
            value={nombre}
            onChange={(e) => {
              setError(null);
              setNombre(e.target.value);
            }}
            placeholder="Ej: BEBIDAS"
            className={`${inputClass} uppercase`}
            autoComplete="off"
            maxLength={120}
          />
        </div>

        <div>
          <label className={labelClass}>
            Descripción <span className="text-xs font-normal text-gray-400 ml-1">(opcional)</span>
          </label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Descripción opcional de la categoría"
            rows={2}
            className={inputClass}
          />
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
