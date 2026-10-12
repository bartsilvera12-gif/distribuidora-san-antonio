"use client";

import { useEffect, useState } from "react";
import { History, Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import MontoInput from "@/components/ui/MontoInput";
import { getCurrentUser } from "@/lib/auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { hoyYmdLocal } from "@/lib/fechas/calendario";

const CORTE_DEFAULT = "2026-10-01"; // provisional

type BancoSaldo = { nombre: string; saldo: number };

const inputClass =
  "w-full border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#0EA5E9] bg-white text-sm";
const labelClass = "block text-sm font-medium text-slate-700 mb-2";

export default function CargaHistoricaConfigPage() {
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const [fechaCorte, setFechaCorte] = useState(CORTE_DEFAULT);
  const [habilitada, setHabilitada] = useState(false);
  const [cajaInicial, setCajaInicial] = useState("0");
  const [bancos, setBancos] = useState<BancoSaldo[]>([]);
  const [observaciones, setObservaciones] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const user = await getCurrentUser();
        const admin = esRolAdminEmpresaOGlobal(user?.rol);
        if (cancel) return;
        setEsAdmin(admin);

        const [cfgRes, saldoRes] = await Promise.all([
          fetch("/api/carga-historica", { credentials: "include", cache: "no-store" }),
          fetch("/api/carga-historica/saldo-inicial", { credentials: "include", cache: "no-store" }),
        ]);
        const cfg = await cfgRes.json().catch(() => ({}));
        const saldo = await saldoRes.json().catch(() => ({}));
        if (cancel) return;
        if (cfg?.success && cfg.data) {
          if (cfg.data.fechaCorte) setFechaCorte(String(cfg.data.fechaCorte).slice(0, 10));
          setHabilitada(Boolean(cfg.data.habilitada));
        }
        if (saldo?.success && saldo.data) {
          setCajaInicial(String(saldo.data.cajaInicial ?? 0));
          setBancos(Array.isArray(saldo.data.bancos) ? saldo.data.bancos : []);
          setObservaciones(saldo.data.observaciones ?? "");
        }
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  function addBanco() {
    setBancos((prev) => [...prev, { nombre: "", saldo: 0 }]);
  }
  function updateBanco(i: number, patch: Partial<BancoSaldo>) {
    setBancos((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));
  }
  function removeBanco(i: number) {
    setBancos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function guardar() {
    setMsg(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaCorte)) {
      setMsg({ tipo: "error", texto: "Elegí una fecha de corte válida." });
      return;
    }
    const caja = Number(cajaInicial);
    if (!Number.isFinite(caja) || caja < 0) {
      setMsg({ tipo: "error", texto: "La caja inicial debe ser un número mayor o igual a 0." });
      return;
    }
    if (bancos.some((b) => b.saldo < 0)) {
      setMsg({ tipo: "error", texto: "Los saldos bancarios no pueden ser negativos." });
      return;
    }
    setGuardando(true);
    try {
      const r1 = await fetch("/api/carga-historica", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaCorte, habilitada }),
      });
      const j1 = await r1.json().catch(() => ({}));
      if (!r1.ok || !j1?.success) throw new Error(j1?.error ?? "No se pudo guardar la configuración.");

      const r2 = await fetch("/api/carga-historica/saldo-inicial", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaCorte,
          cajaInicial: caja,
          bancos: bancos.filter((b) => b.nombre.trim() !== ""),
          observaciones,
        }),
      });
      const j2 = await r2.json().catch(() => ({}));
      if (!r2.ok || !j2?.success) throw new Error(j2?.error ?? "No se pudo guardar el saldo inicial.");

      setMsg({ tipo: "ok", texto: "Configuración y saldos iniciales guardados." });
    } catch (e) {
      setMsg({ tipo: "error", texto: e instanceof Error ? e.message : "Error al guardar." });
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) {
    return <div className="p-6 text-sm text-slate-500">Cargando…</div>;
  }

  if (esAdmin === false) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="San Antonio · Configuración" title="Carga histórica" backHref="/configuracion" backLabel="Configuración" />
        <div className="max-w-2xl rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
          Esta sección es solo para administradores. Pedile a un administrador que configure la carga histórica.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Configuración"
        title="Carga histórica y saldos iniciales"
        description="Definí la fecha de corte, habilitá la carga de fechas anteriores y cargá los saldos iniciales de caja/bancos."
        backHref="/configuracion"
        backLabel="Configuración"
      />

      <div className="max-w-2xl space-y-6">
        {/* Corte */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2 text-slate-800">
            <History size={18} className="text-[#0EA5E9]" />
            <h2 className="font-semibold">Fecha de corte</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fecha de corte</label>
              <input
                type="date"
                value={fechaCorte}
                max={hoyYmdLocal()}
                onChange={(e) => setFechaCorte(e.target.value)}
                className={inputClass}
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Desde esta fecha el sistema opera en vivo. Lo anterior se carga como histórico.
              </p>
            </div>
            <div>
              <label className={labelClass}>Carga histórica</label>
              <label className="flex items-center gap-2 mt-1 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={habilitada}
                  onChange={(e) => setHabilitada(e.target.checked)}
                  className="h-4 w-4"
                />
                {habilitada ? "Habilitada (se pueden cargar fechas anteriores)" : "Cerrada (solo fecha de hoy)"}
              </label>
              <p className="mt-1.5 text-xs text-slate-500">
                Activala para cargar y, al terminar, cerrala para evitar backdating accidental.
              </p>
            </div>
          </div>
        </section>

        {/* Saldos iniciales */}
        <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-800">Saldo inicial de caja y bancos</h2>
          <div>
            <label className={labelClass}>Caja inicial (efectivo, Gs.)</label>
            <MontoInput
              value={cajaInicial}
              onChange={(n) => setCajaInicial(String(n))}
              placeholder="0"
              className={inputClass}
              decimals={false}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className={labelClass + " mb-0"}>Bancos / billeteras</label>
              <button type="button" onClick={addBanco} className="inline-flex items-center gap-1 text-sm text-[#0EA5E9] hover:underline">
                <Plus size={16} /> Agregar
              </button>
            </div>
            {bancos.length === 0 && <p className="text-xs text-slate-400">Sin bancos cargados.</p>}
            {bancos.map((b, i) => (
              <div key={i} className="flex gap-2 items-start">
                <input
                  type="text"
                  value={b.nombre}
                  onChange={(e) => updateBanco(i, { nombre: e.target.value })}
                  placeholder="Nombre del banco"
                  className={inputClass + " flex-1"}
                />
                <div className="w-40">
                  <MontoInput
                    value={String(b.saldo)}
                    onChange={(n) => updateBanco(i, { saldo: Number(n) || 0 })}
                    placeholder="Saldo"
                    className={inputClass}
                    decimals={false}
                  />
                </div>
                <button type="button" onClick={() => removeBanco(i)} className="p-2 text-slate-400 hover:text-red-500" aria-label="Quitar">
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>

          <div>
            <label className={labelClass}>Observaciones</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Opcional"
            />
          </div>
          <p className="text-xs text-slate-500">
            Las cuentas por cobrar iniciales se cargan como facturas históricas abiertas (no se setean acá).
          </p>
        </section>

        {msg && (
          <p className={`text-sm rounded-lg px-3 py-2 border ${
            msg.tipo === "ok"
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {msg.texto}
          </p>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="bg-[#0EA5E9] hover:bg-[#0284C7] text-white rounded-lg font-medium px-5 py-2.5 text-sm transition-colors disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar configuración"}
          </button>
        </div>
      </div>
    </div>
  );
}
