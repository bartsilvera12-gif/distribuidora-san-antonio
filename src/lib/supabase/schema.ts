import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Esquema Postgres de datos del ERP.
 *
 * Requiere en Supabase: Settings → API → "Exposed schemas" incluir `zentra_erp`
 * (además de lo que ya tengas para auth/storage).
 */
export const SUPABASE_APP_SCHEMA = "zentra_erp" as const;

/**
 * Cliente Supabase con cualquier esquema PostgREST (`zentra_erp`, `erp_*`, etc.).
 * El tercer genérico no puede ser solo `"public"` porque `createClient(..., { db: { schema } })`
 * infiere el nombre literal del schema y deja de asignarse a `SupabaseAdmin` en el build (p. ej. Vercel).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppSupabaseClient = SupabaseClient<any, "public", string, any, any>;

export const supabaseDbSchemaOption = {
  db: { schema: SUPABASE_APP_SCHEMA },
} as const;

/** Cliente service role estándar (API routes, webhooks, jobs). */
export const supabaseServiceRoleClientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  ...supabaseDbSchemaOption,
} as const;
