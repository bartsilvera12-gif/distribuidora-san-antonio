import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { handleSifenConsultaLotePost } from "@/lib/sifen/handle-sifen-consulta-lote-post";

/**
 * POST /api/facturas/[id]/sifen/consulta-lote
 * Consulta resultado de lote según ambiente en configuración SIFEN.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getUserAndEmpresa(request);
  if (!auth) {
    return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  }
  try {
    return await handleSifenConsultaLotePost(request, ctx.params, auth, { soloAmbienteTest: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
