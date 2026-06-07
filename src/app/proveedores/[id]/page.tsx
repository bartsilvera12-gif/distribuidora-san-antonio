"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { getProveedor, getProveedorDetalleCompras } from "@/lib/proveedores/storage";
import type { Proveedor, ProveedorDetalleCompras } from "@/lib/proveedores/types";

function formatGs(v: number) {
  return `Gs. ${Math.round(v).toLocaleString("es-PY")}`;
}
function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch {
    return "—";
  }
}

function DatoItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

export default function ProveedorDetallePage() {
  const params = useParams();
  const id = (params?.id as string) ?? "";

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [detalle, setDetalle] = useState<ProveedorDetalleCompras | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancel = false;
    setCargando(true);
    Promise.all([getProveedor(id), getProveedorDetalleCompras(id)]).then(([prov, det]) => {
      if (cancel) return;
      setProveedor(prov);
      setDetalle(det);
      setCargando(false);
    });
    return () => { cancel = true; };
  }, [id]);

  if (cargando) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="San Antonio · Adquisiciones" title="Detalle de proveedor" backHref="/proveedores" backLabel="Proveedores" />
        <p className="text-slate-500 animate-pulse">Cargando…</p>
      </div>
    );
  }

  if (!proveedor) {
    return (
      <div className="space-y-8">
        <PageHeader eyebrow="San Antonio · Adquisiciones" title="Detalle de proveedor" backHref="/proveedores" backLabel="Proveedores" />
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-slate-500">
          No se encontró el proveedor solicitado.
        </div>
      </div>
    );
  }

  const m = detalle?.metricas;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Adquisiciones"
        title={proveedor.nombre}
        backHref="/proveedores"
        backLabel="Proveedores"
        actions={
          <Button href={`/proveedores/${proveedor.id}/editar`} variant="secondary" size="sm">
            Editar
          </Button>
        }
      />

      {/* Datos del proveedor */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-5xl">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Datos del proveedor</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
          <DatoItem label="Nombre" value={proveedor.nombre} />
          <DatoItem label="RUC" value={proveedor.ruc || "—"} />
          <DatoItem label="Teléfono" value={proveedor.telefono || "—"} />
          <DatoItem label="Email" value={proveedor.email || "—"} />
          <DatoItem label="Contacto" value={proveedor.contacto || "—"} />
          <DatoItem label="Dirección" value={proveedor.direccion || "—"} />
          <DatoItem
            label="Condición de pago"
            value={proveedor.condicion_pago ? proveedor.condicion_pago : "—"}
          />
          <DatoItem
            label="Estado"
            value={
              <Badge tone={proveedor.estado === "activo" ? "success" : "neutral"}>
                {proveedor.estado === "activo" ? "Activo" : "Inactivo"}
              </Badge>
            }
          />
        </div>
        {(proveedor.categorias ?? []).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1">
            {proveedor.categorias!.map((c) => (
              <Badge key={c.id} tone="neutral">{c.nombre}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Métricas del proveedor */}
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-3">Métricas de compras</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 max-w-3xl">
          <StatCard label="Compras (total)" value={String(m?.cantidad ?? 0)} accent />
          <StatCard label="Total comprado" value={formatGs(m?.total ?? 0)} />
          <StatCard label="Última compra" value={formatFecha(m?.ultimaCompra ?? null)} />
        </div>
      </div>

      {/* Historial de compras */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-5xl">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Historial de compras</h2>
        {!detalle || detalle.compras.length === 0 ? (
          <p className="text-sm text-slate-400">Este proveedor no tiene compras registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">N° Control</th>
                  <th className="py-2.5 pr-4 font-medium">Fecha</th>
                  <th className="py-2.5 pr-4 font-medium">Pago</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Total</th>
                  <th className="py-2.5 font-medium text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {detalle.compras.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs text-slate-500">
                      {c.numero_control}
                      {c.items_count > 1 && (
                        <span className="ml-2 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 align-middle">
                          {c.items_count} ítems
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-600 text-xs tabular-nums">{formatFecha(c.fecha)}</td>
                    <td className="py-3 pr-4">
                      <Badge tone={c.tipo_pago === "credito" ? "warning" : "neutral"}>
                        {c.tipo_pago === "contado" ? "Contado" : c.tipo_pago === "credito" ? "Crédito" : "—"}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums font-semibold text-slate-800">{formatGs(c.total)}</td>
                    <td className="py-3 text-right">
                      <Link
                        href={`/compras/${c.id}`}
                        className="text-sm font-medium text-[#3F8E91] hover:text-[#2F6F72] hover:underline"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Productos más comprados */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 max-w-5xl">
        <h2 className="text-base font-semibold text-slate-800 mb-4">Productos más comprados</h2>
        {!detalle || detalle.topProductos.length === 0 ? (
          <p className="text-sm text-slate-400">Sin datos de productos para este proveedor.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="py-2.5 pr-4 font-medium">Producto</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Cantidad</th>
                  <th className="py-2.5 font-medium text-right">Gasto total</th>
                </tr>
              </thead>
              <tbody>
                {detalle.topProductos.map((p) => (
                  <tr key={p.producto_id} className="border-b border-slate-100 last:border-0">
                    <td className="py-3 pr-4 font-medium text-slate-800">{p.producto_nombre}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-700">{p.cantidad}</td>
                    <td className="py-3 text-right tabular-nums font-semibold text-slate-800">{formatGs(p.gasto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
