-- ============================================================================
--  01 — PREFLIGHT (READ-ONLY)
--  Verifica estado de origen (enlodemari) y destino (sanantonio) antes de tocar nada.
--  Seguro de ejecutar en Supabase SQL Editor. No modifica nada.
-- ============================================================================

-- Confirmar que el schema origen existe.
SELECT nspname AS schema_origen
  FROM pg_namespace
 WHERE nspname = 'enlodemari';

-- Confirmar si el schema destino YA existe (debería estar vacío o no existir).
SELECT nspname AS schema_destino
  FROM pg_namespace
 WHERE nspname = 'sanantonio';

-- Counts de objetos en `enlodemari` — baseline para comparar luego del clonado.
SELECT 'tables' AS tipo,
       COUNT(*)::int AS total
  FROM information_schema.tables
 WHERE table_schema = 'enlodemari'
   AND table_type   = 'BASE TABLE';

SELECT 'views' AS tipo,
       COUNT(*)::int AS total
  FROM information_schema.tables
 WHERE table_schema = 'enlodemari'
   AND table_type   = 'VIEW';

SELECT 'policies' AS tipo,
       COUNT(*)::int AS total
  FROM pg_policies
 WHERE schemaname = 'enlodemari';

SELECT 'functions' AS tipo,
       COUNT(*)::int AS total
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'enlodemari';

SELECT 'triggers' AS tipo,
       COUNT(*)::int AS total
  FROM information_schema.triggers
 WHERE trigger_schema = 'enlodemari';

SELECT 'indexes' AS tipo,
       COUNT(*)::int AS total
  FROM pg_indexes
 WHERE schemaname = 'enlodemari';

-- Funciones con referencias literales al string 'enlodemari' (útil para
-- detectar lógica hardcodeada al schema origen).
-- prokind='f' filtra agregados ('a'), window ('w') y procedures ('p'): para
-- esas, pg_get_functiondef revienta con 42809.
SELECT n.nspname  AS schema,
       p.proname  AS function_name,
       'function' AS kind
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'enlodemari'
   AND p.prokind = 'f'
   AND pg_get_functiondef(p.oid) ILIKE '%enlodemari%'
 ORDER BY p.proname;

-- Triggers con referencias literales a 'enlodemari'.
SELECT event_object_schema AS schema,
       trigger_name,
       event_object_table  AS tabla,
       action_statement
  FROM information_schema.triggers
 WHERE trigger_schema = 'enlodemari'
   AND action_statement ILIKE '%enlodemari%'
 ORDER BY trigger_name;

-- Policies con referencias literales a 'enlodemari'.
SELECT schemaname AS schema,
       tablename,
       policyname,
       qual,
       with_check
  FROM pg_policies
 WHERE schemaname = 'enlodemari'
   AND (COALESCE(qual, '') ILIKE '%enlodemari%' OR COALESCE(with_check, '') ILIKE '%enlodemari%')
 ORDER BY tablename, policyname;

-- Confirmar presencia de las tablas core en enlodemari.
SELECT table_name
  FROM information_schema.tables
 WHERE table_schema = 'enlodemari'
   AND table_name IN ('empresas', 'usuarios', 'modulos', 'empresa_modulos')
 ORDER BY table_name;

-- Verificar role authenticator (no imprime password ni connection string).
SELECT rolname,
       rolcanlogin,
       rolconfig
  FROM pg_roles
 WHERE rolname = 'authenticator';

-- rolconfig por database (para conocer pgrst.db_schemas seteado por DB).
SELECT d.datname,
       r.rolname,
       s.setconfig
  FROM pg_db_role_setting s
  JOIN pg_database d ON d.oid = s.setdatabase
  JOIN pg_roles    r ON r.oid = s.setrole
 WHERE r.rolname = 'authenticator'
   AND d.datname = 'postgres';
