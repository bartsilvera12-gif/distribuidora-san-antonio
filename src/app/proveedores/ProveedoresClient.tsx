"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getProveedores } from "@/lib/proveedores/storage";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { useIsAdmin } from "@/lib/auth/use-is-admin";
import type { Proveedor } from "@/lib/proveedores/types";

/**
 * Isla cliente de la página de Proveedores: búsqueda, filtros y acciones.
 *
 * Los datos iniciales llegan ya renderizados desde el Server Component
 * (`initialProveedores`, `serverLoaded`), eliminando el waterfall
 * "montar → resolver token → fetch /api → render". Solo re-fetchea cuando:
 *   - el servidor NO pudo cargar (fallback al comportamiento anterior), o
 *   - hubo un refresh manual (p. ej. tras importar un Excel).
 */
export default function ProveedoresClient({
  initialProveedores,
  serverLoaded,
}: {
  initialProveedores: Proveedor[];
  serverLoaded: boolean;
}) {
  const { isAdmin } = useIsAdmin();
  const [lista, setLista] = useState<Proveedor[]>(initialProveedores);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(!serverLoaded);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Si el servidor ya trajo los datos y no hubo refresh manual, usamos esos
    // (sin red). `cargando` ya arranca en false cuando serverLoaded es true.
    if (serverLoaded && refreshKey === 0) {
      return;
    }
    let cancel = false;
    setCargando(true);
    getProveedores().then((rows) => {
      if (!cancel) {
        setLista(rows);
        setCargando(false);
      }
    });
    return () => {
      cancel = true;
    };
  }, [refreshKey, serverLoaded]);

  const filtradas = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    if (!t) return lista;
    return lista.filter((p) => {
      const cats = (p.categorias ?? []).map((c) => c.nombre.toLowerCase()).join(" ");
      return (
        p.nombre.toLowerCase().includes(t) ||
        (p.ruc ?? "").toLowerCase().includes(t) ||
        (p.email ?? "").toLowerCase().includes(t) ||
        cats.includes(t)
      );
    });
  }, [lista, busqueda]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Adquisiciones"
        title="Proveedores"
        description="Maestro de abastecimiento: categorías, condiciones de pago y vínculo con compras."
        actions={
          <>
            <ExportExcelButton url="/api/proveedores/export" />
            <ImportExcelButton
              entidad="Proveedores"
              previewUrl="/api/proveedores/import/preview"
              commitUrl="/api/proveedores/import/commit"
              templateUrl="/api/proveedores/import/template"
              permiteCrearFaltantes
              visible={isAdmin}
              onCompleted={() => setRefreshKey((k) => k + 1)}
            />
            <Button href="/proveedores/categorias" variant="secondary" size="sm">
              Categorías
            </Button>
            <Button href="/proveedores/nuevo" size="sm">
              <span aria-hidden>+</span> Nuevo proveedor
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <input
            type="search"
            placeholder="Buscar por nombre, RUC, email o categoría…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="min-w-[240px] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0EA5E9]"
          />
          <span className="text-sm text-slate-400">
            {filtradas.length} de {lista.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-slate-600">
                <th className="py-3 pr-4 font-semibold">Proveedor</th>
                <th className="py-3 pr-4 font-semibold">RUC</th>
                <th className="py-3 pr-4 font-semibold">Contacto</th>
                <th className="py-3 pr-4 font-semibold">Categorías</th>
                <th className="py-3 pr-4 font-semibold">Estado</th>
                <th className="py-3 font-semibold w-24" />
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Cargando…
                  </td>
                </tr>
              ) : filtradas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    {lista.length === 0 ? "No hay proveedores cargados." : "Sin resultados."}
                  </td>
                </tr>
              ) : (
                filtradas.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 last:border-0 hover:bg-[#4FAEB2]/[0.04] transition-colors">
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-800">{p.nombre}</div>
                      {p.nombre_comercial && (
                        <div className="text-xs text-slate-500">{p.nombre_comercial}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs text-slate-600">{p.ruc ?? "—"}</td>
                    <td className="py-3 pr-4 text-slate-600">
                      <div>{p.contacto ?? "—"}</div>
                      <div className="text-xs text-slate-400">{p.telefono ?? ""}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1">
                        {(p.categorias ?? []).length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          p.categorias!.map((c) => (
                            <Badge key={c.id} tone="neutral">{c.nombre}</Badge>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge tone={p.estado === "activo" ? "success" : "neutral"}>
                        {p.estado === "activo" ? "Activo" : "Inactivo"}
                      </Badge>
                    </td>
                    <td className="py-3">
                      <Link
                        href={`/proveedores/${p.id}/editar`}
                        className="text-sm font-medium text-[#3F8E91] hover:text-[#2F6F72] hover:underline"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
