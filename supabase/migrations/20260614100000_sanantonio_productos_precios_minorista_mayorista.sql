-- ============================================================================
--  M1 — PRODUCTOS: precio minorista + mayorista (schema sanantonio)
--  Cliente: Distribuidora San Antonio (instancia monocliente).
--  Tipo: ADITIVO e IDEMPOTENTE. No borra columnas ni datos. Solo `sanantonio`.
--
--  Qué hace:
--   1) Agrega columnas `precio_minorista` y `precio_mayorista` (numeric).
--   2) Backfill seguro:
--        - precio_minorista := precio_venta  (cuando minorista quedó en 0).
--        - precio_mayorista := precio_venta  (cuando mayorista quedó en 0).
--   3) `precio_venta` se CONSERVA intacto como espejo de minorista
--      (la sincronización la mantiene la capa de aplicación en Fase 1).
--
--  Reglas: IF NOT EXISTS en columnas. Re-ejecutable sin efectos destructivos.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN PREVIA (READ-ONLY) — correr antes de aplicar:
--
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'sanantonio' AND table_name = 'productos'
--      AND column_name IN ('precio_venta','precio_minorista','precio_mayorista','costo_promedio')
--    ORDER BY column_name;
--   -- Esperado ANTES: solo aparecen precio_venta y costo_promedio.
--
--   SELECT count(*) AS total_productos,
--          count(*) FILTER (WHERE precio_venta > 0) AS con_precio
--     FROM sanantonio.productos;
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE sanantonio.productos
  ADD COLUMN IF NOT EXISTS precio_minorista numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_mayorista numeric NOT NULL DEFAULT 0;

-- Backfill minorista: tomar el precio_venta actual como precio minorista.
-- Solo toca filas donde minorista sigue en 0 (recién agregada o sin configurar).
UPDATE sanantonio.productos
   SET precio_minorista = precio_venta
 WHERE precio_minorista = 0
   AND precio_venta IS NOT NULL
   AND precio_venta <> 0;

-- Backfill mayorista (recomendado = precio_venta, ver nota de recomendación).
-- Arranca igual al minorista (descuento 0%); luego se baja desde la pantalla.
-- Nunca queda en 0 para evitar que una venta mayorista accidental venda a 0.
UPDATE sanantonio.productos
   SET precio_mayorista = precio_venta
 WHERE precio_mayorista = 0
   AND precio_venta IS NOT NULL
   AND precio_venta <> 0;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN POSTERIOR (READ-ONLY) — correr después de aplicar:
--
--   SELECT column_name, data_type, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'sanantonio' AND table_name = 'productos'
--      AND column_name IN ('precio_minorista','precio_mayorista');
--   -- Esperado: ambas columnas numeric, default 0.
--
--   SELECT count(*) FILTER (WHERE precio_minorista = precio_venta) AS minorista_ok,
--          count(*) FILTER (WHERE precio_mayorista = precio_venta) AS mayorista_ok,
--          count(*) FILTER (WHERE precio_minorista <> precio_venta) AS minorista_distinto
--     FROM sanantonio.productos
--    WHERE precio_venta <> 0;
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK LÓGICO (NO destructivo, NO borra columnas ni datos):
--   No se requiere DROP. Para "desactivar" el feature basta con que la app
--   deje de leer/escribir estas columnas. Si se desea revertir el backfill:
--
--     UPDATE sanantonio.productos SET precio_minorista = 0, precio_mayorista = 0;
--
--   (queda a criterio; NO recomendado salvo necesidad real).
--   DROP COLUMN está intencionalmente EXCLUIDO por política de no-destrucción.
-- ─────────────────────────────────────────────────────────────────────────────
