import { createTenantPgChatSupabaseShim } from "@/lib/chat/tenant-pg-chat-supabase-shim";
import {
  createServiceRoleClientForEmpresa,
  fetchDataSchemaForEmpresaId,
} from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

const LOG = "[chat-service-client]";

/**
 * Service role sobre el esquema de datos de chat de la empresa (zentra_erp o `data_schema`).
 * Para `erp_*` / `er_*` no expuestos en PostgREST: mismo shim Postgres que webhooks WhatsApp.
 */
export async function getChatServiceClientForEmpresa(empresaId: string): Promise<AppSupabaseClient> {
  const schema = await fetchDataSchemaForEmpresaId(empresaId);
  const pool = getChatPostgresPool();
  if (pool && isLikelyUnexposedTenantChatSchema(schema)) {
    const catalog = createServiceRoleClient();
    console.info(LOG, "modo", "postgres_shim", { empresa_id: empresaId, data_schema: schema });
    return createTenantPgChatSupabaseShim({
      pool,
      schema,
      storageDelegate: catalog,
      rpcDelegate: catalog as AppSupabaseClient,
    }) as unknown as AppSupabaseClient;
  }
  return createServiceRoleClientForEmpresa(empresaId);
}
