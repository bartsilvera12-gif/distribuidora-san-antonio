-- ============================================================================
--  M5 — PRODUCTOS: separar `codigo_interno` (SKU/interno) de `codigo_barras` (EAN-13)
--  Cliente: Distribuidora San Antonio (instancia monocliente).
--  Tipo: ADITIVO + DATA-MOVE no destructivo. Solo schema `sanantonio`.
--
--  Problema: el código interno auto-generado (INT-{EMP}-{YYYYMM}-{SEQ6}) se
--  guardaba en `codigo_barras`, contaminando el campo que debe contener un
--  código de barras NUMÉRICO escaneable (EAN-13).
--
--  Qué hace:
--   1) Agrega columna `codigo_interno text` (nullable) + índice único parcial
--      por (empresa_id, codigo_interno).
--   2) Mueve el `INT-…` mal ubicado: codigo_barras → codigo_interno y libera
--      `codigo_barras` (= NULL) para un EAN real. Apaga `codigo_barras_interno`.
--   3) `sku` NO se toca (conserva el SKU del usuario).
--
--  Reglas: IF NOT EXISTS / idempotente. Re-ejecutable. No borra datos (mueve).
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN PREVIA (READ-ONLY):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='sanantonio' AND table_name='productos'
--      AND column_name='codigo_interno';  -- Esperado ANTES: 0 filas.
--   SELECT count(*) AS cb_internos FROM sanantonio.productos WHERE codigo_barras LIKE 'INT-%';
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE sanantonio.productos
  ADD COLUMN IF NOT EXISTS codigo_interno text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_empresa_codigo_interno
  ON sanantonio.productos (empresa_id, codigo_interno)
  WHERE codigo_interno IS NOT NULL;

-- Data-move: INT-… que está mal en codigo_barras → codigo_interno; libera barcode.
UPDATE sanantonio.productos
   SET codigo_interno = codigo_barras,
       codigo_barras = NULL,
       codigo_barras_interno = false,
       updated_at = now()
 WHERE codigo_barras LIKE 'INT-%'
   AND (codigo_interno IS NULL OR codigo_interno = '');

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN POSTERIOR (READ-ONLY):
--   SELECT column_name,data_type,is_nullable FROM information_schema.columns
--    WHERE table_schema='sanantonio' AND table_name='productos' AND column_name='codigo_interno';
--   SELECT nombre, sku, codigo_interno, codigo_barras FROM sanantonio.productos ORDER BY nombre;
--   -- Esperado: los que tenían INT-… ahora lo tienen en codigo_interno y codigo_barras NULL.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK LÓGICO (NO destructivo): la app puede dejar de leer codigo_interno.
-- Para revertir el data-move (volver INT a codigo_barras):
--   UPDATE sanantonio.productos SET codigo_barras = codigo_interno, codigo_barras_interno = true,
--          codigo_interno = NULL WHERE codigo_interno LIKE 'INT-%' AND codigo_barras IS NULL;
-- DROP COLUMN intencionalmente EXCLUIDO por política de no-destrucción.
-- ─────────────────────────────────────────────────────────────────────────────
