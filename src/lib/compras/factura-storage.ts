/**
 * Storage helpers para facturas de compra (proveedor).
 *
 * Bucket: `compras-facturas` (privado).
 * Path:   `{empresa_id}/compras/{compra_id}/factura-{timestamp}.{ext}`
 *
 * Aislamiento por tenant: el primer segmento del path es `empresa_id` y los
 * endpoints validan el `empresa_id` del usuario antes de leer/escribir.
 * Acepta imágenes y PDF. Nunca se guarda la URL firmada en DB — solo bucket/path.
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export const COMPRAS_FACTURAS_BUCKET = "compras-facturas";

export const ALLOWED_FACTURA_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
export const ALLOWED_FACTURA_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
export const MAX_FACTURA_BYTES = 10 * 1024 * 1024; // 10 MB

let bucketEnsured = false;

/**
 * Crea el bucket privado `compras-facturas` si no existe. Idempotente.
 * Cachea el flag en memoria del proceso para no llamar getBucket en cada request.
 * Requiere un cliente con service role (las operaciones de storage usan esa key).
 */
export async function ensureComprasFacturasBucket(supabase: AppSupabaseClient): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data: existing } = await supabase.storage.getBucket(COMPRAS_FACTURAS_BUCKET);
    if (existing) {
      bucketEnsured = true;
      return;
    }
  } catch {
    // fallthrough — intentar crear
  }
  const { error: createErr } = await supabase.storage.createBucket(COMPRAS_FACTURAS_BUCKET, {
    public: false,
    fileSizeLimit: MAX_FACTURA_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  });
  if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
    throw new Error(`No se pudo crear el bucket: ${createErr.message}`);
  }
  bucketEnsured = true;
}

/**
 * Construye el path del archivo. `timestamp` (Date.now()) se pasa desde el
 * handler para evitar colisiones y permitir reemplazo sin pisar el anterior.
 */
export function buildFacturaPath(
  empresaId: string,
  compraId: string,
  mime: string,
  timestamp: number
): string {
  const ext = ALLOWED_FACTURA_EXT[mime] ?? "bin";
  return `${empresaId}/compras/${compraId}/factura-${timestamp}.${ext}`;
}

/**
 * Genera URL firmada temporal para ver/descargar la factura. TTL por defecto 1h.
 * Devuelve null si el path es inválido o si falla. NUNCA se persiste en DB.
 */
export async function signFacturaCompra(
  supabase: AppSupabaseClient,
  bucket: string | null | undefined,
  facturaPath: string | null | undefined,
  ttlSeconds = 3600
): Promise<string | null> {
  if (!facturaPath) return null;
  const b = bucket || COMPRAS_FACTURAS_BUCKET;
  try {
    const { data, error } = await supabase.storage.from(b).createSignedUrl(facturaPath, ttlSeconds);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Valida que el path pertenezca a la empresa indicada (primer segmento).
 * Previene cross-tenant en operaciones que reciben paths arbitrarios.
 */
export function facturaPathBelongsToEmpresa(path: string | null | undefined, empresaId: string): boolean {
  if (!path) return false;
  return path.split("/")[0] === empresaId;
}
