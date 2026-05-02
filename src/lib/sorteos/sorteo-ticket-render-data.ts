import "server-only";

import type { EnsureSorteoOrderCreatedData } from "@/lib/sorteos/sorteo-order-from-chat";

function norm(v: string | undefined | null): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Separa cupones desde texto tipo "0020", "0020, 0021", "0020\n0021". */
export function parseCuponesFromString(raw: string | undefined | null): string[] {
  const s = norm(raw);
  if (!s) return [];
  const parts = s
    .split(/[\n,;|]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

const CUPON_FLOW_KEYS = [
  "sorteo_cupones",
  "sorteo_cupones_texto",
  "numeros_cupon_lineas",
  "numeros_cupon",
  "numeros_cupones",
  "cupones",
  "cupones_generados",
  "nros_cupones",
  "nros_cupon",
  "tus_numeros",
  "tus_numeros_generados",
  "numeros_generados",
] as const;

function cuponesFromFlowData(flowData: Record<string, string>): string[] {
  for (const k of CUPON_FLOW_KEYS) {
    const v = parseCuponesFromString(flowData[k]);
    if (v.length > 0) return v;
  }
  return [];
}

function cuponesFromOrderResult(orderResult: EnsureSorteoOrderCreatedData): string[] {
  return orderResult.cupones.map((c) => norm(c.numero_cupon)).filter(Boolean);
}

const ORDEN_FLOW_KEYS = [
  "numero_orden",
  "id_orden",
  "ID_orden",
  "sorteo_orden_codigo",
  "numero_de_orden",
  "id_tu_orden",
  "orden_id",
  "order_id",
] as const;

function numeroOrdenFromFlow(flowData: Record<string, string>): string {
  for (const k of ORDEN_FLOW_KEYS) {
    const v = norm(flowData[k]);
    if (v) return v;
  }
  return "";
}

const SORTEO_NOMBRE_KEYS = ["sorteo_nombre", "sorteo_name", "nombre_sorteo"] as const;

function sorteoNombreFromFlow(flowData: Record<string, string>): string {
  for (const k of SORTEO_NOMBRE_KEYS) {
    const v = norm(flowData[k]);
    if (v) return v;
  }
  return "";
}

function buildNombreCompletoFromParts(flowData: Record<string, string>): string {
  const n = norm(flowData["nombre"]);
  const a = norm(flowData["apellido"]);
  const joined = [n, a].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  return (
    norm(flowData["nombre_completo"]) ||
    norm(flowData["nombre_y_apellido"]) ||
    norm(flowData["cliente_nombre"]) ||
    norm(flowData["participante"]) ||
    ""
  );
}

function documentoFromFlow(flowData: Record<string, string>): string {
  return (
    norm(flowData["cedula"]) ||
    norm(flowData["cliente_documento"]) ||
    norm(flowData["documento"]) ||
    norm(flowData["ci"]) ||
    norm(flowData["ruc"]) ||
    ""
  );
}

function telefonoFromFlow(flowData: Record<string, string>): string {
  return (
    norm(flowData["telefono"]) ||
    norm(flowData["celular"]) ||
    norm(flowData["whatsapp"]) ||
    norm(flowData["phone"]) ||
    ""
  );
}

export type SorteoTicketNormalizedRenderFields = {
  clienteNombre: string;
  documento: string;
  telefono: string;
  numeroOrden: string;
  sorteoNombre: string;
  cupones: string[];
};

/**
 * Une `orderResult`, aliases de `chat_flow_data` y nombre de catálogo del sorteo.
 * Prioridad: datos persistidos en la orden (cupones / número) > strings del flujo > vacío.
 */
export function buildSorteoTicketRenderData(input: {
  flowData: Record<string, string>;
  orderResult: EnsureSorteoOrderCreatedData;
  sorteoNombreCatalog: string;
}): SorteoTicketNormalizedRenderFields {
  const { flowData, orderResult, sorteoNombreCatalog } = input;

  let cupones = cuponesFromOrderResult(orderResult);
  if (cupones.length === 0) {
    cupones = cuponesFromFlowData(flowData);
  }

  let numeroOrden = "";
  const noFromOrder = orderResult.numeroOrden;
  if (typeof noFromOrder === "number" && Number.isFinite(noFromOrder) && noFromOrder > 0) {
    numeroOrden = String(noFromOrder);
  } else if (noFromOrder != null && String(noFromOrder).trim() !== "") {
    numeroOrden = String(noFromOrder).trim();
  }
  if (!numeroOrden) {
    numeroOrden = numeroOrdenFromFlow(flowData);
  }

  const sorteoNombre =
    norm(orderResult.sorteoNombre) || sorteoNombreFromFlow(flowData) || norm(sorteoNombreCatalog);

  const clienteNombre = buildNombreCompletoFromParts(flowData);
  const documento = documentoFromFlow(flowData);
  const telefono = telefonoFromFlow(flowData);

  return {
    clienteNombre,
    documento,
    telefono,
    numeroOrden,
    sorteoNombre,
    cupones,
  };
}

/** Log seguro para diagnóstico (sin volcar PII). */
export function sorteoTicketRenderDataLogPayload(fields: SorteoTicketNormalizedRenderFields): Record<string, unknown> {
  const no = fields.numeroOrden.trim();
  return {
    hasClienteNombre: Boolean(fields.clienteNombre.trim()),
    hasDocumento: Boolean(fields.documento.trim()),
    hasTelefono: Boolean(fields.telefono.trim()),
    numeroOrdenPresent: Boolean(no),
    numeroOrdenLen: no.length,
    cuponesCount: fields.cupones.length,
    sorteoNombrePresent: Boolean(fields.sorteoNombre.trim()),
  };
}
