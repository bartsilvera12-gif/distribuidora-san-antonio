"use client";

import GastoForm from "@/components/gastos/GastoForm";
import PageHeader from "@/components/ui/PageHeader";

export default function NuevoGastoPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Egresos"
        title="Nuevo gasto"
        description="Registrar un gasto operativo"
        backHref="/gastos"
        backLabel="Gastos"
      />

      <GastoForm />
    </div>
  );
}
