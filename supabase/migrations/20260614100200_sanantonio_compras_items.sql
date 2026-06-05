-- ============================================================================
--  M3 — COMPRAS_ITEMS: tabla de detalle multi-producto (schema sanantonio)
--  Cliente: Distribuidora San Antonio (instancia monocliente).
--  Tipo: ADITIVO e IDEMPOTENTE (CREATE TABLE IF NOT EXISTS). Solo `sanantonio`.
--
--  Qué hace:
--   1) Crea `sanantonio.compras_items` (1 fila por línea de producto).
--   2) FK a `sanantonio.compras(id)` ON DELETE CASCADE.
--   3) FK a `sanantonio.productos(id)` ON DELETE RESTRICT.
--   4) Índices por compra_id, empresa_id, producto_id.
--   5) RLS habilitado + policies espejo de `ventas_items` (defensivo: solo si
--      existe la función public.puede_acceder_empresa(uuid)).
--
--  Compatibilidad: las compras antiguas mono-producto SIGUEN leyéndose por sus
--  columnas inline en `sanantonio.compras` (producto_id, cantidad, etc.).
--  Esta tabla arranca VACÍA. El backfill de compras viejas es OPCIONAL y queda
--  comentado al final (la app maneja la lectura mixta inline/items en Fase 3).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN PREVIA (READ-ONLY):
--
--   SELECT to_regclass('sanantonio.compras')   AS compras_existe,
--          to_regclass('sanantonio.productos') AS productos_existe,
--          to_regclass('sanantonio.compras_items') AS items_ya_existe;
--   -- Esperado ANTES: compras y productos NOT NULL; compras_items = NULL.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS sanantonio.compras_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  compra_id       uuid NOT NULL
                    REFERENCES sanantonio.compras(id) ON DELETE CASCADE,
  producto_id     uuid NOT NULL
                    REFERENCES sanantonio.productos(id) ON DELETE RESTRICT,
  producto_nombre text    NOT NULL,
  sku             text    NOT NULL DEFAULT '',
  cantidad        numeric NOT NULL,
  costo_unitario  numeric NOT NULL,
  iva_tipo        text    NOT NULL DEFAULT '10'
                    CHECK (iva_tipo IN ('exenta', '5', '10')),
  subtotal        numeric NOT NULL,
  monto_iva       numeric NOT NULL,
  total_linea     numeric NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Índices (idempotentes).
CREATE INDEX IF NOT EXISTS idx_compras_items_compra
  ON sanantonio.compras_items(compra_id);
CREATE INDEX IF NOT EXISTS idx_compras_items_empresa
  ON sanantonio.compras_items(empresa_id);
CREATE INDEX IF NOT EXISTS idx_compras_items_producto
  ON sanantonio.compras_items(producto_id);

-- GRANTs espejo de ventas_items/compras (anon, authenticated, authenticator,
-- service_role). El dueño supabase_admin ya tiene todos los privilegios.
-- Idempotente: re-aplicar un GRANT no falla.
GRANT SELECT, INSERT, UPDATE, DELETE ON sanantonio.compras_items
  TO anon, authenticated, authenticator, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS + POLICIES — espejo EXACTO de sanantonio.ventas_items / sanantonio.compras.
--
-- Verificado contra la DB viva (Fase 0): la función de tenancy vive en
-- `sanantonio.puede_acceder_empresa(uuid)` (NO en public), y las policies de
-- las tablas hermanas usan `sanantonio.puede_acceder_empresa(empresa_id)` con
-- RLS habilitado. Se replica ese patrón. Guarda defensiva idempotente.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE sanantonio.compras_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regprocedure('sanantonio.puede_acceder_empresa(uuid)') IS NULL THEN
    RAISE NOTICE '[compras_items] sanantonio.puede_acceder_empresa(uuid) no existe; policies omitidas (RLS queda activo sin policies).';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='sanantonio' AND tablename='compras_items'
                    AND policyname='compras_items_select') THEN
    CREATE POLICY "compras_items_select" ON sanantonio.compras_items FOR SELECT
      USING (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='sanantonio' AND tablename='compras_items'
                    AND policyname='compras_items_insert') THEN
    CREATE POLICY "compras_items_insert" ON sanantonio.compras_items FOR INSERT
      WITH CHECK (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='sanantonio' AND tablename='compras_items'
                    AND policyname='compras_items_update') THEN
    CREATE POLICY "compras_items_update" ON sanantonio.compras_items FOR UPDATE
      USING (sanantonio.puede_acceder_empresa(empresa_id))
      WITH CHECK (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                  WHERE schemaname='sanantonio' AND tablename='compras_items'
                    AND policyname='compras_items_delete') THEN
    CREATE POLICY "compras_items_delete" ON sanantonio.compras_items FOR DELETE
      USING (sanantonio.puede_acceder_empresa(empresa_id));
  END IF;
END$$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN POSTERIOR (READ-ONLY):
--
--   SELECT to_regclass('sanantonio.compras_items') AS creada;  -- NOT NULL.
--
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema='sanantonio' AND table_name='compras_items'
--    ORDER BY ordinal_position;
--
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid = 'sanantonio.compras_items'::regclass;
--   -- Esperado: PK, 2 FK (compra_id, producto_id), CHECK iva_tipo.
--
--   SELECT policyname FROM pg_policies
--    WHERE schemaname='sanantonio' AND tablename='compras_items';
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- BACKFILL OPCIONAL (NO ejecutar por defecto — decisión del negocio):
--   Volcar cada compra mono-producto histórica como 1 línea de detalle.
--   Idempotente: solo inserta para compras que aún no tienen items.
--   Recomendación: dejar COMENTADO. La app lee compras viejas por inline.
--
--   INSERT INTO sanantonio.compras_items (
--     empresa_id, compra_id, producto_id, producto_nombre, sku,
--     cantidad, costo_unitario, iva_tipo, subtotal, monto_iva, total_linea
--   )
--   SELECT c.empresa_id, c.id, c.producto_id, c.producto_nombre,
--          COALESCE((SELECT p.sku FROM sanantonio.productos p WHERE p.id = c.producto_id), ''),
--          c.cantidad, c.costo_unitario, c.iva_tipo, c.subtotal, c.monto_iva, c.total
--     FROM sanantonio.compras c
--    WHERE NOT EXISTS (
--      SELECT 1 FROM sanantonio.compras_items ci WHERE ci.compra_id = c.id
--    );
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK LÓGICO (NO destructivo):
--   La tabla arranca vacía; si no se usa, no afecta nada existente.
--   DROP TABLE está intencionalmente EXCLUIDO por política de no-destrucción.
--   (Solo si fuese imprescindible y estando vacía:
--      DROP TABLE IF EXISTS sanantonio.compras_items;  -- requiere autorización)
-- ─────────────────────────────────────────────────────────────────────────────
