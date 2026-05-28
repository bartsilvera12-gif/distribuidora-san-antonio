-- ============================================================================
--  06 — SEED EMPRESA DISTRIBUIDORA SAN ANTONIO (MODIFICADOR)
--  El INSERT va comentado. Hay introspección READ-ONLY previa para no asumir
--  columnas. Descomentar y completar placeholders sólo tras confirmar la
--  forma real de sanantonio.empresas.
-- ============================================================================

-- 1) Introspección de columnas (READ-ONLY).
SELECT column_name,
       data_type,
       is_nullable,
       column_default
  FROM information_schema.columns
 WHERE table_schema = 'sanantonio'
   AND table_name   = 'empresas'
 ORDER BY ordinal_position;

-- 2) Constraints (READ-ONLY) — detecta NOT NULL/UNIQUE/CHECK obligatorios.
SELECT tc.constraint_type,
       tc.constraint_name,
       kc.column_name
  FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.key_column_usage kc
         ON kc.constraint_name = tc.constraint_name
        AND kc.table_schema    = tc.table_schema
 WHERE tc.table_schema = 'sanantonio'
   AND tc.table_name   = 'empresas'
 ORDER BY tc.constraint_type, tc.constraint_name;

-- 3) Existencia previa (READ-ONLY) — evitar duplicados.
SELECT id, nombre
  FROM sanantonio.empresas
 WHERE nombre ILIKE 'Distribuidora San Antonio%';

-- 4) INSERT — descomentar SÓLO tras confirmar columnas reales y reemplazar
-- <EMPRESA_ID> por un UUID v4. Si la columna `id` tiene default gen_random_uuid()
-- y pgcrypto está habilitado, se puede omitir la columna `id` y dejar que
-- el default la genere.
--
-- INSERT INTO sanantonio.empresas (id, nombre, data_schema, created_at)
-- VALUES (
--   '<EMPRESA_ID>'::uuid,
--   'Distribuidora San Antonio',
--   'sanantonio',
--   now()
-- );

-- 5) Verificación (READ-ONLY).
SELECT id, nombre
  FROM sanantonio.empresas
 ORDER BY nombre;
