-- ============================================================================
--  03b — CLONADO DE ESTRUCTURA VIA SQL EDITOR (alternativa a pg_dump)
--
--  Replica la estructura de `enlodemari` en `sanantonio` usando únicamente
--  el catálogo de Postgres. Pensado para correrse en el SQL Editor de
--  Supabase cuando no hay acceso a pg_dump/psql locales.
--
--  ORDEN INTERNO:
--    1. Tipos custom (enums, domains, composite types)
--    2. Tablas (LIKE INCLUDING ALL — defaults, PK, CHECK, UNIQUE, indexes, identity)
--    3. Sequences sueltas (las identity ya vinieron con las tablas)
--    4. Funciones (CREATE OR REPLACE — sólo prokind='f' para evitar 42809)
--    5. Views
--    6. Triggers (requieren funciones creadas)
--    7. Foreign keys (requieren todas las tablas creadas)
--    8. RLS enable + Policies
--    9. Reescritura de defaults que apunten a enlodemari.*
--   10. Validación final
--
--  LIMITACIONES CONOCIDAS:
--    * Defaults complejos que llamen funciones de enlodemari: el paso 9 los
--      reescribe automáticamente. Si hay sintaxis exótica, revisar a mano.
--    * Agregados, window functions y procedures NO se clonan (raros en lógica
--      de negocio multi-tenant; se filtran por prokind='f').
--    * Las funciones que dependan unas de otras pueden fallar en la primera
--      pasada; el bloque captura el error con NOTICE y sigue. Re-ejecutar
--      la sección 4 después de que todo lo demás esté listo resuelve las que
--      hayan quedado.
--    * Owners se omiten — los grants vienen del archivo 02.
-- ============================================================================

-- 0) Sanity preflight.
DO $$
DECLARE v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'sanantonio') THEN
    RAISE EXCEPTION 'Falta el schema sanantonio. Ejecutá primero 02_create_schema_sanantonio.sql';
  END IF;
  SELECT COUNT(*) INTO v_count
    FROM information_schema.tables
   WHERE table_schema='sanantonio' AND table_type='BASE TABLE';
  IF v_count > 0 THEN
    RAISE NOTICE 'sanantonio ya tiene % tablas. Se intentará seguir con IF NOT EXISTS.', v_count;
  END IF;
END $$;

-- ============================================================================
-- 1) TIPOS CUSTOM (enums, domains, composite types)
-- ============================================================================
DO $$
DECLARE r record; v_labels text;
BEGIN
  -- ENUMS
  FOR r IN
    SELECT t.typname,
           array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE n.nspname = 'enlodemari'
       AND t.typtype = 'e'
     GROUP BY t.typname
  LOOP
    v_labels := '';
    SELECT string_agg(quote_literal(x), ', ') INTO v_labels
      FROM unnest(r.labels) AS x;
    BEGIN
      EXECUTE format('CREATE TYPE sanantonio.%I AS ENUM (%s)', r.typname, v_labels);
    EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN RAISE NOTICE 'enum %: %', r.typname, SQLERRM;
    END;
  END LOOP;

  -- DOMAINS
  FOR r IN
    SELECT t.typname,
           pg_catalog.format_type(t.typbasetype, t.typtypmod) AS basetype,
           t.typnotnull,
           t.typdefault
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname = 'enlodemari'
       AND t.typtype = 'd'
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE DOMAIN sanantonio.%I AS %s %s %s',
        r.typname,
        r.basetype,
        CASE WHEN r.typnotnull THEN 'NOT NULL' ELSE '' END,
        CASE WHEN r.typdefault IS NOT NULL THEN 'DEFAULT ' || r.typdefault ELSE '' END
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN RAISE NOTICE 'domain %: %', r.typname, SQLERRM;
    END;
  END LOOP;

  -- COMPOSITE TYPES
  FOR r IN
    SELECT t.typname, t.oid
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_class c ON c.reltype = t.oid
     WHERE n.nspname = 'enlodemari'
       AND t.typtype = 'c'
       AND c.relkind = 'c'
  LOOP
    DECLARE v_cols text;
    BEGIN
      SELECT string_agg(format('%I %s', a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)), ', ')
        INTO v_cols
        FROM pg_attribute a
       WHERE a.attrelid = (SELECT reltype FROM pg_type WHERE oid = r.oid)
         AND a.attnum > 0
         AND NOT a.attisdropped;
      EXECUTE format('CREATE TYPE sanantonio.%I AS (%s)', r.typname, v_cols);
    EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN RAISE NOTICE 'composite %: %', r.typname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 2) TABLAS (LIKE INCLUDING ALL clona PK, NOT NULL, CHECK, UNIQUE, defaults,
--     indexes, identity, storage. NO clona FKs, triggers, RLS.)
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'enlodemari'
     ORDER BY tablename
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS sanantonio.%I (LIKE enlodemari.%I INCLUDING ALL)',
        r.tablename, r.tablename
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'tabla %: %', r.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 3) SEQUENCES sueltas (no asociadas a una columna identity de tabla).
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname AS seqname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'enlodemari'
       AND c.relkind = 'S'
       AND NOT EXISTS (
         SELECT 1 FROM pg_depend d
          WHERE d.objid = c.oid AND d.deptype = 'i'
       )
  LOOP
    BEGIN
      EXECUTE format('CREATE SEQUENCE IF NOT EXISTS sanantonio.%I', r.seqname);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'seq %: %', r.seqname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 4) FUNCTIONS (prokind='f' — excluye agregados/window/procedures).
