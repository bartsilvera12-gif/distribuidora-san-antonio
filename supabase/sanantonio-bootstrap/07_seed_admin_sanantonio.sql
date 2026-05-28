-- ============================================================================
--  07 — SEED ADMIN SANANTONIO (MODIFICADOR — riesgo medio)
--
--  RECORDATORIOS CRÍTICOS:
--    * auth.users es GLOBAL al proyecto Supabase — NO se duplica por schema.
--    * NO insertar en enlodemari.usuarios.
--    * NO insertar en otros schemas (public, zentra_erp, elevate, etc).
--    * La fila ERP del admin va ÚNICAMENTE en sanantonio.usuarios.
--
--  PRE-SQL (NO ES SQL):
--    Crear el usuario en auth.users vía Supabase Dashboard
--    (Authentication > Users > Add user) o vía GoTrue Admin API.
--      * email: <ADMIN_EMAIL>
--      * password temporal: <TEMP_PASSWORD> (NO escribir aquí)
--      * Anotar el id devuelto y usarlo como <AUTH_USER_ID> abajo.
-- ============================================================================

-- 1) Introspección de columnas de sanantonio.usuarios (READ-ONLY).
SELECT column_name,
       data_type,
       is_nullable,
       column_default
  FROM information_schema.columns
 WHERE table_schema = 'sanantonio'
   AND table_name   = 'usuarios'
 ORDER BY ordinal_position;

-- 2) Constraints (READ-ONLY).
SELECT tc.constraint_type,
       tc.constraint_name,
       kc.column_name
  FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.key_column_usage kc
         ON kc.constraint_name = tc.constraint_name
        AND kc.table_schema    = tc.table_schema
 WHERE tc.table_schema = 'sanantonio'
   AND tc.table_name   = 'usuarios'
 ORDER BY tc.constraint_type, tc.constraint_name;

-- 3) Verificar que el AUTH_USER_ID existe en auth.users (READ-ONLY).
-- Reemplazar <AUTH_USER_ID> antes de ejecutar.
SELECT id, email, created_at
  FROM auth.users
 WHERE id = '<AUTH_USER_ID>'::uuid;

-- 4) Verificar que la empresa existe (READ-ONLY).
-- Reemplazar <EMPRESA_ID> antes de ejecutar.
SELECT id, nombre
  FROM sanantonio.empresas
 WHERE id = '<EMPRESA_ID>'::uuid;

-- 5) Verificar que NO existe ya en sanantonio.usuarios (READ-ONLY).
-- Reemplazar <AUTH_USER_ID> y <ADMIN_EMAIL> antes de ejecutar.
SELECT id, email, rol, empresa_id
  FROM sanantonio.usuarios
 WHERE auth_user_id = '<AUTH_USER_ID>'::uuid
    OR email        = '<ADMIN_EMAIL>';

-- 6) INSERT del admin — descomentar SÓLO tras:
--    1. Confirmar columnas reales de sanantonio.usuarios.
--    2. Haber creado <AUTH_USER_ID> en auth.users vía Dashboard / Admin API.
--    3. Confirmar <EMPRESA_ID> existente en sanantonio.empresas.
--
-- INSERT INTO sanantonio.usuarios (
--   id,
--   auth_user_id,
--   empresa_id,
--   email,
--   rol,
--   activo,
--   created_at
-- )
-- VALUES (
--   gen_random_uuid(),
--   '<AUTH_USER_ID>'::uuid,
--   '<EMPRESA_ID>'::uuid,
--   '<ADMIN_EMAIL>',
--   'admin',
--   true,
--   now()
-- );

-- 7) AUDITORÍA cross-schema (READ-ONLY): verificar que <AUTH_USER_ID> aparezca
-- SÓLO en sanantonio.usuarios. Recorre dinámicamente todas las tablas
-- `usuarios` (en cualquier schema) que tengan columna `auth_user_id`.
-- Reemplazar <AUTH_USER_ID> antes de ejecutar.
DO $$
DECLARE
  r           record;
  v_sql       text;
  v_total     int;
  v_offending text := '';
BEGIN
  FOR r IN
    SELECT c.table_schema, c.table_name
      FROM information_schema.columns c
     WHERE c.column_name = 'auth_user_id'
       AND c.table_name  = 'usuarios'
       AND c.table_schema NOT IN ('pg_catalog','information_schema','auth')
  LOOP
    v_sql := format(
      'SELECT COUNT(*) FROM %I.%I WHERE auth_user_id = %L::uuid',
      r.table_schema, r.table_name, '<AUTH_USER_ID>'
    );
    EXECUTE v_sql INTO v_total;
    IF v_total > 0 AND r.table_schema <> 'sanantonio' THEN
      v_offending := v_offending || r.table_schema || '.' || r.table_name || ' ';
    END IF;
  END LOOP;
  IF length(v_offending) > 0 THEN
    RAISE NOTICE 'AUTH_USER_ID presente fuera de sanantonio: %', v_offending;
  ELSE
    RAISE NOTICE 'OK: AUTH_USER_ID solo en sanantonio.usuarios (o aun no insertado).';
  END IF;
END
$$ LANGUAGE plpgsql;
