from flask import Blueprint, jsonify
from datetime import datetime
from app.system_monitor import get_system_snapshot
from app.alerts_engine import evaluate_new_reading
import socket  # <- Import necesario para obtener IP local

system_bp = Blueprint("system", __name__)

@system_bp.route("/system/snapshot", methods=["GET"])
def system_snapshot():
    """
    Devuelve el snapshot del RPi (temperatura CPU, uso CPU, uso memoria)
    y además evalúa reglas de alertas para esos 3 'sensores lógicos':
      - rpi.cpu_temp   (tipo: 'temperatura')
      - rpi.cpu_usage  (tipo: 'cpu')
      - rpi.mem_usage  (tipo: 'memoria')
    """
    snap = get_system_snapshot()

    # Disparador de alertas (MVP en memoria)
    try:
        medidas = snap.get("medidas", {}) or {}
        gab = snap.get("gabinete_id") or snap.get("gabinete") or "gab-rpi"
        ts = datetime.utcnow()

        # Temperatura CPU
        cpu_t = medidas.get("cpu_temp") or {}
        if "valor" in cpu_t:
            evaluate_new_reading({
                "sensor_id": "rpi.cpu_temp",
                "tipo": "temperatura",
                "valor": float(cpu_t["valor"]),
                "ts": ts,
                "gabinete_id": gab,
            })

        # Uso de CPU
        cpu_u = medidas.get("cpu_usage") or {}
        if "valor" in cpu_u:
            evaluate_new_reading({
                "sensor_id": "rpi.cpu_usage",
                "tipo": "cpu",
                "valor": float(cpu_u["valor"]),
                "ts": ts,
                "gabinete_id": gab,
            })

        # Uso de Memoria
        mem_u = medidas.get("mem_usage") or {}
        if "valor" in mem_u:
            evaluate_new_reading({
                "sensor_id": "rpi.mem_usage",
                "tipo": "memoria",
                "valor": float(mem_u["valor"]),
                "ts": ts,
                "gabinete_id": gab,
            })
    except Exception as e:
        print(f"[alerts] system snapshot eval error: {e}")

    return jsonify(snap)

@system_bp.route("/ip_local", methods=["GET"])
def obtener_ip_local():
    """
    Devuelve la IP local del Raspberry Pi que será usada como IP del broker MQTT.
    """
    try:
        hostname = socket.gethostname()
        ip_local = socket.gethostbyname(hostname)
        return jsonify({"ip_local": ip_local})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
