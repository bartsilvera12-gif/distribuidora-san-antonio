"use client";

import { useEffect, useMemo, useState } from "react";
import { GlobalConfigSubpageShell } from "@/components/config/GlobalConfigSubpageShell";
import {
  getEntidadesBancarias,
  crearEntidadBancaria,
  actualizarEntidadBancaria,
  type EntidadBancaria,
} from "@/lib/configuracion/entidades-bancarias";

const TIPOS = [
  { v: "banco", label: "Banco" },
  { v: "financiera", label: "Financiera" },
  { v: "billetera", label: "Billetera" },
] as const;

const tipoLabel = (t: string | null) => TIPOS.find((x) => x.v === t)?.label ?? "—";

const inputClass =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";

export default function EntidadesBancariasPage() {
  const [entidades, setEntidades] = useState<EntidadBancaria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  // Alta
  const [nNombre, setNNombre] = useState("");
  const [nCodigo, setNCodigo] = useState("");
  const [nTipo, setNTipo] = useState<string>("banco");
  const [guardando, setGuardando] = useState(false);

  // Edición inline
  const [editId, setEditId] = useState<string | null>(null);
  const [eNombre, setENombre] = useState("");
  const [eCodigo, setECodigo] = useState("");
  const [eTipo, setETipo] = useState<string>("banco");
  const [editando, setEditando] = useState(false);

  async function recargar() {
    setCargando(true);
    const data = await getEntidadesBancarias(true);
    setEntidades(data);
    setCargando(false);
  }

  useEffect(() => {
    recargar();
  }, []);

  const filtradas = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return entidades;
    return entidades.filter(
      (e) =>
        e.nombre.toLowerCase().includes(term) ||
        (e.codigo ?? "").toLowerCase().includes(term)
    );
  }, [entidades, q]);

  async function handleAgregar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!nNombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setGuardando(true);
    const r = await crearEntidadBancaria({
      nombre: nNombre.trim(),
      codigo: nCodigo.trim() || null,
      tipo: nTipo || null,
    });
    setGuardando(false);
    if (!r.success) {
      setError(r.error);
      return;
    }
    setOk(`"${r.entidad.nombre}" agregada.`);
    setNNombre("");
    setNCodigo("");
    setNTipo("banco");
    await recargar();
  }

  function iniciarEdicion(en: EntidadBancaria) {
    setEditId(en.id);
    setENombre(en.nombre);
    setECodigo(en.codigo ?? "");
    setETipo(en.tipo ?? "banco");
    setError(null);
    setOk(null);
  }

  async function guardarEdicion(id: string) {
    setError(null);
    setOk(null);
    if (!eNombre.trim()) {
      setError("El nombre no puede quedar vacío.");
      return;
    }
    setEditando(true);
    const r = await actualizarEntidadBancaria(id, {
      nombre: eNombre.trim(),
      codigo: eCodigo.trim() || null,
      tipo: eTipo || null,
    });
    setEditando(false);
    if (!r.success) {
      setError(r.error);
      return;
    }
    setOk("Cambios guardados.");
    setEditId(null);
    await recargar();
  }

  async function toggleActivo(en: EntidadBancaria) {
    setError(null);
    setOk(null);
    const r = await actualizarEntidadBancaria(en.id, { activo: !en.activo });
    if (!r.success) {
      setError(r.error);
      return;
    }
    setEntidades((prev) => prev.map((x) => (x.id === en.id ? { ...x, activo: !en.activo } : x)));
  }

  return (
    <GlobalConfigSubpageShell
      title="Entidades bancarias"
      description="Catálogo de bancos, financieras y billeteras. El código de pago se autocompleta al cobrar una venta por transferencia o tarjeta; si no lo sabés, podés buscar por nombre."
    >
      {/* Alta */}
      <form
        onSubmit={handleAgregar}
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500">
          Agregar entidad
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_160px_auto] sm:items-end">
          <div>
            <label className="mb-1 block text-xs text-slate-600">Nombre *</label>
            <input
              value={nNombre}
              onChange={(e) => setNNombre(e.target.value)}
              placeholder="Ej: Banco Itaú Paraguay"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Código de pago</label>
            <input
              value={nCodigo}
              onChange={(e) => setNCodigo(e.target.value)}
              placeholder="Opcional"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-600">Tipo</label>
            <select value={nTipo} onChange={(e) => setNTipo(e.target.value)} className={inputClass}>
              {TIPOS.map((t) => (
                <option key={t.v} value={t.v}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={guardando}
            className="inline-flex h-[38px] items-center justify-center rounded-lg bg-[#4FAEB2] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:opacity-50"
          >
            {guardando ? "Agregando…" : "Agregar"}
          </button>
        </div>
      </form>

      {(error || ok) && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error ?? ok}
        </div>
      )}

      {/* Buscador */}
      <div className="flex items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o código…"
          className={`${inputClass} max-w-sm`}
        />
        <span className="text-xs text-slate-400">
          {filtradas.length} de {entidades.length}
        </span>
      </div>

      {/* Lista */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
              <th className="px-4 py-3 font-semibold">Código</th>
              <th className="px-4 py-3 font-semibold">Nombre</th>
              <th className="px-4 py-3 font-semibold">Tipo</th>
              <th className="px-4 py-3 font-semibold">Estado</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : filtradas.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {entidades.length === 0 ? "Todavía no hay entidades cargadas." : "Sin resultados."}
                </td>
              </tr>
            ) : (
              filtradas.map((en) =>
                editId === en.id ? (
                  <tr key={en.id} className="border-b border-slate-100 bg-[#E5F4F4]/40">
                    <td className="px-4 py-2">
                      <input value={eCodigo} onChange={(e) => setECodigo(e.target.value)} className={inputClass} placeholder="Código" />
                    </td>
                    <td className="px-4 py-2">
                      <input value={eNombre} onChange={(e) => setENombre(e.target.value)} className={inputClass} placeholder="Nombre" />
                    </td>
                    <td className="px-4 py-2">
                      <select value={eTipo} onChange={(e) => setETipo(e.target.value)} className={inputClass}>
                        {TIPOS.map((t) => (
                          <option key={t.v} value={t.v}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-slate-400">—</td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => guardarEdicion(en.id)}
                          disabled={editando}
                          className="rounded-md bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3F8E91] disabled:opacity-50"
                        >
                          {editando ? "Guardando…" : "Guardar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={en.id} className={`border-b border-slate-100 ${en.activo ? "" : "bg-slate-50/60"}`}>
                    <td className="px-4 py-3 font-mono text-slate-700">{en.codigo ?? <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{en.nombre}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{tipoLabel(en.tipo)}</span>
                    </td>
                    <td className="px-4 py-3">
                      {en.activo ? (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Activa</span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactiva</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => iniciarEdicion(en)}
                          className="rounded-md border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActivo(en)}
                          className={`rounded-md border px-3 py-1.5 text-xs ${
                            en.activo
                              ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          {en.activo ? "Desactivar" : "Activar"}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </GlobalConfigSubpageShell>
  );
}
