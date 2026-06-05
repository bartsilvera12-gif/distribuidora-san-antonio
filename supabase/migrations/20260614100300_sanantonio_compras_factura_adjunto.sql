-- ============================================================================
--  M4 — COMPRAS: columnas para adjunto de factura del proveedor (sanantonio)
--  Cliente: Distribuidora San Antonio (instancia monocliente).
--  Tipo: ADITIVO e IDEMPOTENTE. No borra columnas ni datos. Solo `sanantonio`.
--
--  Qué hace:
--   Agrega a `sanantonio.compras` los metadatos del archivo de factura:
--     - factura_bucket          text  (bucket de Storage; ej. 'compras-facturas')
--     - factura_path            text  ('{empresa_id}/{compra_id}/factura.{ext}')
--     - factura_nombre_original text  (nombre del archivo subido por el usuario)
--     - factura_mime_type       text  (image/jpeg, image/png, application/pdf…)
--
--  Todas NULLABLE: una compra sin factura adjunta es válida.
--  El archivo físico NO se crea aquí (ver M5 / bucket en fase futura).
--
--  Recomendación de diseño: guardar PATH + BUCKET + metadata (no solo path).
--   - bucket: portabilidad si se renombra/migra el bucket.
--   - path:   ubicación real del objeto.
--   - nombre_original + mime: para preview/descarga con nombre y tipo correctos
--     sin tener que inspeccionar el objeto en Storage.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN PREVIA (READ-ONLY):
--
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema='sanantonio' AND table_name='compras'
--      AND column_name LIKE 'factura_%'
--    ORDER BY column_name;
--   -- Esperado ANTES: 0 filas.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE sanantonio.compras
  ADD COLUMN IF NOT EXISTS factura_bucket          text,
  ADD COLUMN IF NOT EXISTS factura_path            text,
  ADD COLUMN IF NOT EXISTS factura_nombre_original text,
  ADD COLUMN IF NOT EXISTS factura_mime_type       text;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACIÓN POSTERIOR (READ-ONLY):
--
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema='sanantonio' AND table_name='compras'
--      AND column_name LIKE 'factura_%'
--    ORDER BY column_name;
--   -- Esperado: 4 columnas text, is_nullable = YES.
--
--   SELECT count(*) AS compras_con_factura
--     FROM sanantonio.compras
--    WHERE factura_path IS NOT NULL;
--   -- Esperado tras aplicar: 0 (aún no se subió ninguna).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK LÓGICO (NO destructivo):
--   La app deja de leer/escribir estas columnas; no afecta compras existentes.
--   DROP COLUMN está intencionalmente EXCLUIDO por política de no-destrucción.
-- ─────────────────────────────────────────────────────────────────────────────
