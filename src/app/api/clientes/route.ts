import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { emitEvent, EVENT_TYPES } from "@/lib/integrations/events";
import type { TipoServicioCliente } from "@/lib/clientes/types";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase no configurado");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const TIPOS_SERVICIO_VALIDOS: TipoServicioCliente[] = ["marketing", "saas", "branding", "web", "otro"];

export async function GET() {
  try {
    const auth = await getAuthWithRol();
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("empresa_id", auth.empresa_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol();
    if (!auth) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }

    const body = await request.json();
    const { tipo_cliente, empresa, nombre_contacto, ruc, documento, telefono, email, direccion, ciudad, pais, condicion_pago, moneda_preferida, estado, tipo_servicio_cliente } = body;

    if (!nombre_contacto?.trim()) {
      return NextResponse.json(errorResponse("nombre_contacto es obligatorio"), { status: 400 });
    }

    const tipoServicio = tipo_servicio_cliente?.trim();
    if (tipoServicio && !TIPOS_SERVICIO_VALIDOS.includes(tipoServicio)) {
      return NextResponse.json(errorResponse(`tipo_servicio_cliente debe ser uno de: ${TIPOS_SERVICIO_VALIDOS.join(", ")}`), { status: 400 });
    }

    const insert = {
      empresa_id:           auth.empresa_id,
      created_by_user_id:    auth.user.id,
      created_by_nombre:     auth.nombre ?? null,
      tipo_cliente:         tipo_cliente ?? "empresa",
      tipo_servicio_cliente: tipoServicio || null,
      empresa:              empresa?.trim() || null,
      nombre:               nombre_contacto.trim(),
      nombre_contacto:      nombre_contacto.trim(),
      ruc:                  ruc?.trim() || null,
      documento:            documento?.trim() || null,
      telefono:             telefono?.trim() || null,
      email:                email?.trim() || null,
      direccion:            direccion?.trim() || null,
      ciudad:               ciudad?.trim() || null,
      pais:                 pais?.trim() || null,
      condicion_pago:       condicion_pago?.trim() || null,
      moneda_preferida:     moneda_preferida === "USD" ? "USD" : "GS",
      estado:               estado === "inactivo" ? "inactivo" : "activo",
    };

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("clientes")
      .insert([insert])
      .select()
      .single();

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    await emitEvent(EVENT_TYPES.cliente_creado, { cliente_id: data.id, empresa: data.empresa });

    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
