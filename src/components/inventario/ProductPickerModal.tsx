"use client";

import { useEffect, useRef, useState } from "react";

export interface ProductoPickerItem {
  id: string;
  nombre: string;
  sku: string;
  codigo_barras: string | null;
  codigo_barras_interno: boolean;
  precio_venta: number;
  stock_actual: number;
  unidad_medida: string;
  imagen_url: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (p: ProductoPickerItem) => void;
  /** Excluir IDs ya elegidos para mostrarlos como "ya en carrito" (opcional). */
  excludeIds?: string[];
}

function formatGs(v: number): string {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}

export default function ProductPickerModal({ open, onClose, onSelect, excludeIds = [] }: Props) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<ProductoPickerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Autofocus + reset al abrir
  useEffect(() => {
    if (open) {
      setQ("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Cerrar con ESC
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Buscar (debounce 200ms)
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL("/api/productos/search", window.location.origin);
        if (q.trim().length >= 2) url.searchParams.set("q", q.trim());
        url.searchParams.set("limit", "50");
        const res = await fetch(url.toString(), { credentials: "include" });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          setError(json?.error ?? "Error al buscar productos");
          setItems([]);
        } else {
          setItems((json.data?.items ?? []) as ProductoPickerItem[]);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error de red");
        setItems([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, open]);

  if (!open) return null;

  const excluded = new Set(excludeIds);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm pt-20 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-400">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z" clipRule="evenodd" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre, SKU o código de barras..."
              className="flex-1 bg-transparent outline-none text-base text-slate-800 placeholder:text-slate-400"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 transition-colors"
              title="Cerrar (Esc)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
              </svg>
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Buscá por cualquier palabra. Mínimo 2 caracteres. Esc para cerrar.
          </p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-6 text-center text-sm text-slate-400">Buscando...</div>
          )}
          {!loading && error && (
            <div className="m-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          {!loading && !error && items.length === 0 && (
            <div className="p-10 text-center text-sm text-slate-400">
              {q.trim().length >= 2 ? `Sin resultados para "${q}"` : "Empezá a escribir para buscar"}
            </div>
          )}
          {!loading && !error && items.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {items.map((p) => {
                const enCarrito = excluded.has(p.id);
                const sinStock = p.stock_actual <= 0;
                const disabled = sinStock;
                return (
                  <li
                    key={p.id}
                    onClick={() => { if (!disabled) onSelect(p); }}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                      disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:bg-sky-50"
                    }`}
                  >
                    <div className="w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {p.imagen_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-slate-300">
                          <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.06L6.53 8.091a.75.75 0 0 0-1.06 0L2.5 11.06ZM12 6.5a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-800 truncate">{p.nombre}</span>
                        {enCarrito && (
                          <span className="text-[10px] uppercase tracking-wider bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded">En carrito</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500 flex-wrap">
                        <span className="font-mono">SKU: {p.sku}</span>
                        {p.codigo_barras && (
                          <span className="font-mono">
                            {p.codigo_barras_interno ? "Int." : "CB:"} {p.codigo_barras}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-slate-800 tabular-nums">{formatGs(p.precio_venta)}</div>
                      <div className={`text-xs tabular-nums ${sinStock ? "text-red-500" : "text-slate-500"}`}>
                        {sinStock ? "Sin stock" : `${p.stock_actual} ${p.unidad_medida}`}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
