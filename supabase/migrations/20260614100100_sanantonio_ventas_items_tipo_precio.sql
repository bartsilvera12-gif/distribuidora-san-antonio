-- ============================================================================
--  M2 — VENTAS_ITEMS: tipo de precio por línea (schema sanantonio)
--  Cliente: Distribuidora San Antonio (instancia monocliente).
--  Tipo: ADITIVO e IDEMPOTENTE. No borra columnas ni datos. Solo `sanantonio`.
--
--  Qué hace:
--   1) Agrega `tipo_precio text NOT NULL DEFAULT 'minorista'`.
--      El DEFAULT rellena automáticamente las filas existentes (backfill).
--   2) Backfill explícito defensivo: cualquier fila con tipo_precio NULL
--      (por si la columna preexistiera nullable) pasa a 'minorista'.
--   3) Agrega CHECK ('minorista','mayorista','costo') de forma idempotente.
--
--  Reglas: IF NOT EXISTS / guardas DO. Re-ejecutable sin efectos destructivos.
--  Ventas viejas: quedan en 'minorista' (precio único histórico = minorista).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN PREVIA (READ-ONLY):
--
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'sanantonio' AND table_name = 'ventas_items'
--      AND column_name = 'tipo_precio';
--   -- Esperado ANTES: 0 filas (la columna aún no existe).
--
--   SELECT count(*) AS total_items_venta FROM sanantonio.ventas_items;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1) Columna nueva con default (rellena filas existentes en una pasada).
ALTER TABLE sanantonio.ventas_items
  ADD COLUMN IF NOT EXISTS tipo_precio text NOT NULL DEFAULT 'minorista';

-- 2) Backfill defensivo (no-op si la columna se creó con NOT NULL DEFAULT).
UPDATE sanantonio.ventas_items
   SET tipo_precio = 'minorista'
 WHERE tipo_precio IS NULL;

-- 3) CHECK idempotente: crear sólo si no existe ya.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ventas_items_tipo_precio_check'
       AND conrelid = 'sanantonio.ventas_items'::regclass
  ) THEN
    ALTER TABLE sanantonio.ventas_items
      ADD CONSTRAINT ventas_items_tipo_precio_check
      CHECK (tipo_precio IN ('minorista', 'mayorista', 'costo'));
  END IF;
END$$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN POSTERIOR (READ-ONLY):
--
--   SELECT tipo_precio, count(*)
--     FROM sanantonio.ventas_items
--    GROUP BY tipo_precio;
--   -- Esperado: todas las filas históricas en 'minorista'.
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'sanantonio.ventas_items'::regclass
--      AND conname = 'ventas_items_tipo_precio_check';
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK LÓGICO (NO destructivo):
--   La app puede simplemente dejar de enviar/leer `tipo_precio`.
--   Si se quiere quitar SOLO el CHECK (sin borrar datos ni columna):
--
--     ALTER TABLE sanantonio.ventas_items
--       DROP CONSTRAINT IF EXISTS ventas_items_tipo_precio_check;
--
--   DROP COLUMN está intencionalmente EXCLUIDO por política de no-destrucción.
-- ─────────────────────────────────────────────────────────────────────────────
