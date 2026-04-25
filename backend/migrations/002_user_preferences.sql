-- ============================================================
-- Migración 002: Tabla de preferencias de usuario (tema)
-- Ejecutar en la Raspberry Pi:
--   mysql -u iotuser -piotpass123 monitoring_iot < migrations/002_user_preferences.sql
-- ============================================================

USE monitoring_iot;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id      INT         NOT NULL,
  theme_key    VARCHAR(64) NOT NULL DEFAULT 'default',
  theme_mode   VARCHAR(16) NOT NULL DEFAULT 'dark',
  custom_theme JSON                 DEFAULT NULL,
  updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
