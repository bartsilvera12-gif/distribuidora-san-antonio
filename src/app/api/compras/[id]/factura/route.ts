import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_FACTURA_MIME,
  MAX_FACTURA_BYTES,
  COMPRAS_FACTURAS_BUCKET,
  buildFacturaPath,
  ensureComprasFacturasBucket,
  facturaPathBelongsToEmpresa,
  signFacturaCompra,
} from "@/lib/compras/factura-storage";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Factura adjunta de una compra — Storage privado (`compras-facturas`) + PostgREST.
 * Mismo patrón que la imagen de producto (sin pool PG). Solo se persiste
 * bucket/path/metadata; la URL firmada se genera on-demand y NO se guarda.
 */

interface CompraFacturaRow {
  id: string;
  factura_bucket: string | null;
  factura_path: string | null;
  factura_nombre_original: string | null;
  factura_mime_type: string | null;
}

async function fetchCompra(
  sb: AppSupabaseClient,
  empresaId: string,
  compraId: string
): Promise<CompraFacturaRow | null> {
  const { data, error } = await sb
    .from("compras")
    .select("id, factura_bucket, factura_path, factura_nombre_original, factura_mime_type")
    .eq("empresa_id", empresaId)
    .eq("id", compraId)
    .maybeSingle();
  if (error) {
    console.error("[compras factura] fetchCompra", error.message);
    return null;
  }
  return (data as CompraFacturaRow | null) ?? null;
}

export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: compraId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });

    const compra = await fetchCompra(ctx.supabase, ctx.auth.empresa_id, compraId);
    if (!compra) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    const signed = compra.factura_path
      ? await signFacturaCompra(ctx.supabase, compra.factura_bucket, compra.factura_path, 3600)
      : null;
    return NextResponse.json(
      successResponse({
        factura_path: compra.factura_path,
        factura_url: signed,
        factura_nombre_original: compra.factura_nombre_original,
        factura_mime_type: compra.factura_mime_type,
      })
    );
  } catch (err) {
    console.error("[/api/compras/[id]/factura GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo obtener la factura."), { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: compraId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    // 1) Ownership
    const compra = await fetchCompra(supabase, empresaId, compraId);
    if (!compra) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });

    // 2) Archivo
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (!ALLOWED_FACTURA_MIME.has(file.type)) {
      return NextResponse.json(
        errorResponse("Formato no permitido. Usá JPG, PNG, WebP o PDF."),
        { status: 400 }
      );
    }
    if (file.size > MAX_FACTURA_BYTES) {
      const mb = (MAX_FACTURA_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(errorResponse(`Archivo demasiado grande (máx. ${mb} MB).`), { status: 413 });
    }

    // 3) Bucket idempotente (privado)
    try {
      await ensureComprasFacturasBucket(supabase);
    } catch (bucketErr) {
      console.error("[/api/compras/[id]/factura POST] ensureBucket", bucketErr instanceof Error ? bucketErr.message : bucketErr);
      // Continuar: si ya existe pero ensure falla por permisos, el upload puede andar igual.
    }

    // 4) Reemplazo: borrar la factura anterior si pertenece a la empresa (best-effort)
    if (compra.factura_path && facturaPathBelongsToEmpresa(compra.factura_path, empresaId)) {
      const prevBucket = compra.factura_bucket || COMPRAS_FACTURAS_BUCKET;
      await supabase.storage.from(prevBucket).remove([compra.factura_path]).catch(() => null);
    }

    // 5) Upload nuevo (path seguro por empresa/compra + timestamp)
    const path = buildFacturaPath(empresaId, compraId, file.type, Date.now());
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(COMPRAS_FACTURAS_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      console.error("[/api/compras/[id]/factura POST] upload", { empresaId, compraId, message: up.error.message });
      return NextResponse.json(errorResponse(`No se pudo subir la factura: ${up.error.message}`), { status: 500 });
    }

    // 6) Persistir metadata (bucket/path/nombre/mime). Sin URL firmada en DB.
    const nombreOriginal = (file.name || "factura").slice(0, 255);
    const upd = await supabase
      .from("compras")
      .update({
        factura_bucket: COMPRAS_FACTURAS_BUCKET,
        factura_path: path,
        factura_nombre_original: nombreOriginal,
        factura_mime_type: file.type,
      })
      .eq("empresa_id", empresaId)
      .eq("id", compraId)
      .select("id")
      .maybeSingle();
    if (upd.error) {
      console.error("[/api/compras/[id]/factura POST] update", upd.error.message);
      return NextResponse.json(errorResponse("No se pudo asociar la factura a la compra."), { status: 500 });
    }

    // 7) Signed URL para preview inmediato
    const signed = await signFacturaCompra(supabase, COMPRAS_FACTURAS_BUCKET, path, 3600);
    return NextResponse.json(
      successResponse({
        factura_path: path,
        factura_url: signed,
        factura_nombre_original: nombreOriginal,
        factura_mime_type: file.type,
      })
    );
  } catch (err) {
    console.error("[/api/compras/[id]/factura POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo subir la factura."), { status: 500 });
  }
}
