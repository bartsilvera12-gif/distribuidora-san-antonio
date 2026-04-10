import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { sendWhatsAppText } from "@/lib/chat/whatsapp-send-service";
import { normalizeWaPhone } from "@/lib/chat/whatsapp-webhook-service";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";

/**
 * POST /api/chat/send
 * Envía texto por WhatsApp y persiste mensaje saliente.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const conversationId =
      body && typeof body === "object" && typeof (body as { conversation_id?: string }).conversation_id === "string"
        ? (body as { conversation_id: string }).conversation_id
        : null;
    const message =
      body && typeof body === "object" && typeof (body as { message?: string }).message === "string"
        ? (body as { message: string }).message.trim()
        : "";
    const senderTypeInput =
      body && typeof body === "object" && typeof (body as { sender_type?: string }).sender_type === "string"
        ? (body as { sender_type: string }).sender_type
        : "human";
    const automationSource =
      body && typeof body === "object" && typeof (body as { automation_source?: string }).automation_source === "string"
        ? (body as { automation_source: string }).automation_source.trim()
        : "";
    const senderType: "human" | "ai" | "system" =
      senderTypeInput === "ai" || senderTypeInput === "system" ? senderTypeInput : "human";

    if (!conversationId || !message) {
      return NextResponse.json(
        { ok: false, error: "Se requiere conversation_id y message" },
        { status: 400 }
      );
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);

    const { data: conv, error: cErr } = await supabase
      .from("chat_conversations")
      .select("id, empresa_id, contact_id, channel_id")
      .eq("id", conversationId)
      .maybeSingle();

    if (cErr || !conv) {
      return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
    }

    if ((conv.empresa_id as string) !== auth.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    const { data: contact } = await supabase
      .from("chat_contacts")
      .select("phone_number")
      .eq("id", conv.contact_id as string)
      .maybeSingle();

    const { data: channel } = await supabase
      .from("chat_channels")
      .select("meta_phone_number_id, activo, whatsapp_access_token")
      .eq("id", conv.channel_id as string)
      .maybeSingle();

    if (channel && (channel as { activo?: boolean }).activo === false) {
      return NextResponse.json(
        { ok: false, error: "El canal WhatsApp está desactivado. Activalo en Configuración." },
        { status: 403 }
      );
    }

    const toDigits = contact?.phone_number ? normalizeWaPhone(contact.phone_number) : "";
    const phoneNumberId =
      (channel as { meta_phone_number_id?: string } | null)?.meta_phone_number_id ??
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();

    if (!toDigits || !phoneNumberId) {
      return NextResponse.json(
        { ok: false, error: "Falta teléfono del contacto o phone_number_id del canal" },
        { status: 400 }
      );
    }

    const rowToken =
      typeof (channel as { whatsapp_access_token?: string } | null)?.whatsapp_access_token ===
        "string"
        ? (channel as { whatsapp_access_token: string }).whatsapp_access_token.trim()
        : "";
    const token = rowToken || process.env.WHATSAPP_TOKEN?.trim();
    if (!token) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Falta token de Meta para enviar: configurá WHATSAPP_TOKEN en Vercel o el token del canal en Conversaciones → Configuración.",
        },
        { status: 500 }
      );
    }

    const sendResult = await sendWhatsAppText({
      toDigits,
      text: message,
      phoneNumberId,
      accessToken: token,
    });

    if (!sendResult.ok) {
      return NextResponse.json(
        { ok: false, error: sendResult.error, meta: sendResult.raw },
        { status: 502 }
      );
    }

    const empresaId = conv.empresa_id as string;
    const ts = new Date().toISOString();

    const { error: insErr } = await supabase.from("chat_messages").insert({
      empresa_id: empresaId,
      conversation_id: conversationId,
      wa_message_id: sendResult.waMessageId,
      from_me: true,
      sender_type: senderType,
      sent_by_user_id: senderType === "human" ? auth.user.id : null,
      sent_by_user_name: senderType === "human" ? auth.nombre ?? auth.user.email ?? null : null,
      automation_source: automationSource || (senderType === "ai" ? "automation" : null),
      message_type: "text",
      content: message,
      raw_payload: (sendResult.raw ?? {}) as Record<string, unknown>,
    });

    if (insErr) {
      return NextResponse.json(
        { ok: false, error: "Mensaje enviado pero no guardado: " + insErr.message },
        { status: 500 }
      );
    }

    await supabase
      .from("chat_conversations")
      .update({
        last_message_at: ts,
        last_message_preview: message.slice(0, 280),
        updated_at: ts,
      })
      .eq("id", conversationId);

    return NextResponse.json({
      ok: true,
      wa_message_id: sendResult.waMessageId,
    });
  } catch (e) {
    console.error("[api/chat/send]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
