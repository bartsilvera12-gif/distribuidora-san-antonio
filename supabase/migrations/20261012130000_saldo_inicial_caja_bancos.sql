-- =============================================================================
-- Saldo inicial de caja y bancos por empresa (a la fecha de corte).
--
-- Guarda el saldo de efectivo (caja) y, opcionalmente, saldos por entidad
-- bancaria, vigentes a la fecha de corte de la carga histórica. Es el punto de
-- partida "en vivo": las operaciones históricas (anteriores al corte) NO tocan
-- estos saldos (quedan como registro para reportes), evitando duplicaciones.
--
-- La cuenta por cobrar inicial NO se guarda acá: se representa cargando las
-- facturas abiertas como documentos históricos (es_historico=true) con su saldo
-- pendiente a la fecha de corte.
--
-- Aditiva, idempotente, multi-schema. NO modifica datos existentes.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'compras'
      AND c.relkind = 'r'
      AND (
        n.nspname IN ('public', 'zentra_erp')
        OR n.nspname ~ '^er_[0-9a-f]{32}$'
        OR n.nspname LIKE 'erp\_%' ESCAPE '\'
      )
  LOOP
    RAISE NOTICE '[saldo_inicial] schema=%', r.sch;

    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empresa_saldo_inicial (
        empresa_id     uuid PRIMARY KEY
                        REFERENCES zentra_erp.empresas(id) ON DELETE CASCADE,
        fecha_corte    date NOT NULL,
        caja_inicial   numeric NOT NULL DEFAULT 0,
        -- [{ entidad_bancaria_id, nombre, saldo }]
        bancos         jsonb NOT NULL DEFAULT '[]'::jsonb,
        observaciones  text,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch);

  END LOOP;
END;
$$;
