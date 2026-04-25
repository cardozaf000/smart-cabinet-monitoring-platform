import json
import os
from flask import Blueprint, jsonify, request

display_bp = Blueprint("display", __name__)

DISPLAY_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "display_config.json")

DEFAULT_CONFIG = {
    "tft": {
        "enabled": True,
        "mode": "sensor_data",
        "rotation_cw": 90,
        "rotation_fine": 0,
        "custom_lines": ["", "", ""],
    },
    "lcd": {
        "enabled": True,
        "mode": "sensors_time",
        "custom_line1": "",
        "custom_line2": "",
        "cycle_sensors_s": 5,
        "cycle_time_s": 3,
    },
}


def load_config():
    if os.path.exists(DISPLAY_PATH):
        with open(DISPLAY_PATH) as f:
            data = json.load(f)
        cfg = {**DEFAULT_CONFIG}
        if "tft" in data:
            cfg["tft"] = {**DEFAULT_CONFIG["tft"], **data["tft"]}
        if "lcd" in data:
            cfg["lcd"] = {**DEFAULT_CONFIG["lcd"], **data["lcd"]}
        return cfg
    return dict(DEFAULT_CONFIG)


@display_bp.route("/display/config", methods=["GET"])
def get_display_config():
    return jsonify(load_config())


@display_bp.route("/display/config", methods=["POST"])
def set_display_config():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "JSON requerido"}), 400
    cfg = load_config()
    if "tft" in data:
        cfg["tft"] = {**cfg["tft"], **data["tft"]}
    if "lcd" in data:
        cfg["lcd"] = {**cfg["lcd"], **data["lcd"]}
    with open(DISPLAY_PATH, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    return jsonify({"ok": True})
