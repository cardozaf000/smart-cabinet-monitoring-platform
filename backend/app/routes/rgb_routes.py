from flask import Blueprint, request, jsonify
import json

from app.mqtt_client import publish_mqtt

rgb_bp = Blueprint("rgb", __name__)


@rgb_bp.route("/led_cmd", methods=["POST", "OPTIONS"])
def led_cmd():
    if request.method == "OPTIONS":
        return "", 200
    data = request.get_json(silent=True) or {}

    mode        = data.get("mode", "off")
    rgb         = data.get("rgb", [0, 0, 0])
    gabinete_id = data.get("gabinete_id", "cab-1")

    # Extraer R, G, B del array [r, g, b]
    def clamp(v):
        try:
            return max(0, min(255, int(v)))
        except (TypeError, ValueError):
            return 0

    r = clamp(rgb[0]) if len(rgb) > 0 else 0
    g = clamp(rgb[1]) if len(rgb) > 1 else 0
    b = clamp(rgb[2]) if len(rgb) > 2 else 0

    if mode == "off":
        r = g = b = 0

    topic   = f"actuadores/{gabinete_id}/rgb"
    payload = json.dumps({"r": r, "g": g, "b": b})

    ok = publish_mqtt(topic, payload)

    print(f"[RGB] topic={topic}  r={r} g={g} b={b}  mqtt={'ok' if ok else 'sin conexión'}")

    if ok:
        return jsonify({"status": "ok", "topic": topic, "r": r, "g": g, "b": b})
    else:
        return jsonify({"error": "Broker MQTT no disponible"}), 503
