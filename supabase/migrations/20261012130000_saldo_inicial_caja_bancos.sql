-- =============================================================================
-- Saldo inicial de caja y bancos — INSTANCIA DEDICADA SAN ANTONIO.
--
-- Guarda el saldo de efectivo (caja) y, opcionalmente, saldos por entidad
-- bancaria, vigentes a la fecha de corte. Apunta EXCLUSIVAMENTE al schema
-- `sanantonio` (BD compartida: no toca otros proyectos).
--
-- La cuenta por cobrar inicial NO se guarda acá: se representa cargando las
-- facturas abiertas como documentos históricos (es_historico=true).
--
-- Aditiva, idempotente. NO modifica datos existentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sanantonio.empresa_saldo_inicial (
  empresa_id     uuid PRIMARY KEY,
  fecha_corte    date NOT NULL,
  caja_inicial   numeric NOT NULL DEFAULT 0,
  -- [{ entidad_bancaria_id, nombre, saldo }]
  bancos         jsonb NOT NULL DEFAULT '[]'::jsonb,
  observaciones  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
