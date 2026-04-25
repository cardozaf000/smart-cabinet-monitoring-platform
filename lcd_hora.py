from RPLCD.i2c import CharLCD
from datetime import datetime
import time
import json
import os
import mysql.connector

lcd = CharLCD('PCF8574', 0x27, cols=16, rows=2)
lcd.clear()

DB_CFG = dict(
    host="localhost", user="iotuser",
    password="iotpass123", database="monitoring_iot",
    connection_timeout=3
)

CONFIG_PATH = "/home/admin/backend/display_config.json"

DEFAULT_LCD = {
    "enabled": True,
    "mode": "sensors_time",
    "custom_line1": "",
    "custom_line2": "",
    "cycle_sensors_s": 5,
    "cycle_time_s": 3,
}


def load_lcd_config():
    try:
        with open(CONFIG_PATH) as f:
            data = json.load(f)
        return {**DEFAULT_LCD, **data.get("lcd", {})}
    except Exception:
        return dict(DEFAULT_LCD)


def get_sensor_data():
    try:
        conn = mysql.connector.connect(**DB_CFG)
        cur  = conn.cursor()
        cur.execute("""
            SELECT tipo_medida, MAX(valor), AVG(valor)
            FROM lecturas
            WHERE tipo_medida IN ('temperatura', 'humedad')
              AND timestamp >= NOW() - INTERVAL 5 MINUTE
            GROUP BY tipo_medida
        """)
        rows = cur.fetchall()
        data = {r[0]: (float(r[1]), float(r[2])) for r in rows}
        anomalia = None
        try:
            cur.execute(
                "SELECT es_anomalia FROM anomalias_ml ORDER BY timestamp DESC LIMIT 1"
            )
            row = cur.fetchone()
            if row:
                anomalia = bool(row[0])
        except Exception:
            pass
        cur.close(); conn.close()
        t = data['temperatura'][0] if 'temperatura' in data else None
        h = data['humedad'][1]     if 'humedad'     in data else None
        return t, h, anomalia
    except Exception:
        return None, None, None


def write_lcd(line0, line1):
    lcd.cursor_pos = (0, 0)
    lcd.write_string(line0[:16].ljust(16))
    lcd.cursor_pos = (1, 0)
    lcd.write_string(line1[:16].ljust(16))


def pantalla_sensores(t, h, anomalia):
    if t is not None and h is not None:
        line0 = f"T:{t:4.1f}C H:{h:4.1f}%"
    elif t is not None:
        line0 = f"T:{t:4.1f}C  H:----"
    else:
        line0 = "T:----  H:----  "
    if anomalia is True:
        line1 = "  ** ALERTA **  "
    elif anomalia is False:
        line1 = "    NORMAL      "
    else:
        line1 = "   SIN DATOS    "
    write_lcd(line0, line1)


def pantalla_hora():
    ahora = datetime.now()
    write_lcd(ahora.strftime("%H:%M:%S").center(16),
              ahora.strftime("%d/%m/%Y").center(16))


def pantalla_custom(cfg):
    write_lcd(cfg.get("custom_line1", ""), cfg.get("custom_line2", ""))


# ── Estado ───────────────────────────────────────────────────
t_val = h_val = anomalia = None
ultimo_db  = 0
ultimo_cfg = 0
cfg        = load_lcd_config()
tick       = 0

try:
    while True:
        ahora = time.time()

        # Recargar config cada 4 s (cambios desde la web se aplican aquí)
        if ahora - ultimo_cfg >= 4:
            cfg        = load_lcd_config()
            ultimo_cfg = ahora

        if not cfg.get("enabled", True):
            lcd.clear()
            time.sleep(2)
            tick = 0
            continue

        # Actualizar BD cada 4 s
        if ahora - ultimo_db >= 4:
            t_val, h_val, anomalia = get_sensor_data()
            ultimo_db = ahora

        mode = cfg.get("mode", "sensors_time")

        if mode == "sensors_only":
            pantalla_sensores(t_val, h_val, anomalia)

        elif mode == "time_only":
            pantalla_hora()

        elif mode == "custom":
            pantalla_custom(cfg)

        else:  # sensors_time
            sensors_s = max(1, int(cfg.get("cycle_sensors_s", 5)))
            time_s    = max(1, int(cfg.get("cycle_time_s",    3)))
            ciclo     = tick % (sensors_s + time_s)
            if ciclo < sensors_s:
                pantalla_sensores(t_val, h_val, anomalia)
            else:
                pantalla_hora()

        tick += 1
        time.sleep(1)

except KeyboardInterrupt:
    lcd.clear()
