-- =============================================================================
-- Carga histórica + saldos iniciales (Opción A) — INSTANCIA DEDICADA SAN ANTONIO.
--
-- Esta es una instancia monocliente: todo el ERP vive en el schema `sanantonio`
-- (NEURA_CLIENT_SCHEMA). La BD es infraestructura COMPARTIDA con otros proyectos,
-- por lo que esta migración apunta EXCLUSIVAMENTE al schema `sanantonio` y NO
-- toca ningún otro schema.
--
-- Agrega, de forma ADITIVA e IDEMPOTENTE:
--   1) empresa_carga_historica: fecha de corte + flag habilitar/cerrar.
--   2) columna es_historico en las tablas operativas.
--   3) facturas.numero_interno: numeración NO fiscal para históricos.
--
-- NO modifica datos existentes. NO altera columnas actuales. NO toca SIFEN.
-- =============================================================================

-- 1) empresa_carga_historica (singleton por empresa)
CREATE TABLE IF NOT EXISTS sanantonio.empresa_carga_historica (
  empresa_id   uuid PRIMARY KEY,
  fecha_corte  date NOT NULL,
  habilitada   boolean NOT NULL DEFAULT true,
  cerrada_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 2) columna es_historico en tablas operativas
ALTER TABLE sanantonio.ventas                 ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false;
ALTER TABLE sanantonio.compras                ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false;
ALTER TABLE sanantonio.movimientos_inventario ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false;
ALTER TABLE sanantonio.facturas               ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false;
ALTER TABLE sanantonio.gastos                 ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false;
ALTER TABLE sanantonio.pagos                  ADD COLUMN IF NOT EXISTS es_historico boolean NOT NULL DEFAULT false;

-- numeración interna NO fiscal para históricos (no consume correlativo SIFEN)
ALTER TABLE sanantonio.facturas ADD COLUMN IF NOT EXISTS numero_interno text;

-- 3) índices de apoyo (filtrar/excluir históricos)
CREATE INDEX IF NOT EXISTS idx_ventas_es_historico   ON sanantonio.ventas  (empresa_id, es_historico);
CREATE INDEX IF NOT EXISTS idx_compras_es_historico  ON sanantonio.compras (empresa_id, es_historico);
CREATE INDEX IF NOT EXISTS idx_movinv_es_historico   ON sanantonio.movimientos_inventario (empresa_id, es_historico);
CREATE INDEX IF NOT EXISTS idx_facturas_es_historico ON sanantonio.facturas (empresa_id, es_historico);
