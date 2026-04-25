"""
ml_service.py - Microservicio de inferencia Isolation Forest
Etapa 3 - Tesis UNMSM 2026

Corre en loop cada 10 minutos en la Raspberry Pi.
Lee ultimas lecturas de MariaDB, calcula features,
predice anomalia y guarda resultado en anomalias_ml.
"""

import time
import logging
import json
import numpy as np
import pymysql
import joblib
from datetime import datetime

# ─────────────────────────────────────────
# CONFIGURACION
# ─────────────────────────────────────────
DB_CONFIG = {
    "host":     "localhost",
    "user":     "ml_user",
    "password": "Focm1903$",
    "database": "monitoring_iot"
}

MODELO_PATH   = "/home/admin/ml_monitoreo/modelo_if.pkl"
SCALER_PATH   = "/home/admin/ml_monitoreo/scaler.pkl"
FEATURES_PATH = "/home/admin/ml_monitoreo/features.pkl"

INTERVALO_SEG = 600   # 10 minutos
GABINETE_ID   = 1
VENTANA_MIN   = 10    # ultimos N minutos de lecturas a considerar

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler("/home/admin/ml_monitoreo/ml_service.log"),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

# ─────────────────────────────────────────
# CARGAR MODELO
# ─────────────────────────────────────────
log.info("Cargando modelo...")
modelo   = joblib.load(MODELO_PATH)
scaler   = joblib.load(SCALER_PATH)
FEATURES = joblib.load(FEATURES_PATH)
log.info(f"Modelo cargado. Features: {FEATURES}")

# ─────────────────────────────────────────
# FUNCIONES
# ─────────────────────────────────────────

def get_conn():
    return pymysql.connect(**DB_CONFIG, cursorclass=pymysql.cursors.DictCursor)


def obtener_ultimas_lecturas(conn):
    """Obtiene el promedio de los ultimos VENTANA_MIN minutos por sensor."""
    query = """
        SELECT sensor_id, tipo_medida, AVG(valor) as valor
        FROM lecturas
        WHERE timestamp >= NOW() - INTERVAL %s MINUTE
          AND (
              (sensor_id = '0x44' AND tipo_medida IN ('temperatura', 'humedad'))
           OR (sensor_id = '0x23' AND tipo_medida = 'luz')
           OR (sensor_id = '0x29' AND tipo_medida = 'distancia')
           OR (sensor_id = '0x68' AND tipo_medida = 'estado')
           OR (sensor_id = 'mq2'  AND tipo_medida = 'humo')
           OR (sensor_id = 'pir'  AND tipo_medida = 'movimiento')
           OR (sensor_id = 'reed' AND tipo_medida = 'estado')
          )
        GROUP BY sensor_id, tipo_medida
    """
    with conn.cursor() as cur:
        cur.execute(query, (VENTANA_MIN,))
        rows = cur.fetchall()
    return rows


def construir_features(rows):
    """Convierte filas de BD en vector de features para el modelo."""
    data = {}
    for r in rows:
        key = f"{r['sensor_id']}_{r['tipo_medida']}"
        data[key] = float(r['valor'])

    features = {
        "temperatura": data.get("0x44_temperatura", np.nan),
        "humedad":     data.get("0x44_humedad",     np.nan),
        "luz":         data.get("0x23_luz",         np.nan),
        "distancia":   data.get("0x29_distancia",   np.nan),
        "mpu6050":     data.get("0x68_estado",      0.0),
        "humo":        data.get("mq2_humo",         np.nan),
        "movimiento":  data.get("pir_movimiento",   0.0),
        "reed":        data.get("reed_estado",      0.0),
        "temp_rate":   0.0,   # no calculable en inferencia puntual
        "hora_sin":    np.sin(2 * np.pi * datetime.now().hour / 24),
        "hora_cos":    np.cos(2 * np.pi * datetime.now().hour / 24),
    }
    return features


def guardar_resultado(conn, score, es_anomalia, features_dict):
    """Inserta el resultado de inferencia en anomalias_ml."""
    query = """
        INSERT INTO anomalias_ml
            (gabinete_id, timestamp, score_anomalia, es_anomalia, features_json)
        VALUES (%s, NOW(), %s, %s, %s)
    """
    with conn.cursor() as cur:
        cur.execute(query, (
            GABINETE_ID,
            float(score),
            int(es_anomalia),
            json.dumps(features_dict)
        ))
    conn.commit()


# ─────────────────────────────────────────
# LOOP PRINCIPAL
# ─────────────────────────────────────────
log.info("Microservicio ML iniciado. Intervalo: %d segundos", INTERVALO_SEG)

while True:
    try:
        conn = get_conn()

        rows = obtener_ultimas_lecturas(conn)

        if len(rows) < 3:
            log.warning("Pocas lecturas en los ultimos %d min (%d filas). Saltando ciclo.", VENTANA_MIN, len(rows))
            conn.close()
            time.sleep(INTERVALO_SEG)
            continue

        features_dict = construir_features(rows)

        # Verificar que no haya NaN en features criticas
        valores = [features_dict[f] for f in FEATURES]
        if any(np.isnan(v) for v in valores):
            # Rellenar NaN con 0 antes de predecir
            valores = [0.0 if np.isnan(v) else v for v in valores]
            log.warning("NaN en features, rellenado con 0.")

        X = np.array(valores).reshape(1, -1)
        X_scaled = scaler.transform(X)

        score       = modelo.decision_function(X_scaled)[0]
        prediccion  = modelo.predict(X_scaled)[0]   # -1 anomalia, 1 normal
        es_anomalia = prediccion == -1

        # Limpiar NaN antes de serializar a JSON
        features_clean = {k: (0.0 if (isinstance(v, float) and np.isnan(v)) else v)
                          for k, v in features_dict.items()}
        guardar_resultado(conn, score, es_anomalia, features_clean)
        conn.close()

        if es_anomalia:
            log.warning("ANOMALIA DETECTADA - score: %.4f | features: %s", score, features_dict)
        else:
            log.info("Normal - score: %.4f", score)

    except Exception as e:
        log.error("Error en ciclo de inferencia: %s", e)

    time.sleep(INTERVALO_SEG)
