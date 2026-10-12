/**
 * Cliente (navegador) para leer la configuración de carga histórica de la
 * empresa. Lo usan los formularios que persisten client-side (inventario,
 * gastos) para gated el selector de fecha y derivar es_historico.
 */
import type { CargaHistoricaConfig } from "./server";

const DESHABILITADA: CargaHistoricaConfig = { fechaCorte: null, habilitada: false };

export async function fetchCargaHistoricaConfig(): Promise<CargaHistoricaConfig> {
  try {
    const r = await fetch("/api/carga-historica", { credentials: "include", cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success || !j.data) return DESHABILITADA;
    const d = j.data as { fechaCorte?: string | null; habilitada?: boolean };
    return { fechaCorte: d.fechaCorte ?? null, habilitada: Boolean(d.habilitada) };
  } catch {
    return DESHABILITADA;
  }
}
