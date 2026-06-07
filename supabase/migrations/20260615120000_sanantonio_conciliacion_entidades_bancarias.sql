-- ============================================================================
--  Conciliación entre cuentas — Entidades bancarias + detalle de pago de ventas
--  Cliente: Distribuidora San Antonio (instancia monocliente). Schema: sanantonio.
--  Tipo: ADITIVO e IDEMPOTENTE. NO borra ni modifica datos existentes.
--        NO toca la tabla `ventas` (no requiere ALTER de tabla ajena).
--
--  Qué crea:
--   1) sanantonio.entidades_bancarias — catálogo de bancos/financieras/billeteras
--      (codigo opcional + nombre). Se precarga una lista base de Paraguay; el
--      dueño ajusta los códigos de pago desde Configuración → Entidades bancarias.
--   2) sanantonio.ventas_pagos_detalle — datos de la transferencia/tarjeta que se
--      capturan al confirmar una venta (banco, titular, monto, nro comprobante).
--      Se relaciona con la venta por columna `venta_id` (sin FK dura, igual que
--      movimientos_inventario ↔ compra, para no requerir REFERENCES sobre `ventas`).
--
--  Propiedad/roles: las tablas quedan como `postgres` (el rol del pooler que usa
--  la app por raw-PG, que además tiene BYPASSRLS). Se habilita RLS + políticas
--  `sanantonio.puede_acceder_empresa(empresa_id)` y GRANTs espejo de `ventas`
--  (anon/authenticated/service_role) por consistencia y defensa en profundidad.
--
--  Re-ejecutable: IF NOT EXISTS / guardas DO / ON CONFLICT DO NOTHING.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) CATÁLOGO DE ENTIDADES BANCARIAS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sanantonio.entidades_bancarias (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  uuid NOT NULL,
  codigo      text,                              -- código de pago (opcional; el dueño lo carga)
  nombre      text NOT NULL,
  tipo        text,                              -- 'banco' | 'financiera' | 'billetera' (libre)
  activo      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Nombre único por empresa (evita duplicados; permite ON CONFLICT en el seed).
CREATE UNIQUE INDEX IF NOT EXISTS uq_entidades_bancarias_empresa_nombre
  ON sanantonio.entidades_bancarias (empresa_id, lower(nombre));
-- Código único por empresa solo cuando está cargado (NULL no participa).
CREATE UNIQUE INDEX IF NOT EXISTS uq_entidades_bancarias_empresa_codigo
  ON sanantonio.entidades_bancarias (empresa_id, lower(codigo)) WHERE codigo IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_entidades_bancarias_empresa_activo
  ON sanantonio.entidades_bancarias (empresa_id, activo);

ALTER TABLE sanantonio.entidades_bancarias ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='sanantonio' AND tablename='entidades_bancarias' AND policyname='entidades_bancarias_select') THEN
    CREATE POLICY entidades_bancarias_select ON sanantonio.entidades_bancarias
      FOR SELECT USING (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='sanantonio' AND tablename='entidades_bancarias' AND policyname='entidades_bancarias_insert') THEN
    CREATE POLICY entidades_bancarias_insert ON sanantonio.entidades_bancarias
      FOR INSERT WITH CHECK (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='sanantonio' AND tablename='entidades_bancarias' AND policyname='entidades_bancarias_update') THEN
    CREATE POLICY entidades_bancarias_update ON sanantonio.entidades_bancarias
      FOR UPDATE USING (sanantonio.puede_acceder_empresa(empresa_id))
      WITH CHECK (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='sanantonio' AND tablename='entidades_bancarias' AND policyname='entidades_bancarias_delete') THEN
    CREATE POLICY entidades_bancarias_delete ON sanantonio.entidades_bancarias
      FOR DELETE USING (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;
END$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON sanantonio.entidades_bancarias TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) DETALLE DE PAGO DE VENTAS (transferencia / tarjeta)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sanantonio.ventas_pagos_detalle (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL,
  venta_id             uuid NOT NULL,            -- relación por columna con sanantonio.ventas(id)
  metodo_pago          text NOT NULL CHECK (metodo_pago IN ('transferencia','tarjeta')),
  entidad_bancaria_id  uuid REFERENCES sanantonio.entidades_bancarias(id) ON DELETE SET NULL,
  banco_codigo         text,                     -- snapshot del código al momento de la venta
  banco_nombre         text,                     -- snapshot del nombre (sobrevive si se renombra/baja el banco)
  titular              text,                     -- solo transferencia (quién envía)
  monto                numeric NOT NULL DEFAULT 0,
  nro_comprobante      text,
  fecha                timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_ventas_pagos_detalle_empresa_fecha
  ON sanantonio.ventas_pagos_detalle (empresa_id, fecha);
CREATE INDEX IF NOT EXISTS ix_ventas_pagos_detalle_venta
  ON sanantonio.ventas_pagos_detalle (venta_id);

ALTER TABLE sanantonio.ventas_pagos_detalle ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='sanantonio' AND tablename='ventas_pagos_detalle' AND policyname='ventas_pagos_detalle_select') THEN
    CREATE POLICY ventas_pagos_detalle_select ON sanantonio.ventas_pagos_detalle
      FOR SELECT USING (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='sanantonio' AND tablename='ventas_pagos_detalle' AND policyname='ventas_pagos_detalle_insert') THEN
    CREATE POLICY ventas_pagos_detalle_insert ON sanantonio.ventas_pagos_detalle
      FOR INSERT WITH CHECK (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='sanantonio' AND tablename='ventas_pagos_detalle' AND policyname='ventas_pagos_detalle_update') THEN
    CREATE POLICY ventas_pagos_detalle_update ON sanantonio.ventas_pagos_detalle
      FOR UPDATE USING (sanantonio.puede_acceder_empresa(empresa_id))
      WITH CHECK (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='sanantonio' AND tablename='ventas_pagos_detalle' AND policyname='ventas_pagos_detalle_delete') THEN
    CREATE POLICY ventas_pagos_detalle_delete ON sanantonio.ventas_pagos_detalle
      FOR DELETE USING (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;
END$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON sanantonio.ventas_pagos_detalle TO anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) SEED — lista base de entidades de Paraguay (códigos en blanco; el dueño los ajusta).
--    Idempotente vía ON CONFLICT sobre (empresa_id, lower(nombre)).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO sanantonio.entidades_bancarias (empresa_id, nombre, tipo, codigo)
VALUES
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Banco Itaú Paraguay',          'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Banco Continental',            'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Banco GNB Paraguay',           'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Banco Nacional de Fomento',    'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Sudameris Bank',               'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Banco Familiar',               'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Banco Atlas',                  'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Banco Río',                    'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Banco Basa',                   'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Bancop',                       'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Ueno Bank',                    'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Interfisa Banco',              'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Citibank Paraguay',            'banco',      NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Financiera El Comercio',       'financiera', NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Financiera Paraguayo Japonesa','financiera', NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Tigo Money',                   'billetera',  NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Billetera Personal',           'billetera',  NULL),
  ('e4f883ee-07ef-4009-91d8-0384ef621376', 'Zimple',                       'billetera',  NULL)
ON CONFLICT (empresa_id, lower(nombre)) DO NOTHING;

COMMIT;

-- Refrescar el schema cache de PostgREST (por si algún consumidor usa PostgREST;
-- la app accede a estas tablas por raw-PG, así que no depende de esto).
NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN POSTERIOR (READ-ONLY):
--   SELECT count(*) FROM sanantonio.entidades_bancarias;                    -- 18 seed
--   SELECT relrowsecurity FROM pg_class WHERE oid='sanantonio.ventas_pagos_detalle'::regclass; -- true
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema='sanantonio' AND table_name='ventas_pagos_detalle';
-- ROLLBACK LÓGICO (no destructivo): la app puede dejar de leer/escribir estas
--   tablas. DROP TABLE queda EXCLUIDO por política de no-destrucción.
-- ─────────────────────────────────────────────────────────────────────────────
