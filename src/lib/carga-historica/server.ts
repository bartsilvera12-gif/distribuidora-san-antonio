/**
 * Lectura server-side de la configuración de carga histórica por empresa
 * (tabla empresa_carga_historica, creada por la migración
 *  20261012120000_carga_historica_saldos_iniciales.sql).
 *
 * Si la tabla todavía no existe (migración no aplicada) o no hay fila para la
 * empresa, devuelve carga histórica DESHABILITADA — así, sin configurar, el
 * sistema mantiene el comportamiento actual (solo fecha de hoy).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export interface CargaHistoricaConfig {
  fechaCorte: string | null; // YYYY-MM-DD
  habilitada: boolean;
}

const DESHABILITADA: CargaHistoricaConfig = { fechaCorte: null, habilitada: false };

export async function getCargaHistoricaConfig(
  schemaRaw: string,
  empresaId: string
): Promise<CargaHistoricaConfig> {
  const pool = getChatPostgresPool();
  if (!pool) return DESHABILITADA;
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "empresa_carga_historica");
  try {
    const { rows } = await pool.query<{ fecha_corte: string; habilitada: boolean; cerrada_at: string | null }>(
      `SELECT fecha_corte::text AS fecha_corte, habilitada, cerrada_at
         FROM ${t}
        WHERE empresa_id = $1::uuid
        LIMIT 1`,
      [empresaId]
    );
    const row = rows[0];
    if (!row) return DESHABILITADA;
    return {
      fechaCorte: row.fecha_corte ? String(row.fecha_corte).slice(0, 10) : null,
      // "cerrada" (cerrada_at no nulo) deshabilita aunque el flag siga en true.
      habilitada: Boolean(row.habilitada) && !row.cerrada_at,
    };
  } catch (e) {
    // Tabla inexistente u otro error → tratar como deshabilitada (comportamiento actual).
    const code = (e as { code?: string })?.code;
    if (code && code !== "42P01") {
      console.error("[carga-historica] getCargaHistoricaConfig:", (e as Error)?.message, code);
    }
    return DESHABILITADA;
  }
}
