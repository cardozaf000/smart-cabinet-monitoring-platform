from flask import Blueprint, request, jsonify
import json
import os

from app.mqtt_client import publish_mqtt

rgb_bp = Blueprint("rgb", __name__)

_ALERT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), '..', 'led_alert_config.json')


def _load_alert_config():
    try:
        with open(_ALERT_CONFIG_PATH, 'r') as f:
            return json.load(f)
    except Exception:
        return {}


def _save_alert_config(data):
    with open(_ALERT_CONFIG_PATH, 'w') as f:
        json.dump(data, f, indent=2)


def _parse_body():
    data = request.get_json(silent=True)
    if data is None:
        try:
            data = json.loads(request.get_data(as_text=True) or '{}')
        except Exception:
            data = {}
    return data


@rgb_bp.route("/led_cmd", methods=["POST", "OPTIONS"])
def led_cmd():
    if request.method == "OPTIONS":
        from flask import make_response
        resp = make_response("", 200)
        origin = request.headers.get("Origin", "*")
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Cache-Control"
        resp.headers["Access-Control-Max-Age"] = "600"
        resp.headers["Vary"] = "Origin"
        return resp

    data = _parse_body()

    mode        = data.get("mode", "off")
    rgb         = data.get("rgb", [0, 0, 0])
    gabinete_id = data.get("gabinete_id", "cab-1")
    period_ms   = data.get("period_ms", 500)

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

    topic = f"actuadores/{gabinete_id}/rgb"
    payload = json.dumps({
        "r": r, "g": g, "b": b,
        "mode": mode,
        "period_ms": period_ms,
    })

    ok = publish_mqtt(topic, payload)

    print(f"[RGB] topic={topic}  mode={mode}  r={r} g={g} b={b}  mqtt={'ok' if ok else 'sin conexión'}")

    if ok:
        return jsonify({"status": "ok", "topic": topic, "mode": mode, "r": r, "g": g, "b": b})
    else:
        return jsonify({"error": "Broker MQTT no disponible"}), 503


@rgb_bp.route("/led_alert_config", methods=["GET", "POST", "OPTIONS"])
def led_alert_config():
    if request.method == "OPTIONS":
        from flask import make_response
        resp = make_response("", 200)
        origin = request.headers.get("Origin", "*")
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Cache-Control"
        resp.headers["Access-Control-Max-Age"] = "600"
        resp.headers["Vary"] = "Origin"
        return resp

    if request.method == "GET":
        return jsonify(_load_alert_config())

    data = _parse_body()
    try:
        _save_alert_config(data)
        print(f"[RGB] led_alert_config guardado: {len(data.get('alert_bindings', []))} bindings")
        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
