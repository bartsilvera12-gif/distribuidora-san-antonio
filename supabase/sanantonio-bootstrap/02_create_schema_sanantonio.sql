-- ============================================================================
--  02 — CREATE SCHEMA SANANTONIO (MODIFICADOR — bajo riesgo)
--  Crea el schema vacío y otorga grants mínimos para PostgREST.
--  NO toca enlodemari, public ni otros schemas.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS sanantonio;

GRANT USAGE ON SCHEMA sanantonio TO authenticator;
GRANT USAGE ON SCHEMA sanantonio TO anon;
GRANT USAGE ON SCHEMA sanantonio TO authenticated;
GRANT USAGE ON SCHEMA sanantonio TO service_role;

GRANT CREATE ON SCHEMA sanantonio TO service_role;

-- Default privileges: objetos futuros creados por service_role ya quedan
-- accesibles para roles operativos (PostgREST + clientes anon/authenticated).
ALTER DEFAULT PRIVILEGES IN SCHEMA sanantonio
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA sanantonio
  GRANT SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA sanantonio
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA sanantonio
  GRANT EXECUTE ON FUNCTIONS TO authenticated, service_role;

-- Verificación inmediata (READ-ONLY):
SELECT nspname FROM pg_namespace WHERE nspname = 'sanantonio';
