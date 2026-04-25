-- ============================================================
-- Migración 001: Gabinetes + columnas grid en dashboard_widgets
-- Ejecutar en la Raspberry Pi:
--   mysql -u iotuser -piotpass123 monitoring_iot < migrations/001_cabinets_and_widgets.sql
-- ============================================================

-- Tabla de gabinetes
CREATE TABLE IF NOT EXISTS gabinetes (
  id          VARCHAR(64)  NOT NULL,
  name        VARCHAR(255) NOT NULL DEFAULT '',
  location    VARCHAR(255)          DEFAULT '',
  status      VARCHAR(32)           DEFAULT 'OK',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Columnas de posición de grid en dashboard_widgets
-- (Si la tabla no existe aún, usa el CREATE TABLE completo de widgets_routes.py)
ALTER TABLE dashboard_widgets
  ADD COLUMN IF NOT EXISTS col_span INT     DEFAULT 1    AFTER pinned,
  ADD COLUMN IF NOT EXISTS gx       INT     DEFAULT NULL AFTER col_span,
  ADD COLUMN IF NOT EXISTS gy       INT     DEFAULT NULL AFTER gx,
  ADD COLUMN IF NOT EXISTS gw       INT     DEFAULT NULL AFTER gy,
  ADD COLUMN IF NOT EXISTS gh       INT     DEFAULT NULL AFTER gw;
