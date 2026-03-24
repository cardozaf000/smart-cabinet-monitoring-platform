import json
import os
from flask import Blueprint, jsonify, request

branding_bp = Blueprint("branding", __name__)

BRANDING_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "branding.json")

DEFAULT_BRANDING = {
    "login_logo": "",
    "sidebar_logo": "",
    "web_logo": "",
    "app_name": "Sistema de Monitoreo",
}


def load_branding():
    if os.path.exists(BRANDING_PATH):
        with open(BRANDING_PATH) as f:
            return {**DEFAULT_BRANDING, **json.load(f)}
    return dict(DEFAULT_BRANDING)


@branding_bp.route("/branding", methods=["GET"])
def get_branding():
    return jsonify(load_branding())


@branding_bp.route("/branding", methods=["POST"])
def set_branding():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400
    try:
        current = load_branding()
        for key in DEFAULT_BRANDING:
            if key in data:
                current[key] = data[key]
        os.makedirs(os.path.dirname(BRANDING_PATH), exist_ok=True)
        with open(BRANDING_PATH, "w") as f:
            json.dump(current, f, indent=2)
        return jsonify({"ok": True, **current})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
