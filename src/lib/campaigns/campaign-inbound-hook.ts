import "server-only";
import type { SupabaseAdmin } from "@/lib/chat/types";
import { normalizeWaPhone } from "@/lib/chat/wa-phone";
import { digitsInternational } from "@/lib/campaigns/campaign-phone";

const LOG_IN = "[campaign-reply][inbound-received]";
const LOG_MATCH = "[campaign-reply][recipient-match]";
const LOG_MARK = "[campaign-reply][marked-first-reply]";
const LOG_NONE = "[campaign-reply][no-match]";

const DEFAULT_LOOKBACK_DAYS = 7;

function maskPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length <= 4) return "****";
  return `****${d.slice(-4)}`;
}

function replyLookbackMs(): number {
  const raw = process.env.CAMPAIGN_REPLY_LOOKBACK_DAYS?.trim();
  const n = raw ? parseInt(raw, 10) : DEFAULT_LOOKBACK_DAYS;
  const days = !Number.isNaN(n) && n >= 1 && n <= 90 ? n : DEFAULT_LOOKBACK_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

/**
 * Tras un inbound real del contacto: marca el recipient de campaña más reciente (mismo canal/teléfono)
 * si el envío ocurrió antes del inbound y dentro de la ventana configurada (`CAMPAIGN_REPLY_LOOKBACK_DAYS`, default 7).
 * Idempotente por `first_reply_at`.
 *
 * Debe invocarse tanto desde webhooks Meta (`whatsapp-webhook-service`) como desde rutas que usan `saveIncomingMessage`.
 */
export async function markCampaignReplyFromInbound(params: {
  supabase: SupabaseAdmin;
  empresaId: string;
  channelId: string;
  contactId: string;
  /** ISO del mensaje entrante (Meta timestamp o servidor). */
  inboundAtIso?: string;
  preview?: string;
  waMessageId?: string;
}): Promise<void> {
  const { supabase, empresaId, channelId, contactId, inboundAtIso, preview, waMessageId } = params;

  const inboundTs =
    inboundAtIso?.trim() && !Number.isNaN(Date.parse(inboundAtIso))
      ? inboundAtIso.trim()
      : new Date().toISOString();
  const inboundMs = Date.parse(inboundTs);
  const lookbackMs = replyLookbackMs();

  const { data: contact, error: cErr } = await supabase
    .from("chat_contacts")
    .select("phone_number")
    .eq("id", contactId)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  if (cErr || !contact) {
    console.info(LOG_NONE, {
      empresa_id: empresaId,
      contact_id: contactId,
      reason: "contact_not_found",
      wa_message_id: waMessageId ?? null,
    });
    return;
  }

  const phoneDigits = normalizeWaPhone((contact as { phone_number?: string }).phone_number ?? "");
  if (!phoneDigits) {
    console.info(LOG_NONE, {
      empresa_id: empresaId,
      contact_id: contactId,
      reason: "contact_phone_empty",
      wa_message_id: waMessageId ?? null,
    });
    return;
  }

  console.info(LOG_IN, {
    empresa_id: empresaId,
    channel_id: channelId,
    contact_id: contactId,
    phone_masked: maskPhoneDigits(phoneDigits),
    created_at: inboundTs,
    wa_message_id: waMessageId ?? null,
  });

  const { data: campaigns, error: campErr } = await supabase
    .from("chat_campaigns")
    .select("id, status")
    .eq("empresa_id", empresaId)
    .eq("channel_id", channelId)
    .neq("status", "cancelled");

  if (campErr || !campaigns?.length) {
    console.info(LOG_NONE, {
      empresa_id: empresaId,
      channel_id: channelId,
      reason: "no_campaigns_for_channel",
      wa_message_id: waMessageId ?? null,
    });
    return;
  }

  const campaignIds = (campaigns as { id: string }[]).map((c) => c.id);

  const { data: rows, error: rErr } = await supabase
    .from("chat_campaign_recipients")
    .select("id, campaign_id, status, first_reply_at, phone_e164, sent_at")
    .eq("empresa_id", empresaId)
    .in("campaign_id", campaignIds)
    .eq("status", "sent")
    .is("first_reply_at", null)
    .order("sent_at", { ascending: false })
    .limit(80);

  if (rErr || !rows?.length) {
    console.info(LOG_NONE, {
      empresa_id: empresaId,
      channel_id: channelId,
      reason: rErr?.message ?? "no_sent_recipients_pending_reply",
      wa_message_id: waMessageId ?? null,
    });
    return;
  }

  type Row = {
    id: string;
    campaign_id: string;
    phone_e164: string;
    sent_at: string | null;
  };

  let match: Row | undefined;
  for (const r of rows as unknown as Row[]) {
    const d = normalizeWaPhone(digitsInternational(r.phone_e164));
    if (d !== phoneDigits) continue;
    if (!r.sent_at) continue;
    const sentMs = Date.parse(r.sent_at);
    if (Number.isNaN(sentMs) || sentMs > inboundMs) continue;
    if (inboundMs - sentMs > lookbackMs) continue;
    match = r;
    break;
  }

  if (!match) {
    console.info(LOG_NONE, {
      empresa_id: empresaId,
      channel_id: channelId,
      contact_id: contactId,
      phone_masked: maskPhoneDigits(phoneDigits),
      reason: "no_recipient_match_phone_or_window",
      wa_message_id: waMessageId ?? null,
    });
    return;
  }

  console.info(LOG_MATCH, {
    empresa_id: empresaId,
    campaign_id: match.campaign_id,
    recipient_id: match.id,
    contact_id: contactId,
    phone_masked: maskPhoneDigits(phoneDigits),
    wa_message_id: waMessageId ?? null,
  });

  const { error: upErr } = await supabase
    .from("chat_campaign_recipients")
    .update({
      status: "replied",
      first_reply_at: inboundTs,
      updated_at: inboundTs,
    })
    .eq("id", match.id)
    .eq("empresa_id", empresaId)
    .is("first_reply_at", null);

  if (upErr) {
    console.warn("[campaign-inbound]", upErr.message);
    return;
  }

  await supabase.from("chat_campaign_events").insert({
    empresa_id: empresaId,
    campaign_id: match.campaign_id,
    recipient_id: match.id,
    event_type: "inbound_reply",
    event_payload_json: {
      contact_id: contactId,
      channel_id: channelId,
      inbound_at: inboundTs,
      reply_preview: (preview ?? "").slice(0, 80),
      wa_message_id: waMessageId ?? null,
    },
  });

  const { data: camp } = await supabase
    .from("chat_campaigns")
    .select("replied_count")
    .eq("id", match.campaign_id)
    .eq("empresa_id", empresaId)
    .maybeSingle();

  const rc = (camp as { replied_count?: number } | null)?.replied_count ?? 0;
  await supabase
    .from("chat_campaigns")
    .update({
      replied_count: rc + 1,
      updated_at: inboundTs,
    })
    .eq("id", match.campaign_id)
    .eq("empresa_id", empresaId);

  console.info(LOG_MARK, {
    empresa_id: empresaId,
    campaign_id: match.campaign_id,
    recipient_id: match.id,
    contact_id: contactId,
    phone_masked: maskPhoneDigits(phoneDigits),
    message_id: waMessageId ?? null,
    created_at: inboundTs,
  });
}
