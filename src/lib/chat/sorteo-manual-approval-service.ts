import "server-only";

import {
  buildChatFlowDataUpsertsForSorteoOrder,
  finalizeSorteoOrderFromConfirmedFlowData,
} from "@/lib/sorteos/sorteo-order-from-chat";
import {
  SORTEO_COMPROBANTE_ESTADO_VALIDACION_FIELD,
  SORTEO_COMPROBANTE_MOTIVO_VALIDACION_FIELD,
  SORTEO_COMPROBANTE_VALIDACION_ID_FIELD,
} from "@/lib/chat/comprobante-validation-types";
import { loadHydratedFlowSessionData } from "@/lib/chat/flow-engine-service";
import { deliverSorteoPostOrderToCustomer } from "@/lib/chat/sorteo-post-order-customer-delivery";
import { buildOrderResultFromEntradaId } from "@/lib/sorteos/sorteo-ticket-admin";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { EnsureSorteoOrderCreatedData } from "@/lib/sorteos/sorteo-order-from-chat";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";

export type ManualSorteoApprovalResult =
  | {
      ok: true;
      reused: boolean;
      entradaId: string;
      numeroOrden: number;
      cuponesCount: number;
      sorteoId: string;
      whatsappWarning?: string;
      ticketWarning?: string;
    }
  | { ok: false; code: string; message: string };

type ValidationRow = {
  id: string;
  estado_validacion: string;
  motivo_validacion: string | null;
  conversation_id: string;
  flow_session_id: string;
  flow_code: string;
  sorteo_entrada_id: string | null;
};

function logManual(tag: string, payload: Record<string, unknown>) {
  console.info(`[sorteo-manual-approval][${tag}]`, payload);
}

