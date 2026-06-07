/**
 * Inserta el detalle de pago (transferencia/tarjeta) de una venta en
 * `sanantonio.ventas_pagos_detalle` vía raw-PG (pool postgres, owner/BYPASSRLS).
 * Se relaciona con la venta por `venta_id` (sin FK dura).
 */
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export interface PagoDetalleInput {
  metodoPago: "transferencia" | "tarjeta";
  entidadBancariaId: string | null;
  bancoCodigo: string | null;
  bancoNombre: string | null;
  titular: string | null;
  monto: number;
  nroComprobante: string | null;
}

export async function insertVentaPagoDetalle(
  schemaRaw: string,
  empresaId: string,
  ventaId: string,
  d: PagoDetalleInput
): Promise<void> {
  const schema = assertAllowedChatDataSchema(schemaRaw);
  const t = quoteSchemaTable(schema, "ventas_pagos_detalle");
  const p = getChatPostgresPool();
  if (!p) throw new Error("Pool no disponible.");
  await p.query(
    `INSERT INTO ${t}
       (empresa_id, venta_id, metodo_pago, entidad_bancaria_id, banco_codigo, banco_nombre, titular, monto, nro_comprobante)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, $8, $9)`,
    [
      empresaId,
      ventaId,
      d.metodoPago,
      d.entidadBancariaId,
      d.bancoCodigo,
      d.bancoNombre,
      d.titular,
      d.monto,
      d.nroComprobante,
    ]
  );
}
