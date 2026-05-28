-- ============================================================================
--  08 — AUDITORÍA FINAL (READ-ONLY)
--  Verificación end-to-end del bootstrap de sanantonio.
-- ============================================================================

-- Schema existe.
SELECT nspname
  FROM pg_namespace
 WHERE nspname = 'sanantonio';

-- Counts comparativos (resumen).
SELECT 'tables'    AS tipo,
       (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema='enlodemari' AND table_type='BASE TABLE') AS enlodemari,
       (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema='sanantonio' AND table_type='BASE TABLE') AS sanantonio
UNION ALL
SELECT 'functions' AS tipo,
       (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='enlodemari') AS enlodemari,
       (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sanantonio') AS sanantonio
UNION ALL
SELECT 'policies'  AS tipo,
       (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='enlodemari') AS enlodemari,
       (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='sanantonio') AS sanantonio
UNION ALL
SELECT 'triggers'  AS tipo,
       (SELECT COUNT(*)::int FROM information_schema.triggers WHERE trigger_schema='enlodemari') AS enlodemari,
       (SELECT COUNT(*)::int FROM information_schema.triggers WHERE trigger_schema='sanantonio') AS sanantonio
UNION ALL
SELECT 'indexes'   AS tipo,
       (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='enlodemari') AS enlodemari,
       (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='sanantonio') AS sanantonio;

-- sanantonio.empresas debe tener al menos "Distribuidora San Antonio".
SELECT id, nombre
  FROM sanantonio.empresas
 ORDER BY nombre;

-- sanantonio.usuarios — admin esperado si se ejecutó 07_seed_admin_sanantonio.sql.
SELECT id, email, rol, empresa_id, auth_user_id, activo
  FROM sanantonio.usuarios
 ORDER BY created_at NULLS LAST, email;

-- No debe haber inserciones nuevas en enlodemari como efecto colateral.
-- Comparar contra el baseline tomado en 01_preflight_readonly.sql.
SELECT 'enlodemari.usuarios.count' AS metric,
       COUNT(*)::int AS valor
  FROM enlodemari.usuarios;

SELECT 'enlodemari.empresas.count' AS metric,
       COUNT(*)::int AS valor
  FROM enlodemari.empresas;

-- Módulos activos para la empresa Distribuidora San Antonio.
-- Reemplazar <EMPRESA_ID> por el id real.
SELECT m.slug, m.nombre, em.activo
  FROM sanantonio.empresa_modulos em
  JOIN sanantonio.modulos m ON m.id = em.modulo_id
 WHERE em.empresa_id = '<EMPRESA_ID>'::uuid
 ORDER BY m.slug;

-- Referencias residuales a 'enlodemari' en objetos de sanantonio.
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

SELECT event_object_schema AS schema,
       trigger_name,
       event_object_table  AS tabla
  FROM information_schema.triggers
 WHERE trigger_schema = 'sanantonio'
   AND action_statement ILIKE '%enlodemari%'
 ORDER BY trigger_name;

SELECT schemaname AS schema,
       tablename,
       policyname
  FROM pg_policies
 WHERE schemaname = 'sanantonio'
   AND (COALESCE(qual, '') ILIKE '%enlodemari%' OR COALESCE(with_check, '') ILIKE '%enlodemari%')
 ORDER BY tablename, policyname;
