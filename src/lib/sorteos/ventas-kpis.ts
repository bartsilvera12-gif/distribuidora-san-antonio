"use server";

import {
  createSupabaseServerClient,
  createSupabaseServerClientWithDbSchema,
} from "@/lib/supabase/server";
import { resolveEmpresaDataSchema } from "@/lib/supabase/schema";
import { asuncionDayBoundsUtc, asuncionMonthBoundsUtc } from "@/lib/sorteos/kpis-time-bounds";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema, isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";

/**
 * KPIs de ventas de sorteos (página principal).
 *
 * Tabla: `sorteo_entradas` en el schema de datos de la empresa (`data_schema` o plantilla legada).
 * Criterio de fecha: created_at (momento en que se registró la orden en el ERP).
 * Boletos: suma de cantidad_boletos (excluye filas con estado_pago = 'rechazado').
 * Monto: suma de monto_total en la misma moneda de la fila (PYG), mismo filtro de estado.
 * Ventana calendario: día y mes en zona America/Asuncion (Paraguay).
 */
export type SorteosVentasKpis = {
  boletosHoy: number;
  boletosMes: number;
  montoHoy: number;
  montoMes: number;
};

function sumRows(
  rows: Array<{ cantidad_boletos?: number | null; monto_total?: number | string | null; estado_pago?: string | null }>
): { boletos: number; monto: number } {
  let boletos = 0;
  let monto = 0;
  for (const r of rows) {
    if ((r.estado_pago ?? "").trim() === "rechazado") continue;
    boletos += Number(r.cantidad_boletos) || 0;
    monto += Number(r.monto_total) || 0;
  }
  return { boletos, monto };
}

export async function getSorteosVentasKpis(): Promise<SorteosVentasKpis> {
  const catalog = await createSupabaseServerClient();
  const {
    data: { user },
  } = await catalog.auth.getUser();
  if (!user?.email) {
    return { boletosHoy: 0, boletosMes: 0, montoHoy: 0, montoMes: 0 };
  }

  const { data: urows, error: uErr } = await catalog
    .from("usuarios")
    .select("empresa_id")
    .eq("email", user.email)
    .limit(1);

  const usuario = urows?.[0] as { empresa_id?: string } | undefined;
  if (uErr || !usuario?.empresa_id) {
    return { boletosHoy: 0, boletosMes: 0, montoHoy: 0, montoMes: 0 };
  }

  const empresaId = usuario.empresa_id as string;

  const { data: emp } = await catalog
    .from("empresas")
    .select("data_schema")
    .eq("id", empresaId)
    .maybeSingle();
  const schema = resolveEmpresaDataSchema((emp as { data_schema?: string | null } | null)?.data_schema);

  const day = asuncionDayBoundsUtc();
  const month = asuncionMonthBoundsUtc();

  const pool = getChatPostgresPool();
  if (pool && isLikelyUnexposedTenantChatSchema(schema)) {
    const sch = assertAllowedChatDataSchema(schema);
    const tsql = quoteSchemaTable(sch, "sorteo_entradas");
    try {
      const [dayR, monthR] = await Promise.all([
        pool.query(
          `SELECT cantidad_boletos, monto_total, estado_pago FROM ${tsql}
           WHERE empresa_id = $1::uuid AND created_at >= $2::timestamptz AND created_at <= $3::timestamptz`,
          [empresaId, day.start, day.end]
        ),
        pool.query(
          `SELECT cantidad_boletos, monto_total, estado_pago FROM ${tsql}
           WHERE empresa_id = $1::uuid AND created_at >= $2::timestamptz AND created_at <= $3::timestamptz`,
          [empresaId, month.start, month.end]
        ),
      ]);
      const sD = sumRows((dayR.rows ?? []) as Parameters<typeof sumRows>[0]);
      const sM = sumRows((monthR.rows ?? []) as Parameters<typeof sumRows>[0]);
      console.info("[sorteos][kpis]", {
        empresa_id: empresaId,
        data_schema: schema,
        modo: "postgres_directo",
      });
      return {
        boletosHoy: sD.boletos,
        montoHoy: sD.monto,
        boletosMes: sM.boletos,
        montoMes: sM.monto,
      };
    } catch (e) {
      console.error("[sorteos][kpis]", "pg_error", e instanceof Error ? e.message : e);
    }
  }

  const supabase = await createSupabaseServerClientWithDbSchema(schema);

  const [dayRes, monthRes] = await Promise.all([
    supabase
      .from("sorteo_entradas")
      .select("cantidad_boletos, monto_total, estado_pago")
      .eq("empresa_id", empresaId)
      .gte("created_at", day.start)
      .lte("created_at", day.end),
    supabase
      .from("sorteo_entradas")
      .select("cantidad_boletos, monto_total, estado_pago")
      .eq("empresa_id", empresaId)
      .gte("created_at", month.start)
      .lte("created_at", month.end),
  ]);

  if (dayRes.error) throw new Error(dayRes.error.message);
  if (monthRes.error) throw new Error(monthRes.error.message);

  const sD = sumRows(dayRes.data ?? []);
  const sM = sumRows(monthRes.data ?? []);

  return {
    boletosHoy: sD.boletos,
    montoHoy: sD.monto,
    boletosMes: sM.boletos,
    montoMes: sM.monto,
  };
}
