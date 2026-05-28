-- ============================================================================
--  05 — POSTGREST APPEND-ONLY (ALTO RIESGO)
--  Agrega `sanantonio` a la lista pgrst.db_schemas sin reemplazar la lista
--  existente. La parte modificadora va comentada (--). NO descomentar hasta
--  haber leído y copiado la lista actual del PASO A.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO A — LECTURA (READ-ONLY). Ejecutar primero. Copiar el valor literal.
-- ─────────────────────────────────────────────────────────────────────────────

-- (a) rolconfig global del role authenticator.
SELECT rolname,
       rolconfig
  FROM pg_roles
 WHERE rolname = 'authenticator';

-- (b) rolconfig por database `postgres`.
SELECT d.datname,
       r.rolname,
       s.setconfig
  FROM pg_db_role_setting s
  JOIN pg_database d ON d.oid = s.setdatabase
  JOIN pg_roles    r ON r.oid = s.setrole
 WHERE r.rolname = 'authenticator'
   AND d.datname = 'postgres';

-- (c) Extracción legible de pgrst.db_schemas tal como está hoy.
SELECT unnest(setconfig) AS setting
  FROM pg_db_role_setting s
  JOIN pg_database d ON d.oid = s.setdatabase
  JOIN pg_roles    r ON r.oid = s.setrole
 WHERE r.rolname = 'authenticator'
   AND d.datname = 'postgres'
   AND EXISTS (
     SELECT 1 FROM unnest(setconfig) cfg WHERE cfg ILIKE 'pgrst.db_schemas=%'
   );

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO B — ESCRITURA APPEND-ONLY (MODIFICADOR — NO EJECUTAR HASTA AUTORIZAR).
--
-- Tomar la lista actual obtenida en PASO A y agregar `sanantonio` al FINAL,
-- separada por coma SIN espacios. NO reemplazar la lista por memoria.
-- Reemplazar <LISTA_ACTUAL_COMPLETA_PGRST_DB_SCHEMAS> por el valor real.
--
-- Variante recomendada (Supabase hosted, rolconfig IN DATABASE):
--
--   ALTER ROLE authenticator IN DATABASE postgres
--     SET pgrst.db_schemas = '<LISTA_ACTUAL_COMPLETA_PGRST_DB_SCHEMAS>,sanantonio';
--
-- Variante a nivel ROLE (sólo si la actual NO está IN DATABASE):
--
--   ALTER ROLE authenticator
--     SET pgrst.db_schemas = '<LISTA_ACTUAL_COMPLETA_PGRST_DB_SCHEMAS>,sanantonio';
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER ROLE authenticator IN DATABASE postgres
--   SET pgrst.db_schemas = '<LISTA_ACTUAL_COMPLETA_PGRST_DB_SCHEMAS>,sanantonio';

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO C — RELOAD DE POSTGREST. Ejecutar SOLO después del ALTER ROLE.
-- ─────────────────────────────────────────────────────────────────────────────

-- NOTIFY pgrst, 'reload config';
-- NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO D — VERIFICACIÓN POST-RELOAD (READ-ONLY).
-- Re-ejecutar el SELECT de pgrst.db_schemas y confirmar que `sanantonio`
-- aparece al final.
-- ─────────────────────────────────────────────────────────────────────────────

SELECT unnest(setconfig) AS setting
  FROM pg_db_role_setting s
  JOIN pg_database d ON d.oid = s.setdatabase
  JOIN pg_roles    r ON r.oid = s.setrole
 WHERE r.rolname = 'authenticator'
   AND d.datname = 'postgres';
