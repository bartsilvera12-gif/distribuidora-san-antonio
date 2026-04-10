import { NextRequest, NextResponse } from "next/server";
import { getUserAndEmpresa } from "@/lib/middleware/auth";
import { errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { handleSifenEnviarPost } from "@/lib/sifen/handle-sifen-enviar-post";

/**
 * POST /api/facturas/[id]/sifen/enviar
 * Envía el XML firmado a SIFEN según `empresa_sifen_config.ambiente` (test | producción).
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await getUserAndEmpresa(request);
  if (!auth) {
    return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
  }
  try {
    return await handleSifenEnviarPost(request, ctx.params, auth, { soloAmbienteTest: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
