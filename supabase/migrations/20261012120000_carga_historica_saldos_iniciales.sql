-- =============================================================================
-- Carga histórica + saldos iniciales (Opción A).
--
-- Agrega, de forma ADITIVA e IDEMPOTENTE, la infraestructura para:
--   1) empresa_carga_historica: fecha de corte + flag que habilita/cierra el
--      período de carga histórica por empresa.
--   2) columna es_historico en las tablas operativas, para distinguir lo
--      cargado "para reportes" de lo que mueve stock/caja en vivo y para poder
--      excluir documentos históricos del flujo de facturación electrónica.
--   3) facturas.numero_interno: numeración NO fiscal para documentos históricos
--      (no consume el correlativo de next_numero_factura_empresa / SIFEN).
--
-- NO modifica datos existentes. NO altera columnas actuales. NO toca SIFEN.
-- Multi-schema (public, zentra_erp, er_<hex>, erp_*), mismo patrón que las
-- migraciones previas del repositorio.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'compras'  -- presente en cada schema con el ERP operativo
      AND c.relkind = 'r'
      AND (
        n.nspname IN ('public', 'zentra_erp')
        OR n.nspname ~ '^er_[0-9a-f]{32}$'
        OR n.nspname LIKE 'erp\_%' ESCAPE '\'
      )
  LOOP
    RAISE NOTICE '[carga_historica] schema=%', r.sch;

    -- ── 1) empresa_carga_historica (singleton por empresa) ──────────────────
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS %I.empresa_carga_historica (
        empresa_id   uuid PRIMARY KEY
                      REFERENCES zentra_erp.empresas(id) ON DELETE CASCADE,
        fecha_corte  date NOT NULL,
        habilitada   boolean NOT NULL DEFAULT true,
        cerrada_at   timestamptz,
        created_at   timestamptz NOT NULL DEFAULT now(),
        updated_at   timestamptz NOT NULL DEFAULT now()
      )
    $f$, r.sch);

    -- ── 2) columna es_historico en tablas operativas ───────────────────────
    --   ventas, compras, movimientos_inventario, facturas, gastos, pagos
    EXECUTE format(
      'ALTER TABLE %I.ventas                 ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false',
      r.sch
    );
    EXECUTE format(
      'ALTER TABLE %I.compras                ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false',
      r.sch
    );
    EXECUTE format(
      'ALTER TABLE %I.movimientos_inventario ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false',
      r.sch
    );

    -- facturas / gastos / pagos pueden no existir en algún schema parcial: guardado por bloque.
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.facturas ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false',
        r.sch
      );
      -- numeración interna NO fiscal para históricos (no consume correlativo SIFEN)
      EXECUTE format(
        'ALTER TABLE %I.facturas ADD COLUMN IF NOT EXISTS numero_interno text',
        r.sch
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '[carga_historica] sin tabla facturas en %', r.sch;
    END;

    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.gastos ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false',
        r.sch
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '[carga_historica] sin tabla gastos en %', r.sch;
    END;

    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.pagos ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false',
        r.sch
      );
    EXCEPTION WHEN undefined_table THEN
      RAISE NOTICE '[carga_historica] sin tabla pagos en %', r.sch;
    END;

    -- ── 3) índices de apoyo (filtrar/excluir históricos rápido) ─────────────
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_ventas_es_historico  ON %I.ventas  (empresa_id, es_historico)',  r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_compras_es_historico ON %I.compras (empresa_id, es_historico)', r.sch);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_movinv_es_historico  ON %I.movimientos_inventario (empresa_id, es_historico)', r.sch);
    BEGIN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_facturas_es_historico ON %I.facturas (empresa_id, es_historico)', r.sch);
    EXCEPTION WHEN undefined_table THEN NULL;
    END;

  END LOOP;
END;
$$;
