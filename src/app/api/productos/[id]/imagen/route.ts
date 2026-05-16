import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  PRODUCTOS_IMAGENES_BUCKET,
  buildProductoImagenPath,
  ensureProductosImagenesBucket,
  pathBelongsToEmpresa,
  signProductoImagen,
} from "@/lib/inventario/imagen-storage";

/**
 * GET: devuelve signed URL fresca (TTL 1h) si el producto tiene imagen.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const prodRes = await supabase
      .from("productos")
      .select("id, empresa_id, imagen_path")
      .eq("id", productoId)
      .maybeSingle();
    const prod = prodRes.data as { id: string; empresa_id: string; imagen_path: string | null } | null;
    if (!prod || prod.empresa_id !== empresaId) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }
    const signed = prod.imagen_path
      ? await signProductoImagen(supabase, prod.imagen_path, 3600)
      : null;
    return NextResponse.json(successResponse({ imagen_path: prod.imagen_path, imagen_url: signed }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * Carga la imagen principal del producto.
 * Cross-tenant: valida que el producto pertenezca a la empresa del usuario.
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    // 1) Verificar ownership del producto
    const prodRes = await supabase
      .from("productos")
      .select("id, empresa_id, imagen_path")
      .eq("id", productoId)
      .maybeSingle();
    const prod = prodRes.data as { id: string; empresa_id: string; imagen_path: string | null } | null;
    if (!prod || prod.empresa_id !== empresaId) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    // 2) Leer archivo del form-data
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      return NextResponse.json(
        errorResponse("Formato no permitido. Usá JPG, PNG o WebP."),
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(
        errorResponse(`Imagen demasiado grande (máx. ${mb} MB).`),
        { status: 413 }
      );
    }

    // 3) Asegurar bucket
    await ensureProductosImagenesBucket(supabase);

    // 4) Borrar imagen anterior si existe (y pertenece a la empresa)
    if (prod.imagen_path && pathBelongsToEmpresa(prod.imagen_path, empresaId)) {
      await supabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([prod.imagen_path]);
    }

    // 5) Subir nuevo archivo
    const path = buildProductoImagenPath(empresaId, productoId, file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(PRODUCTOS_IMAGENES_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      return NextResponse.json(errorResponse(up.error.message), { status: 500 });
    }

    // 6) Persistir path en producto
    const upd = await supabase
      .from("productos")
      .update({ imagen_path: path, imagen_url: null })
      .eq("id", productoId)
      .eq("empresa_id", empresaId);
    if (upd.error) {
      return NextResponse.json(errorResponse(upd.error.message), { status: 500 });
    }

    // 7) Devolver signed URL para preview inmediato
    const signed = await signProductoImagen(supabase, path, 3600);
    return NextResponse.json(successResponse({ imagen_path: path, imagen_url: signed }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;

    const prodRes = await supabase
      .from("productos")
      .select("id, empresa_id, imagen_path")
      .eq("id", productoId)
      .maybeSingle();
    const prod = prodRes.data as { id: string; empresa_id: string; imagen_path: string | null } | null;
    if (!prod || prod.empresa_id !== empresaId) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    if (prod.imagen_path && pathBelongsToEmpresa(prod.imagen_path, empresaId)) {
      await supabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([prod.imagen_path]);
    }

    await supabase
      .from("productos")
      .update({ imagen_path: null, imagen_url: null })
      .eq("id", productoId)
      .eq("empresa_id", empresaId);

    return NextResponse.json(successResponse({ imagen_path: null, imagen_url: null }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
