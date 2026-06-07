import PageHeader from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * Pantalla inicial de Reportes (fase 1). Solo presenta el módulo; la reportería
 * operativa (ventas, compras, inventario) se construye en fases siguientes.
 */
export default function ReportesPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="San Antonio · Análisis"
        title="Reportes"
        description="Panel de análisis y reportería operativa"
      />

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm ring-1 ring-[#4FAEB2]/10 p-10 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#E5F4F4] text-[#3F8E91]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
            <path d="M3 3v18h18" />
            <rect x="7" y="10" width="3" height="7" />
            <rect x="12" y="6" width="3" height="11" />
            <rect x="17" y="13" width="3" height="4" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-slate-800">Estamos preparando los reportes</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Estamos preparando los reportes principales de ventas, compras e inventario.
        </p>
      </div>
    </div>
  );
}
