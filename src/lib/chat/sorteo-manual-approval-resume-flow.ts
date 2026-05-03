import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { ParticipantFieldKind } from "@/lib/sorteos/sorteo-participant-preflight";
import {
  advanceConversationToNode,
  sendCurrentFlowNode,
  getConversationFlowState,
} from "@/lib/chat/flow-engine-service";
import {
  resolveOutboundTextContextFromIds,
  sendOutboundTextMessage,
} from "@/lib/chat/outbound-send-dispatch";
import { persistOutgoingChatMessage } from "@/lib/chat/outgoing-message-persist";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import {
  FLOW_SORTEO_PENDIENTE_DATOS_PARTICIPANTE_FIELD,
  MOTIVO_VALIDACION_ASESOR_PENDIENTE_DATOS,
  SORTEO_COMPROBANTE_ESTADO_VALIDACION_FIELD,
  SORTEO_COMPROBANTE_MOTIVO_VALIDACION_FIELD,
  SORTEO_COMPROBANTE_VALIDACION_ID_FIELD,
} from "@/lib/chat/comprobante-validation-types";

type FlowNodeRow = {
  id: string;
  node_code: string;
  node_type: string;
  message_text: string | null;
  save_as_field: string | null;
  next_node_code: string | null;
};

type FlowOptRow = {
  node_id: string;
  next_node_code: string | null;
};

function norm(s: string | undefined | null): string {
  return (s ?? "").trim();
}

function nodeMatchesField(node: FlowNodeRow, field: ParticipantFieldKind): boolean {
  const sf = norm(node.save_as_field).toLowerCase();
  const nt = norm(node.node_type).toLowerCase();
  if (field === "cantidad") {
    return nt === "buttons" || nt === "list";
  }
  if (field === "nombre") {
    return nt === "text" && /nombre|apellido|completo/.test(sf);
  }
  if (field === "cedula") {
    return nt === "text" && /cedula|documento|^ci$|dni|ruc/.test(sf);
  }
  if (field === "ciudad") {
    return nt === "text" && /ciudad|localidad|ubicaci/.test(sf);
  }
  return false;
}

/**
 * Primer nodo del grafo (por BFS desde raíces) que cubre el primer campo faltante en orden de prioridad.
 */
export async function findResumeNodeForMissingFields(
  supabase: AppSupabaseClient,
  empresaId: string,
  flowCode: string,
  missingFields: ParticipantFieldKind[]
): Promise<{ nodeCode: string; messageText: string } | null> {
  const fc = flowCode.trim();
  if (!fc || missingFields.length === 0) return null;

  const { data: nodesRaw, error: nErr } = await supabase
    .from("chat_flow_nodes")
    .select("id, node_code, node_type, message_text, save_as_field, next_node_code")
    .eq("empresa_id", empresaId)
    .eq("flow_code", fc)
    .eq("is_active", true);
  if (nErr || !nodesRaw?.length) return null;

  const nodes = nodesRaw as FlowNodeRow[];
  const byCode = new Map(nodes.map((n) => [n.node_code.trim(), n]));
  const nodeIds = nodes.map((n) => n.id);

  const { data: optsRaw } = await supabase
    .from("chat_flow_options")
    .select("node_id, next_node_code")
    .in("node_id", nodeIds);
  const opts = (optsRaw ?? []) as FlowOptRow[];

  const targets = new Set<string>();
  const adj = new Map<string, string[]>();

  function addEdge(from: string, to: string | null | undefined) {
    const t = norm(to);
    if (!t) return;
    targets.add(t);
    const list = adj.get(from) ?? [];
    list.push(t);
    adj.set(from, list);
  }

  for (const n of nodes) {
    const code = n.node_code.trim();
    addEdge(code, n.next_node_code);
  }
  const idToCode = new Map(nodes.map((n) => [n.id, n.node_code.trim()]));
  for (const o of opts) {
    const parent = idToCode.get(o.node_id);
    if (parent) addEdge(parent, o.next_node_code);
  }

  const roots = nodes.map((n) => n.node_code.trim()).filter((c) => !targets.has(c));
  const queue = [...roots];
  const visited = new Set<string>();
  const order: string[] = [];
  while (queue.length) {
    const code = queue.shift()!;
    if (visited.has(code)) continue;
    visited.add(code);
    order.push(code);
    for (const nx of adj.get(code) ?? []) {
      if (!visited.has(nx)) queue.push(nx);
    }
  }

  for (const field of missingFields) {
    for (const code of order) {
      const node = byCode.get(code);
      if (node && nodeMatchesField(node, field)) {
        return { nodeCode: code, messageText: norm(node.message_text) };
      }
    }
    if (field === "cantidad") {
      for (const code of order) {
        const node = byCode.get(code);
        const nt = norm(node?.node_type).toLowerCase();
        if (node && (nt === "buttons" || nt === "list")) {
          return { nodeCode: code, messageText: norm(node.message_text) };
        }
      }
    }
  }

  for (const code of order) {
    const node = byCode.get(code);
    const nt = norm(node?.node_type).toLowerCase();
    if (node && nt === "text" && norm(node.save_as_field)) {
      return { nodeCode: code, messageText: norm(node.message_text) };
    }
  }

  return null;
}

