-- ============================================================================
--  04 — VALIDATE CLONE COUNTS (READ-ONLY)
--  Compara counts entre enlodemari y sanantonio lado a lado.
--  Ejecutar DESPUÉS de haber aplicado el dump del paso 03.
-- ============================================================================

SELECT 'tables' AS tipo,
       (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema='enlodemari' AND table_type='BASE TABLE') AS enlodemari,
       (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema='sanantonio' AND table_type='BASE TABLE') AS sanantonio;

SELECT 'views' AS tipo,
       (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema='enlodemari' AND table_type='VIEW') AS enlodemari,
       (SELECT COUNT(*)::int FROM information_schema.tables
         WHERE table_schema='sanantonio' AND table_type='VIEW') AS sanantonio;

SELECT 'policies' AS tipo,
       (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='enlodemari') AS enlodemari,
       (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='sanantonio') AS sanantonio;

SELECT 'functions' AS tipo,
       (SELECT COUNT(*)::int FROM pg_proc p
          JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='enlodemari') AS enlodemari,
       (SELECT COUNT(*)::int FROM pg_proc p
          JOIN pg_namespace n ON n.oid=p.pronamespace
         WHERE n.nspname='sanantonio') AS sanantonio;

SELECT 'triggers' AS tipo,
       (SELECT COUNT(*)::int FROM information_schema.triggers WHERE trigger_schema='enlodemari') AS enlodemari,
       (SELECT COUNT(*)::int FROM information_schema.triggers WHERE trigger_schema='sanantonio') AS sanantonio;

SELECT 'indexes' AS tipo,
       (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='enlodemari') AS enlodemari,
       (SELECT COUNT(*)::int FROM pg_indexes WHERE schemaname='sanantonio') AS sanantonio;

-- Diferencias de tablas (esperado: vacío si el clonado fue íntegro).
SELECT 'tabla_faltante_en_sanantonio' AS issue, table_name
  FROM information_schema.tables
 WHERE table_schema = 'enlodemari'
   AND table_type   = 'BASE TABLE'
   AND table_name NOT IN (
     SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'sanantonio'
        AND table_type   = 'BASE TABLE'
   )
 ORDER BY table_name;