--    Reescribe referencias `enlodemari.` → `sanantonio.` en el cuerpo.
-- ============================================================================
DO $$
DECLARE r record; v_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'enlodemari'
       AND p.prokind = 'f'
  LOOP
    BEGIN
      v_def := pg_get_functiondef(r.oid);
      v_def := replace(v_def, 'enlodemari.', 'sanantonio.');
      v_def := regexp_replace(v_def, 'CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+sanantonio\.', 'CREATE OR REPLACE FUNCTION sanantonio.', 'i');
      EXECUTE v_def;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'function %: %', r.proname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 5) VIEWS — reescribe enlodemari.* a sanantonio.* en la definición.
-- ============================================================================
DO $$
DECLARE r record; v_def text;
BEGIN
  FOR r IN
    SELECT viewname, definition FROM pg_views
     WHERE schemaname = 'enlodemari'
  LOOP
    v_def := replace(r.definition, 'enlodemari.', 'sanantonio.');
    BEGIN
      EXECUTE format('CREATE OR REPLACE VIEW sanantonio.%I AS %s', r.viewname, v_def);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'view %: %', r.viewname, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 6) TRIGGERS (requieren funciones del paso 4 ya creadas).
-- ============================================================================
DO $$
DECLARE r record; v_def text;
BEGIN
  FOR r IN
    SELECT t.tgname,
           c.relname AS tablename,
           pg_get_triggerdef(t.oid) AS triggerdef
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'enlodemari'
       AND NOT t.tgisinternal
  LOOP
    v_def := replace(r.triggerdef, 'enlodemari.', 'sanantonio.');
    BEGIN
      EXECUTE v_def;
    EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN RAISE NOTICE 'trigger % en %: %', r.tgname, r.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 7) FOREIGN KEYS (requieren todas las tablas + tipos ya creados).
-- ============================================================================
DO $$
DECLARE r record; v_def text;
BEGIN
  FOR r IN
    SELECT c.conname,
           cl.relname AS tablename,
           pg_get_constraintdef(c.oid) AS condef
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
     WHERE n.nspname = 'enlodemari'
       AND c.contype = 'f'
  LOOP
    v_def := replace(r.condef, 'enlodemari.', 'sanantonio.');
    v_def := regexp_replace(v_def, 'REFERENCES\s+(?!sanantonio\.)([a-zA-Z_][a-zA-Z0-9_]*)\(', 'REFERENCES sanantonio.\1(', 'g');
    BEGIN
      EXECUTE format('ALTER TABLE sanantonio.%I ADD CONSTRAINT %I %s',
                     r.tablename, r.conname, v_def);
    EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN RAISE NOTICE 'fk % en %: %', r.conname, r.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 8) RLS + POLICIES.
-- ============================================================================
DO $$
DECLARE r record;
BEGIN
  -- Habilitar RLS en tablas que lo tenían activo en enlodemari.
  FOR r IN
    SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'enlodemari'
       AND c.relkind = 'r'
       AND c.relrowsecurity = true
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE sanantonio.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'rls enable %: %', r.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