export async function runManualApprovalResumeParticipantFlow(input: {
  supabase: AppSupabaseClient;
  empresaId: string;
  usuarioId: string;
  conversationId: string;
  flowCode: string;
  flowSessionId: string;
  channelId: string;
  contactId: string;
  validationId: string;
  missingFields: ParticipantFieldKind[];
  nextNodeCode: string;
  note: string;
  /** Campos extra en chat_flow_data (opcional; no duplicar los que ya arma esta función). */
  mergedFlowDataPatch?: Record<string, string>;
}): Promise<{ whatsappWarning?: string }> {
  const fc = input.flowCode.trim();
  const sid = input.flowSessionId.trim();
  const pendienteUpserts = [
    {
      empresa_id: input.empresaId,
      conversation_id: input.conversationId,
      flow_code: fc,
      flow_session_id: sid,
      field_name: FLOW_SORTEO_PENDIENTE_DATOS_PARTICIPANTE_FIELD,
      field_value: "si",
    },
    {
      empresa_id: input.empresaId,
      conversation_id: input.conversationId,
      flow_code: fc,
      flow_session_id: sid,
      field_name: SORTEO_COMPROBANTE_VALIDACION_ID_FIELD,
      field_value: input.validationId,
    },
    {
      empresa_id: input.empresaId,
      conversation_id: input.conversationId,
      flow_code: fc,
      flow_session_id: sid,
      field_name: SORTEO_COMPROBANTE_ESTADO_VALIDACION_FIELD,
      field_value: "aprobado_manual",
    },
    {
      empresa_id: input.empresaId,
      conversation_id: input.conversationId,
      flow_code: fc,
      flow_session_id: sid,
      field_name: SORTEO_COMPROBANTE_MOTIVO_VALIDACION_FIELD,
      field_value: MOTIVO_VALIDACION_ASESOR_PENDIENTE_DATOS,
    },
    ...Object.entries(input.mergedFlowDataPatch ?? {}).map(([field_name, field_value]) => ({
      empresa_id: input.empresaId,
      conversation_id: input.conversationId,
      flow_code: fc,
      flow_session_id: sid,
      field_name,
      field_value,
    })),
  ];

  const { error: fdErr } = await input.supabase.from("chat_flow_data").upsert(pendienteUpserts, {
    onConflict: "flow_session_id,field_name",
  });
  if (fdErr) throw new Error(fdErr.message);

  const nowIso = new Date().toISOString();

  await input.supabase
    .from("chat_flow_sessions")
    .update({
      status: "active",
      ended_at: null,
      end_reason: null,
    })
    .eq("id", sid)
    .eq("empresa_id", input.empresaId);

  /** Una sola sesión activa por conversación: el motor y chat_flow_data usan active_flow_session_id. */
  await input.supabase
    .from("chat_flow_sessions")
    .update({
      status: "abandoned",
      ended_at: nowIso,
      end_reason: "manual_approval_resume_other_sessions",
    })
    .eq("empresa_id", input.empresaId)
    .eq("conversation_id", input.conversationId)
    .eq("status", "active")
    .neq("id", sid);

  const adv = await advanceConversationToNode(input.supabase, {
    conversationId: input.conversationId,
    empresaId: input.empresaId,
    flowCode: fc,
    nextNodeCode: input.nextNodeCode,
  });
  if (!adv.ok) throw new Error(adv.error ?? "advanceConversationToNode");

  const { error: convSidErr } = await input.supabase
    .from("chat_conversations")
    .update({
      active_flow_session_id: sid,
      updated_at: nowIso,
    })
    .eq("id", input.conversationId)
    .eq("empresa_id", input.empresaId);
  if (convSidErr) throw new Error(convSidErr.message);

  await input.supabase.from("chat_flow_events").insert({
    empresa_id: input.empresaId,
    conversation_id: input.conversationId,
    flow_code: fc,
    node_code: input.nextNodeCode,
    flow_session_id: sid,
    event_type: "sorteo_manual_approval_pending_data",
    payload: {
      validation_id: input.validationId,
      missing_fields: input.missingFields,
      next_node_code: input.nextNodeCode,
      approved_by: input.usuarioId,
      approval_source: "inbox_manual",
      note: input.note || null,
    },
  });

  await input.supabase.from("chat_flow_events").insert({
    empresa_id: input.empresaId,
    conversation_id: input.conversationId,
    flow_code: fc,
    node_code: input.nextNodeCode,
    flow_session_id: sid,
    event_type: "sorteo_manual_approval_resume_node_set",
    payload: {
      validation_id: input.validationId,
      active_flow_session_id: sid,
      flow_current_node: input.nextNodeCode,
      reason: "manual_approval_pending_data",
    },
  });

  const schema = await fetchDataSchemaForEmpresaId(input.empresaId);
  const outbound = await resolveOutboundTextContextFromIds(
    input.supabase,
    { contactId: input.contactId, channelId: input.channelId },
    { dataSchema: schema }
  );

  const intro =
    "Tu comprobante fue aprobado por un asesor. Para completar tu inscripción al sorteo, necesitamos estos datos que faltan.";
  const sendIntro = await sendOutboundTextMessage(outbound, intro);
  const st = await getConversationFlowState(input.supabase, input.conversationId);
  if (sendIntro.ok && st) {
    await persistOutgoingChatMessage(input.supabase, {
      conversation: { id: st.id, empresa_id: st.empresa_id },
      content: intro,
      messageType: "text",
      waMessageId: sendIntro.waMessageId,
      raw: sendIntro.raw,
      senderType: "system",
      automationSource: "sorteo_manual_approval_resume",
    });
  }

  await sendCurrentFlowNode(input.supabase, {
    conversationId: input.conversationId,
  });

  return {
    whatsappWarning: sendIntro.ok ? undefined : sendIntro.error,
  };
}
