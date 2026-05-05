import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getChatServiceClientForEmpresa } from "@/lib/supabase/chat-service-role-empresa";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const dynamic = "force-dynamic";

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Resuelve el número E.164 (solo dígitos) para wa.me usando `chat_channels` en el
 * schema de la empresa. Debe usarse con `getChatServiceClientForEmpresa` (PG shim
 * en tenants no expuestos en PostgREST), nunca con `db.schema` directo a erp_*.
 */
async function resolveRedirectPhoneForEmpresa(
  supabase: AppSupabaseClient,
  empresaId: string
): Promise<{ ok: true; phone: string } | { ok: false; message: string }> {
  const envPhone = digitsOnly(
    process.env.WHATSAPP_LINK_PHONE_NUMBER?.trim() ||
      process.env.NEXT_PUBLIC_WHATSAPP_LINK_PHONE_NUMBER?.trim() ||
      ""
  );

  const { data: channels, error: chErr } = await supabase
    .from("chat_channels")
    .select("id, activo, config, provider_channel_id")
    .eq("empresa_id", empresaId)
    .eq("type", "whatsapp")
    .eq("activo", true);

  if (chErr) {
    console.error("[sorteo-r] chat_channels query:", chErr.message);
    return {
      ok: false,
      message: "No se pudo consultar la configuración del canal. Intentá más tarde.",
    };
  }

  const numbers = new Set<string>();
  for (const ch of channels ?? []) {
    const row = ch as { config?: unknown; provider_channel_id?: string | null };
    const cfg = row.config;
    if (cfg && typeof cfg === "object" && !Array.isArray(cfg)) {
      const c = cfg as Record<string, unknown>;
      for (const key of ["display_phone_number", "ycloud_sender_id"] as const) {
        const raw = c[key];
        if (typeof raw !== "string") continue;
        const d = digitsOnly(raw);
        if (d.length >= 8) numbers.add(d);
      }
    }
    if (typeof row.provider_channel_id === "string" && row.provider_channel_id.trim()) {
      const d = digitsOnly(row.provider_channel_id);
      if (d.length >= 8) numbers.add(d);
    }
  }

  if (numbers.size === 0) {
    return {
      ok: false,
      message: "Este sorteo aún no tiene un canal WhatsApp configurado.",
    };
  }

  if (envPhone) {
    if (!numbers.has(envPhone)) {
      return {
        ok: false,
        message:
          "La configuración del enlace de WhatsApp no coincide con los canales activos de la empresa.",
      };
    }
    return { ok: true, phone: envPhone };
  }

  if (numbers.size === 1) {
    return { ok: true, phone: [...numbers][0] };
  }

  return {
    ok: false,
    message:
      "Hay varios canales WhatsApp activos. El administrador debe definir cuál usar para los enlaces públicos.",
  };
}

function buildWhatsAppPrefill(params: {
  token: string;
  codigoReferido: string;
  nombreSorteo: string | null;
}): string {
  const nombre = params.nombreSorteo?.trim() || "el sorteo";
  return [
    `Hola, quiero comprar números para el sorteo ${nombre}.`,
    `Código revendedor: ${params.codigoReferido}.`,
    `ref=${params.token}`,
  ].join(" ");
}

/**
 * Landing pública: registra click + token opaco y redirige a WhatsApp.
 * URL oficial: /r/{codigo}?sorteo={uuid}
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ codigo: string }> }
) {
  const { codigo: codigoRaw } = await context.params;
  const codigo = decodeURIComponent(codigoRaw ?? "").trim();
  const sorteoId = request.nextUrl.searchParams.get("sorteo")?.trim() ?? "";
  if (!codigo || !sorteoId) {
    return new NextResponse("Falta código en la ruta o sorteo en ?sorteo=uuid", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let catalog;
  try {
    catalog = createServiceRoleClient();
  } catch {
    return new NextResponse("Servidor sin credenciales Supabase (service role).", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const { data: resolved, error: rpcErr } = await catalog.rpc("neura_resolve_sorteo_revendedor_public", {
    p_sorteo_id: sorteoId,
    p_codigo: codigo,
  });

  type ResolvedRow = { empresa_id?: string; data_schema?: string; revendedor_id?: string };
  type RevRow = {
    id: string;
    empresa_id: string;
    sorteo_id: string;
    codigo_referido: string;
    activo: boolean;
  };
  const hit = (resolved as ResolvedRow | null) ?? null;

  let row: RevRow | null = null;

  if (!rpcErr && hit?.empresa_id && hit?.revendedor_id) {
    row = {
      id: hit.revendedor_id,
      empresa_id: hit.empresa_id,
      sorteo_id: sorteoId,
      codigo_referido: codigo,
      activo: true,
    };
  } else {
    if (rpcErr) {
      console.warn("[sorteo-r] neura_resolve_sorteo_revendedor_public:", rpcErr.message);
    }
    const { data: rev, error: rErr } = await catalog
      .from("sorteo_revendedores")
      .select("id, empresa_id, sorteo_id, codigo_referido, activo")
      .eq("sorteo_id", sorteoId)
      .ilike("codigo_referido", codigo)
      .eq("activo", true)
      .maybeSingle();

    if (rErr || !rev) {
      return new NextResponse("Link de revendedor no válido.", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    row = rev as RevRow;
  }

  if (!row) {
    return new NextResponse("Link de revendedor no válido.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  let dataSb: AppSupabaseClient;
  try {
    dataSb = await getChatServiceClientForEmpresa(row.empresa_id);
  } catch (e) {
    console.error("[sorteo-r] getChatServiceClientForEmpresa:", e);
    return new NextResponse("No se pudo preparar la redirección. Intentá más tarde.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const { data: sorteoRow, error: sorteoErr } = await dataSb
    .from("sorteos")
    .select("id, nombre")
    .eq("id", row.sorteo_id)
    .eq("empresa_id", row.empresa_id)
    .maybeSingle();

  if (sorteoErr) {
    console.error("[sorteo-r] sorteos:", sorteoErr.message);
    return new NextResponse("No se pudo verificar el sorteo. Intentá más tarde.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  if (!sorteoRow) {
    return new NextResponse("El sorteo no existe o no está disponible.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const nombreSorteo =
    typeof (sorteoRow as { nombre?: unknown }).nombre === "string"
      ? (sorteoRow as { nombre: string }).nombre.trim() || null
      : null;

  const redirectPhoneResult = await resolveRedirectPhoneForEmpresa(dataSb, row.empresa_id);
  if (!redirectPhoneResult.ok) {
    return new NextResponse(redirectPhoneResult.message, {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const token = randomBytes(18).toString("base64url");
  const ua = request.headers.get("user-agent") ?? "";
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "";
  const ipHash = ip ? createHash("sha256").update(ip).digest("hex").slice(0, 32) : null;

  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insErr } = await dataSb.from("sorteo_revendedor_clicks").insert({
    empresa_id: row.empresa_id,
    sorteo_id: row.sorteo_id,
    revendedor_id: row.id,
    attribution_token: token,
    user_agent: ua.slice(0, 512),
    ip_hash: ipHash,
    expires_at: expires,
  });

  if (insErr) {
    console.error("[sorteo-r] sorteo_revendedor_clicks:", insErr.message);
    return new NextResponse("No se pudo registrar el click.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const text = buildWhatsAppPrefill({
    token,
    codigoReferido: row.codigo_referido,
    nombreSorteo,
  });
  const waUrl = `https://wa.me/${redirectPhoneResult.phone}?text=${encodeURIComponent(text)}`;
  return NextResponse.redirect(waUrl, 302);
}
