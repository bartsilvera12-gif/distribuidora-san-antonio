/**
 * Webhooks YCloud (POST cuerpo JSON + firma `YCloud-Signature`):
 *
 * - `whatsapp.inbound_message.received` — objeto `whatsappInboundMessage` (cliente → negocio).
 *   Persistencia + autoasignación de cola cuando corresponde.
 * - `whatsapp.smb.message.echoes` — objeto `whatsappMessage` (eco de envíos desde la app WhatsApp Business /
 *   WhatsApp corporativo; `from` = línea del negocio, `to` = cliente). Persistencia como mensaje saliente
 *   (`from_me`, sin incrementar unread). Sin autoasignación.
 *
 * Referencia YCloud (ejemplos SMB / sync): https://docs.ycloud.com/reference/whatsapp-business-app-sent-message-sync-webhook-examples
 */
import { NextRequest } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { assignConversation } from "@/lib/chat/assign-conversation-service";
import { saveIncomingMessage } from "@/lib/chat/incoming-message-service";
import { normalizeWaPhone } from "@/lib/chat/wa-phone";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { assignConversationPg } from "@/lib/chat/webhooks/assign-conversation-pg";
import {
  extractDisplayName,
  extractExternalMessageId,
  extractInboundIdentifiers,
  extractMessageContent,
  extractSendTimeIso,
  extractSmbEchoIdentifiersForRouting,
  parseYCloudWebhookEnvelope,
} from "@/lib/chat/webhooks/ycloud-inbound-payload";
import { persistYCloudInboundMessagePg } from "@/lib/chat/webhooks/ycloud-inbound-persist-pg";
import { resolveYCloudChannelForWebhook } from "@/lib/chat/webhooks/ycloud-resolve-channel";

export const dynamic = "force-dynamic";

const LOG = "[webhooks/ycloud]";
const LOG_IN = "[ycloud-incoming]";