DO $$
DECLARE r record; v_using text; v_check text; v_roles text; v_cmd text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname = 'enlodemari'
  LOOP
    v_using := CASE WHEN r.qual       IS NOT NULL THEN ' USING ('      || replace(r.qual,       'enlodemari.', 'sanantonio.') || ')' ELSE '' END;
    v_check := CASE WHEN r.with_check IS NOT NULL THEN ' WITH CHECK (' || replace(r.with_check, 'enlodemari.', 'sanantonio.') || ')' ELSE '' END;
    v_roles := CASE WHEN r.roles IS NOT NULL AND array_length(r.roles, 1) > 0
                    THEN ' TO ' || array_to_string(r.roles, ', ')
                    ELSE '' END;
    v_cmd   := CASE WHEN r.cmd IS NOT NULL AND r.cmd <> 'ALL' THEN ' FOR ' || r.cmd ELSE '' END;
    BEGIN
      EXECUTE format('CREATE POLICY %I ON sanantonio.%I %s %s %s %s',
                     r.policyname, r.tablename, v_cmd, v_roles, v_using, v_check);
    EXCEPTION WHEN duplicate_object THEN NULL;
      WHEN OTHERS THEN RAISE NOTICE 'policy % en %: %', r.policyname, r.tablename, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 9) REESCRITURA DE DEFAULTS que aún apunten a enlodemari.*
--    LIKE INCLUDING ALL copió los defaults TAL CUAL, así que si una columna
--    tenía DEFAULT enlodemari.gen_id(), quedó referenciando enlodemari.
--    Acá detectamos esos casos y los reescribimos a sanantonio.
-- ============================================================================
DO $$
DECLARE r record; v_newdef text;
BEGIN
  FOR r IN
    SELECT c.table_name,
           c.column_name,
           c.column_default
      FROM information_schema.columns c
     WHERE c.table_schema = 'sanantonio'
       AND c.column_default ILIKE '%enlodemari.%'
  LOOP
    v_newdef := replace(r.column_default, 'enlodemari.', 'sanantonio.');
    BEGIN
      EXECUTE format('ALTER TABLE sanantonio.%I ALTER COLUMN %I SET DEFAULT %s',
                     r.table_name, r.column_name, v_newdef);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'default %.%: %', r.table_name, r.column_name, SQLERRM;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- 10) VALIDACIÓN FINAL — counts lado a lado.
-- ============================================================================
SELECT 'tables'    AS tipo,
  (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='enlodemari' AND table_type='BASE TABLE') AS enlodemari,
  (SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema='sanantonio' AND table_type='BASE TABLE') AS sanantonio
UNION ALL
SELECT 'views',
  (SELECT COUNT(*)::int FROM pg_views WHERE schemaname='enlodemari'),
  (SELECT COUNT(*)::int FROM pg_views WHERE schemaname='sanantonio')
UNION ALL
SELECT 'functions',
  (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='enlodemari' AND p.prokind='f'),
  (SELECT COUNT(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='sanantonio' AND p.prokind='f')
UNION ALL
SELECT 'triggers',
  (SELECT COUNT(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='enlodemari' AND NOT t.tgisinternal),
  (SELECT COUNT(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sanantonio' AND NOT t.tgisinternal)
UNION ALL
SELECT 'policies',
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='enlodemari'),
  (SELECT COUNT(*)::int FROM pg_policies WHERE schemaname='sanantonio')
UNION ALL
SELECT 'foreign_keys',
  (SELECT COUNT(*)::int FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='enlodemari' AND c.contype='f'),
  (SELECT COUNT(*)::int FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace n ON n.oid=cl.relnamespace WHERE n.nspname='sanantonio' AND c.contype='f')
UNION ALL
SELECT 'enums',
  (SELECT COUNT(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='enlodemari' AND t.typtype='e'),
  (SELECT COUNT(*)::int FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='sanantonio' AND t.typtype='e');

-- Tablas que faltaron clonar (esperado: vacío).
SELECT 'tabla_faltante_en_sanantonio' AS issue, table_name
  FROM information_schema.tables
 WHERE table_schema = 'enlodemari'
   AND table_type   = 'BASE TABLE'
   AND table_name NOT IN (
     SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'sanantonio' AND table_type = 'BASE TABLE'
   )
 ORDER BY table_name;

-- Defaults residuales que aún apunten a enlodemari (esperado: vacío).
SELECT table_name, column_name, column_default
  FROM information_schema.columns
 WHERE table_schema = 'sanantonio'
   AND column_default ILIKE '%enlodemari.%';
