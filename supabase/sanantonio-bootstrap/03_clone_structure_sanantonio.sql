-- ============================================================================
--  03 — CLONADO DE ESTRUCTURA (PROCEDIMIENTO MANUAL — NO ES SQL EJECUTABLE PURO)
--
--  Replicar la estructura completa de `enlodemari` en `sanantonio` (cientos
--  de objetos: tablas, índices, triggers, functions, policies, grants) NO
--  es viable como DDL embebido manual. Se recomienda usar `pg_dump` con
--  `--schema-only` + reescritura de namespace + `psql` aplicador.
--
--  Este archivo contiene SOLO la última query READ-ONLY (detección de
--  literales residuales). El resto son INSTRUCCIONES en comentarios `--`.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1) Dump de estructura del schema origen (en terminal, NO en SQL Editor):
--
--   pg_dump "<SUPABASE_DB_URL>" \
--     --schema=enlodemari \
--     --schema-only \
--     --no-owner \
--     --no-privileges \
--     --no-comments \
--     --file=enlodemari_structure.sql
--
--   * --schema-only      → NO copia datos.
--   * --no-owner         → evita OWNER TO roles que no existen en destino.
--   * --no-privileges    → grants ya gobernados por archivo 02.
--   * --no-comments      → evita ruido innecesario.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2) Reescribir el namespace en el dump (en terminal):
--
--   sed -i 's/\benlodemari\b/sanantonio/g' enlodemari_structure.sql
--
--   Revisar el diff antes de aplicar. Confirmar que no se reemplazaron
--   literales de negocio que casualmente contengan "enlodemari".
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3) Eliminar de enlodemari_structure.sql cualquier sentencia:
--
--   CREATE SCHEMA sanantonio;
--
--   porque el schema YA fue creado por 02_create_schema_sanantonio.sql.
--   Un CREATE SCHEMA duplicado abortaría la transacción (salvo IF NOT EXISTS).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 4) Aplicar el archivo en la base destino (en terminal, ON_ERROR_STOP):
--
--   psql "<SUPABASE_DB_URL>" -v ON_ERROR_STOP=1 -f enlodemari_structure.sql
--
--   Idealmente envolver en BEGIN; ... COMMIT; para rollback ante error.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 5) DESPUÉS DE APLICAR — Ejecutar la query READ-ONLY siguiente para
-- detectar funciones cuya definición todavía referencie literal 'enlodemari'.
-- Si aparece alguna, anotarla y proponer CREATE OR REPLACE manual.
-- NO ejecutar DROP automático.
-- ─────────────────────────────────────────────────────────────────────────────

-- prokind='f' filtra agregados ('a'), window ('w') y procedures ('p'): para
-- esas, pg_get_functiondef revienta con 42809.
SELECT n.nspname AS schema,
       p.proname AS function_name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'sanantonio'
   AND p.prokind = 'f'
   AND pg_get_functiondef(p.oid) ILIKE '%enlodemari%'
 ORDER BY p.proname;

-- Misma detección para triggers de sanantonio que aún ejecuten action_statement
-- referenciando enlodemari:
SELECT event_object_schema AS schema,
       trigger_name,
       event_object_table  AS tabla,
       action_statement
  FROM information_schema.triggers
 WHERE trigger_schema = 'sanantonio'
   AND action_statement ILIKE '%enlodemari%'
 ORDER BY trigger_name;

-- Y para policies de sanantonio:
SELECT schemaname AS schema,
       tablename,
       policyname,
       qual,
       with_check
  FROM pg_policies
 WHERE schemaname = 'sanantonio'
   AND (COALESCE(qual, '') ILIKE '%enlodemari%' OR COALESCE(with_check, '') ILIKE '%enlodemari%')
 ORDER BY tablename, policyname;