type PersistMode = "inbound" | "smb_echo";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const sigHeader =
    request.headers.get("ycloud-signature") ??
    request.headers.get("YCloud-Signature") ??
    request.headers.get("x-ycloud-signature");

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    console.warn(LOG, LOG_IN, "JSON inválido");
    return new Response("Bad Request", { status: 400 });
  }

  const env = parseYCloudWebhookEnvelope(body);
  const eventType = typeof env?.type === "string" ? env.type.trim() : "";

  let msg: Record<string, unknown>;
  let ids: ReturnType<typeof extractInboundIdentifiers>;
  let mode: PersistMode;

  if (eventType === "whatsapp.inbound_message.received") {
    mode = "inbound";
    const wim = env?.whatsappInboundMessage;
    if (!wim || typeof wim !== "object" || Array.isArray(wim)) {
      console.warn(LOG, LOG_IN, "sin whatsappInboundMessage");
      return new Response("Bad Request", { status: 400 });
    }
    msg = wim as Record<string, unknown>;
    ids = extractInboundIdentifiers(msg);
  } else if (eventType === "whatsapp.smb.message.echoes") {
    mode = "smb_echo";
    const wm = env?.whatsappMessage;
    if (!wm || typeof wm !== "object" || Array.isArray(wm)) {
      console.warn(LOG, LOG_IN, "sin whatsappMessage (echo SMB)");
      return new Response("Bad Request", { status: 400 });
    }
    msg = wm as Record<string, unknown>;
    ids = extractSmbEchoIdentifiersForRouting(msg);
  } else {
    console.info(LOG, LOG_IN, "evento ignorado (ack)", { eventType, event_id: env?.id });
    return new Response("OK", { status: 200 });
  }

  if (!ids) {
    console.warn(LOG, LOG_IN, "sin from/to/waba suficiente", { keys: Object.keys(msg), mode });
    return new Response("Bad Request", { status: 400 });
  }

  const resolved = await resolveYCloudChannelForWebhook(rawBody, sigHeader, ids);
  if (!resolved) {
    return new Response("Unauthorized", { status: 401 });
  }

  console.info(LOG, LOG_IN, "canal_resuelto", {
    empresa_id: resolved.empresa_id,
    data_schema: resolved.data_schema,
    channel_id: resolved.channel_id,
    wabaId: ids.wabaId,
    from: ids.from,
    mode,
  });

  const externalId = extractExternalMessageId(msg);
  const { message_type, content } = extractMessageContent(msg);
  const createdAt = extractSendTimeIso(msg);
  const displayName = extractDisplayName(msg);

  const pool = getChatPostgresPool();
  const usePgPersist =
    Boolean(pool) &&
    (isLikelyUnexposedTenantChatSchema(resolved.data_schema) || process.env.YCLOUD_WEBHOOK_CHAT_PG_ALWAYS === "1");

  let conversationId: string;
  let messageId: string;

  const fromMe = mode === "smb_echo";
  const senderType = mode === "smb_echo" ? "human" : "contact";
  const bumpUnread = mode === "inbound";

  if (usePgPersist) {
    console.info(LOG, LOG_IN, "persist_modo", { modo: "postgres_directo", data_schema: resolved.data_schema, mode });
    const save = await persistYCloudInboundMessagePg({
      data_schema: resolved.data_schema,
      empresa_id: resolved.empresa_id,
      channel_id: resolved.channel_id,
      external_id: externalId,
      contact_phone_normalized: normalizeWaPhone(ids.from),
      contact_display_name: displayName?.trim() || normalizeWaPhone(ids.from),
      message_type,
      content,
      raw_payload: env as unknown as Record<string, unknown>,
      created_at_iso: createdAt ?? new Date().toISOString(),
      from_me: fromMe,
      sender_type: senderType,
      bump_unread: bumpUnread,
    });
    if (!save.ok) {
      console.error(LOG, LOG_IN, "persist_pg_falló", save.error);
      return new Response("Error", { status: 500 });
    }
    if (save.skipped_duplicate) {
      console.info(LOG, LOG_IN, "duplicado_omitido", { externalId, mode });
      return new Response("OK", { status: 200 });
    }
    conversationId = save.conversation_id;
    messageId = save.message_id;

    if (mode === "inbound") {
      const ar1 = await assignConversationPg(pool!, resolved.data_schema, conversationId);
      if (!ar1.ok) {
        console.warn(LOG, LOG_IN, "assign_pg", conversationId, ar1.error);
      } else if (ar1.assigned) {
        console.info(LOG, LOG_IN, "assign_pg_ok", { conversation_id: conversationId, agent_id: ar1.agent_id });
      } else {
        console.info(LOG, LOG_IN, "assign_pg_sin_asignación", { conversation_id: conversationId, reason: ar1.reason });
      }
    } else {
      console.info(LOG, LOG_IN, "echo_smb_sin_autoasignación", { conversation_id: conversationId });
    }
  } else {
    const supabase = await getChatServiceClientForEmpresa(resolved.empresa_id);
    console.info(LOG, LOG_IN, "persist_modo", { modo: "postgrest", mode });
    const save = await saveIncomingMessage({
      supabase,
      channel: {
        id: resolved.channel_id,
        empresa_id: resolved.empresa_id,
        type: "whatsapp",
      },
      external_id: externalId,
      contact_data: {
        address: ids.from,
        display_name: displayName,
      },
      message_data: {
        message_type,
        content,
        raw_payload: env as unknown as Record<string, unknown>,
        created_at: createdAt,
        from_me: fromMe,
        sender_type: senderType,
      },
    });

    if (!save.ok) {
      console.error(LOG, LOG_IN, "saveIncomingMessage", save.error);
      return new Response("Error", { status: 500 });
    }

    if (save.skipped_duplicate) {
      console.info(LOG, LOG_IN, "duplicado_omitido", { externalId, mode });
      return new Response("OK", { status: 200 });
    }
    conversationId = save.conversation_id;
    messageId = save.message_id;

    if (mode === "inbound") {
      const ar = await assignConversation(supabase, conversationId);
      if (!ar.ok) {
        console.warn(LOG, LOG_IN, "assignConversation", conversationId, ar.error);
      } else if (ar.assigned) {
        console.info(LOG, LOG_IN, "assignConversation_ok", { conversation_id: conversationId, agent_id: ar.agent_id });
      } else {
        console.info(LOG, LOG_IN, "assignConversation_sin_asignación", {
          conversation_id: conversationId,
          reason: ar.reason,
        });
      }
    } else {
      console.info(LOG, LOG_IN, "echo_smb_sin_autoasignación", { conversation_id: conversationId });
    }
  }

  console.info(LOG, LOG_IN, "mensaje_persistido", {
    conversation_id: conversationId,
    message_id: messageId,
    mode,
  });

  return new Response("OK", { status: 200 });
}
