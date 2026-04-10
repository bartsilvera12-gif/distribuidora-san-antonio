import { NextRequest, NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { getAuthWithRol } from "@/lib/middleware/auth";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ flowCode: string }> }
) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const params = await context.params;
    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const { data, error } = await supabase
      .from("chat_flows")
      .select(
        "flow_code, label, channel, activo, sorteo_id, sorteo_datos_incompletos_message, updated_at, sorteos(nombre)"
      )
      .eq("empresa_id", auth.empresa_id)
      .eq("flow_code", params.flowCode)
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Flow no encontrado" }, { status: 404 });

    const join = data.sorteos as { nombre?: string } | { nombre?: string }[] | null | undefined;
    const sorteoNombre =
      join && !Array.isArray(join) ? join.nombre : Array.isArray(join) && join[0] ? join[0].nombre : null;

    return NextResponse.json({
      ok: true,
      item: {
        flow_code: data.flow_code,
        label: data.label,
        channel: data.channel,
        activo: data.activo !== false,
        sorteo_id: (data.sorteo_id as string | null) ?? null,
        sorteo_nombre: sorteoNombre ?? null,
        sorteo_datos_incompletos_message:
          (data as { sorteo_datos_incompletos_message?: string | null })
            .sorteo_datos_incompletos_message ?? null,
        updated_at: data.updated_at,
      },
    });
  } catch (e) {
    console.error("[api/chat/flows/:flowCode][GET]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ flowCode: string }> }
) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const params = await context.params;
    const flowCode = params.flowCode;
    const body = (await request.json().catch(() => ({}))) as {
      label?: string;
      channel?: string;
      activo?: boolean;
      /** UUID del sorteo: al enviar comprobante por WhatsApp se crea orden + cupones (si el módulo está activo). */
      sorteo_id?: string | null;
    };
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.label === "string") patch.label = body.label.trim();
    if (typeof body.channel === "string") patch.channel = body.channel.trim() || "whatsapp";
    if (typeof body.activo === "boolean") patch.activo = body.activo;
    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);

    if ("sorteo_id" in body) {
      if (body.sorteo_id === null || body.sorteo_id === "") {
        patch.sorteo_id = null;
      } else if (typeof body.sorteo_id === "string") {
        const sid = body.sorteo_id.trim();
        const { data: sorteoOk, error: se } = await supabase
          .from("sorteos")
          .select("id")
          .eq("empresa_id", auth.empresa_id)
          .eq("id", sid)
          .maybeSingle();
        if (se || !sorteoOk) {
          return NextResponse.json(
            { ok: false, error: "sorteo_id inválido o no pertenece a la empresa" },
            { status: 400 }
          );
        }
        patch.sorteo_id = sid;
      }
    }
    if ("sorteo_datos_incompletos_message" in body) {
      if (body.sorteo_datos_incompletos_message === null) {
        patch.sorteo_datos_incompletos_message = null;
      } else if (typeof body.sorteo_datos_incompletos_message === "string") {
        const t = body.sorteo_datos_incompletos_message.trim();
        patch.sorteo_datos_incompletos_message = t.length ? t.slice(0, 4000) : null;
      }
    }
    const { data, error } = await supabase
      .from("chat_flows")
      .update(patch)
      .eq("empresa_id", auth.empresa_id)
      .eq("flow_code", flowCode)
      .select(
        "flow_code, label, channel, activo, sorteo_id, sorteo_datos_incompletos_message, updated_at, sorteos(nombre)"
      )
      .maybeSingle();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    if (!data) return NextResponse.json({ ok: false, error: "Flow no encontrado" }, { status: 404 });
    const join = data.sorteos as { nombre?: string } | { nombre?: string }[] | null | undefined;
    const sorteoNombre =
      join && !Array.isArray(join) ? join.nombre : Array.isArray(join) && join[0] ? join[0].nombre : null;
    return NextResponse.json({
      ok: true,
      item: {
        flow_code: data.flow_code,
        label: data.label,
        channel: data.channel,
        activo: data.activo !== false,
        sorteo_id: (data.sorteo_id as string | null) ?? null,
        sorteo_nombre: sorteoNombre ?? null,
        sorteo_datos_incompletos_message:
          (data as { sorteo_datos_incompletos_message?: string | null })
            .sorteo_datos_incompletos_message ?? null,
        updated_at: data.updated_at,
      },
    });
  } catch (e) {
    console.error("[api/chat/flows/:flowCode][PATCH]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
