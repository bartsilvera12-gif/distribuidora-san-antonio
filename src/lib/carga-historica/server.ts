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

/** Crea/actualiza la configuración de corte de la empresa. */
export async function upsertCargaHistoricaConfig(
  schemaRaw: string,
  empresaId: string,
  cfg: { fechaCorte: string; habilitada: boolean }
): Promise<void> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "empresa_carga_historica");
  await pool.query(
    `INSERT INTO ${t} (empresa_id, fecha_corte, habilitada, updated_at)
     VALUES ($1::uuid, $2::date, $3::boolean, now())
     ON CONFLICT (empresa_id) DO UPDATE
       SET fecha_corte = EXCLUDED.fecha_corte,
           habilitada  = EXCLUDED.habilitada,
           cerrada_at  = CASE WHEN EXCLUDED.habilitada THEN NULL ELSE now() END,
           updated_at  = now()`,
    [empresaId, cfg.fechaCorte, cfg.habilitada]
  );
}

export interface SaldoInicial {
  fechaCorte: string | null;
  cajaInicial: number;
  bancos: Array<{ entidad_bancaria_id?: string | null; nombre: string; saldo: number }>;
  observaciones: string | null;
}

const SALDO_VACIO: SaldoInicial = { fechaCorte: null, cajaInicial: 0, bancos: [], observaciones: null };

export async function getSaldoInicial(schemaRaw: string, empresaId: string): Promise<SaldoInicial> {
  const pool = getChatPostgresPool();
  if (!pool) return SALDO_VACIO;
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "empresa_saldo_inicial");
  try {
    const { rows } = await pool.query<{
      fecha_corte: string; caja_inicial: string | number; bancos: unknown; observaciones: string | null;
    }>(
      `SELECT fecha_corte::text AS fecha_corte, caja_inicial, bancos, observaciones
         FROM ${t} WHERE empresa_id = $1::uuid LIMIT 1`,
      [empresaId]
    );
    const row = rows[0];
    if (!row) return SALDO_VACIO;
    return {
      fechaCorte: row.fecha_corte ? String(row.fecha_corte).slice(0, 10) : null,
      cajaInicial: Number(row.caja_inicial) || 0,
      bancos: Array.isArray(row.bancos) ? (row.bancos as SaldoInicial["bancos"]) : [],
      observaciones: row.observaciones ?? null,
    };
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code && code !== "42P01") {
      console.error("[carga-historica] getSaldoInicial:", (e as Error)?.message, code);
    }
    return SALDO_VACIO;
  }
}

export async function upsertSaldoInicial(
  schemaRaw: string,
  empresaId: string,
  s: { fechaCorte: string; cajaInicial: number; bancos: SaldoInicial["bancos"]; observaciones?: string | null }
): Promise<void> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "empresa_saldo_inicial");
  await pool.query(
    `INSERT INTO ${t} (empresa_id, fecha_corte, caja_inicial, bancos, observaciones, updated_at)
     VALUES ($1::uuid, $2::date, $3::numeric, $4::jsonb, $5, now())
     ON CONFLICT (empresa_id) DO UPDATE
       SET fecha_corte = EXCLUDED.fecha_corte,
           caja_inicial = EXCLUDED.caja_inicial,
           bancos = EXCLUDED.bancos,
           observaciones = EXCLUDED.observaciones,
           updated_at = now()`,
    [empresaId, s.fechaCorte, s.cajaInicial, JSON.stringify(s.bancos ?? []), s.observaciones ?? null]
  );
}
