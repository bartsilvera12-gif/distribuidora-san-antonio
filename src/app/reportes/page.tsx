"use client";

import PageHeader from "@/components/ui/PageHeader";
import { SettingsModuleCard } from "@/components/config/SettingsModuleCard";
import { Wallet, ShoppingCart, Package, Truck } from "lucide-react";

/** Hub de reportería operativa: cards estilo Configuración Global. */
export default function ReportesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Análisis"
        title="Reportes"
        description="Panel de análisis y reportería operativa"
      />

      <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
        <li>
          <SettingsModuleCard
            title="Estado de cuenta"
            subtitle="Saldos, movimientos y situación financiera"
            icon={Wallet}
            description="Resumen de cuentas, ventas, compras, pagos y saldos del período."
            href="/reportes/estado-cuenta"
            actionLabel="Ver reporte"
          />
        </li>
        <li>
          <SettingsModuleCard
            title="Ventas"
            subtitle="Facturación y operaciones comerciales"
            icon={ShoppingCart}
            description="Ventas del mes, tipos de precio, productos vendidos y totales."
            href="/reportes/ventas"
            actionLabel="Ver reporte"
          />
        </li>
        <li>
          <SettingsModuleCard
            title="Compras"
            subtitle="Adquisiciones y costos"
            icon={Package}
            description="Compras del mes, proveedores, productos adquiridos y montos."
            href="/reportes/compras"
            actionLabel="Ver reporte"
          />
        </li>
        <li>
          <SettingsModuleCard
            title="Proveedores"
            subtitle="Abastecimiento y relación comercial"
            icon={Truck}
            description="Resumen de proveedores, compras por proveedor y actividad del mes."
            href="/reportes/proveedores"
            actionLabel="Ver reporte"
          />
        </li>
      </ul>
    </div>
  );
}