export async function approveComprobanteAndCloseSorteoPurchase(input: {
  supabase: AppSupabaseClient;
  empresaId: string;
  usuarioId: string;
  validacionId: string;
  approvalNote?: string | null;
}): Promise<ManualSorteoApprovalResult> {
  const vid = input.validacionId.trim();
  const note = (input.approvalNote ?? "").trim().slice(0, 2000);
  const dataSchema = await fetchDataSchemaForEmpresaId(input.empresaId);

  logManual("start", {
    schema: dataSchema,
    empresa_id: input.empresaId,
    validation_id: vid,
    approved_by: input.usuarioId,
  });

  const { data: vRow, error: vErr } = await input.supabase
    .from("chat_comprobante_validaciones")
    .select(
      "id, estado_validacion, motivo_validacion, conversation_id, flow_session_id, flow_code, sorteo_entrada_id"
    )
    .eq("id", vid)
    .eq("empresa_id", input.empresaId)
    .maybeSingle();

  if (vErr) {
    logManual("error", { validation_id: vid, code: "query", message: vErr.message });
    return { ok: false, code: "query", message: vErr.message };
  }
  const row = vRow as ValidationRow | null;
  if (!row) {
    return { ok: false, code: "not_found", message: "Validación no encontrada" };
  }

  logManual("validation-loaded", {
    schema: dataSchema,
    empresa_id: input.empresaId,
    validation_id: row.id,
    estado_prev: row.estado_validacion,
    tiene_entrada: Boolean(row.sorteo_entrada_id),
  });

  const { data: conv, error: cErr } = await input.supabase
    .from("chat_conversations")
    .select("id, contact_id, channel_id")
    .eq("id", row.conversation_id)
    .eq("empresa_id", input.empresaId)
    .maybeSingle();
  if (cErr || !conv) {
    return { ok: false, code: "conversation", message: cErr?.message ?? "Conversación no encontrada" };
  }
  const contactId = String((conv as { contact_id?: string }).contact_id ?? "");
  const channelId = String((conv as { channel_id?: string }).channel_id ?? "");
  if (!contactId || !channelId) {
    return { ok: false, code: "conversation_incomplete", message: "Conversación sin contacto o canal" };
  }

  const flowCode = row.flow_code.trim();
  const flowSessionId = row.flow_session_id.trim();
  if (!flowCode || !flowSessionId) {
    return { ok: false, code: "flow", message: "Validación sin flow_code o flow_session_id" };
  }

  /** Idempotencia: ya linked entrada */
  if (row.sorteo_entrada_id) {
    const existing = await buildOrderResultFromEntradaId(
      input.supabase,
      row.sorteo_entrada_id,
      input.empresaId
    );
    if (existing) {
      logManual("order-reused", {
        schema: dataSchema,
        empresa_id: input.empresaId,
        validation_id: row.id,
        entrada_id: existing.entradaId,
        cupones_count: existing.cupones.length,
      });
      const hydFd = await loadHydratedFlowSessionData(input.supabase, {
        empresaId: input.empresaId,
        conversationId: row.conversation_id,
        flowCode,
        flowSessionId,
      });
      const sendOut = await deliverSorteoPostOrderToCustomer({
        supabase: input.supabase,
        empresaId: input.empresaId,
        conversationId: row.conversation_id,
        contactId,
        channelId,
        flowSessionId,
        orderResult: existing,
        flowData: hydFd,
        automationSource: "sorteo_manual_approval",
      });
      const whatsappWarning = sendOut.textError;
      const ticketWarning = sendOut.ticketError;
      logManual("done", {
        schema: dataSchema,
        empresa_id: input.empresaId,
        validation_id: row.id,
        entrada_id: existing.entradaId,
        reused: true,
        cupones_count: existing.cupones.length,
      });
      return {
        ok: true,
        reused: true,
        entradaId: existing.entradaId,
        numeroOrden: existing.numeroOrden,
        cuponesCount: existing.cupones.length,
        sorteoId: existing.sorteoId,
        whatsappWarning,
        ticketWarning,
      };
    }
  }

  let hydFd = await loadHydratedFlowSessionData(input.supabase, {
    empresaId: input.empresaId,
    conversationId: row.conversation_id,
    flowCode,
    flowSessionId,
  });

  hydFd = {
    ...hydFd,
    [SORTEO_COMPROBANTE_VALIDACION_ID_FIELD]: row.id,
    [SORTEO_COMPROBANTE_ESTADO_VALIDACION_FIELD]: "aprobado_manual",
    [SORTEO_COMPROBANTE_MOTIVO_VALIDACION_FIELD]: "asesor_aprobo_comprobante",
  };

  const { data: contactRow } = await input.supabase
    .from("chat_contacts")
    .select("phone_number")
    .eq("id", contactId)
    .eq("empresa_id", input.empresaId)
    .maybeSingle();
  const waDigits = String((contactRow as { phone_number?: string } | null)?.phone_number ?? "").replace(/\D/g, "");
  if (!waDigits) {
    return { ok: false, code: "phone", message: "No se pudo resolver WhatsApp del contacto" };
  }

  logManual("finalize_invoke", {
    schema: dataSchema,
    empresa_id: input.empresaId,
    conversation_id: row.conversation_id,
    flow_session_id: flowSessionId,
    validation_id: row.id,
  });

  const fin = await finalizeSorteoOrderFromConfirmedFlowData(input.supabase, {
    empresaId: input.empresaId,
    conversationId: row.conversation_id,
    flowCode,
    flowSessionId,
    whatsappNumero: waDigits,
    flowData: hydFd,
  });

  if (!fin.ok) {
    logManual("error", {
      schema: dataSchema,
      empresa_id: input.empresaId,
      validation_id: row.id,
      message: fin.message,
    });
    return { ok: false, code: "finalize_failed", message: fin.message };
  }

  if (fin.skipped) {
    const msg =
      fin.reason === "sin_comprobante_en_sesion"
        ? "Falta comprobante o media en la sesión del flujo."
        : fin.reason === "datos_flujo_incompletos"
          ? "Datos del participante incompletos en el flujo."
          : fin.reason === "comprobante_no_validado"
            ? "Estado de comprobante no permite cierre."
            : `No se pudo cerrar: ${fin.reason ?? "desconocido"}`;
    logManual("error", { validation_id: row.id, reason: fin.reason });
    return { ok: false, code: fin.reason ?? "skipped", message: msg };
  }

  const orderData: EnsureSorteoOrderCreatedData = fin;

  const ctxUpserts = buildChatFlowDataUpsertsForSorteoOrder(
    input.empresaId,
    row.conversation_id,
    flowCode,
    flowSessionId,
    orderData
  );
  const { error: ctxErr } = await input.supabase.from("chat_flow_data").upsert(ctxUpserts, {
    onConflict: "flow_session_id,field_name",
  });
  if (ctxErr) {
    logManual("error", { phase: "flow_data_order_context", message: ctxErr.message });
    return { ok: false, code: "flow_data", message: ctxErr.message };
  }

  const prevEst = row.estado_validacion;
  const prevMot = row.motivo_validacion;

  const { error: upErr } = await input.supabase
    .from("chat_comprobante_validaciones")
    .update({
      estado_validacion: "aprobado_manual",
      motivo_validacion: "asesor_aprobo_comprobante",
      sorteo_entrada_id: orderData.entradaId,
      previous_estado_validacion: prevEst,
      previous_motivo_validacion: prevMot,
      manual_approval_usuario_id: input.usuarioId,
      manual_approval_at: new Date().toISOString(),
      manual_approval_source: "inbox_manual",
      manual_approval_note: note || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("empresa_id", input.empresaId);

  if (upErr) {
    logManual("error", { phase: "validation_update", message: upErr.message });
    return {
      ok: false,
      code: "validation_update",
      message:
        "La orden se registró pero falló actualizar la validación. Revisá en Entradas / Cupones. " + upErr.message,
    };
  }

  const estadoUpserts = [
    {
      empresa_id: input.empresaId,
      conversation_id: row.conversation_id,
      flow_code: flowCode,
      flow_session_id: flowSessionId,
      field_name: SORTEO_COMPROBANTE_ESTADO_VALIDACION_FIELD,
      field_value: "aprobado_manual",
    },
    {
      empresa_id: input.empresaId,
      conversation_id: row.conversation_id,
      flow_code: flowCode,
      flow_session_id: flowSessionId,
      field_name: SORTEO_COMPROBANTE_MOTIVO_VALIDACION_FIELD,
      field_value: "asesor_aprobo_comprobante",
    },
  ];
  await input.supabase.from("chat_flow_data").upsert(estadoUpserts, {
    onConflict: "flow_session_id,field_name",
  });

  await input.supabase.from("chat_flow_events").insert({
    empresa_id: input.empresaId,
    conversation_id: row.conversation_id,
    flow_code: flowCode,
    node_code: null,
    flow_session_id: flowSessionId,
    event_type: "sorteo_manual_approval",
    payload: {
      validation_id: row.id,
      entrada_id: orderData.entradaId,
      numero_orden: orderData.numeroOrden,
      approved_by: input.usuarioId,
      note: note || null,
      idempotent: orderData.idempotent === true,
    },
  });

  logManual("order-created", {
    schema: dataSchema,
    empresa_id: input.empresaId,
    conversation_id: row.conversation_id,
    flow_session_id: flowSessionId,
    validation_id: row.id,
    entrada_id: orderData.entradaId,
    sorteo_id: orderData.sorteoId,
    cupones_count: orderData.cupones.length,
    approved_by: input.usuarioId,
  });

  const mergedFlowForDelivery = {
    ...hydFd,
    ...Object.fromEntries(
      ctxUpserts.map((r) => [r.field_name, r.field_value] as [string, string])
    ),
  };

  const sendOut = await deliverSorteoPostOrderToCustomer({
    supabase: input.supabase,
    empresaId: input.empresaId,
    conversationId: row.conversation_id,
    contactId,
    channelId,
    flowSessionId,
    orderResult: orderData,
    flowData: mergedFlowForDelivery,
    automationSource: "sorteo_manual_approval",
  });

  logManual("ticket-sent", {
    schema: dataSchema,
    empresa_id: input.empresaId,
    conversation_id: row.conversation_id,
    flow_session_id: flowSessionId,
    validation_id: row.id,
    entrada_id: orderData.entradaId,
    sorteo_id: orderData.sorteoId,
    cupones_count: orderData.cupones.length,
    approved_by: input.usuarioId,
    text_ok: !sendOut.textError,
    ticket_ok: !sendOut.ticketError,
  });

  logManual("done", {
    schema: dataSchema,
    empresa_id: input.empresaId,
    validation_id: row.id,
    entrada_id: orderData.entradaId,
    cupones_count: orderData.cupones.length,
    approved_by: input.usuarioId,
  });

  return {
    ok: true,
    reused: orderData.idempotent === true,
    entradaId: orderData.entradaId,
    numeroOrden: orderData.numeroOrden,
    cuponesCount: orderData.cupones.length,
    sorteoId: orderData.sorteoId,
    whatsappWarning: sendOut.textError,
    ticketWarning: sendOut.ticketError,
  };
}
