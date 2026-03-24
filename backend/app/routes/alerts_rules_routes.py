from flask import Blueprint, request, jsonify
from app.db_config import get_db_connection
from app.auth_utils import token_required
from app.audit_utils import log_action
import json

alerts_rules_bp = Blueprint("alerts_rules_bp", __name__)

@alerts_rules_bp.get("/alerts/rules")
def list_rules():
    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM alert_rules ORDER BY id DESC")
    rows = cur.fetchall()
    cur.close()
    db.close()
    return jsonify(rows)

@alerts_rules_bp.post("/alerts/rules")
@token_required
def create_rule():
    d = request.get_json(force=True)
    return insert_or_update_rule(d)

@alerts_rules_bp.put("/alerts/rules/<int:rule_id>")
@token_required
def update_rule(rule_id):
    d = request.get_json(force=True)
    return insert_or_update_rule(d, rule_id)

@alerts_rules_bp.delete("/alerts/rules/<int:rule_id>")
@token_required
def delete_rule(rule_id):
    try:
        db = get_db_connection()
        cur = db.cursor()
        cur.execute("DELETE FROM alert_rules WHERE id = %s", (rule_id,))
        db.commit()
        cur.close()
        db.close()
        log_action("DELETE_ALERT_RULE", "alert_rule", rule_id, status="warning")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# --- Reutilizable para crear o editar ---
def insert_or_update_rule(d, rule_id=None):
    required = ["name", "scope", "selector", "metric", "op", "threshold", "duration_sec", "severity", "channels_json"]
    if not all(k in d for k in required):
        return jsonify({"error": "faltan campos"}), 400

    # === Procesar channels_json ===
    ch = d.get("channels_json", {})
    if isinstance(ch, str):
        try:
            ch = json.loads(ch)
        except:
            return jsonify({"error": "channels_json inválido"}), 400

    # Permitir que frontend envíe directamente smtp_profile_id y email_to
    if "email" not in ch:
        ch["email"] = {}

    if "smtp_profile_id" in d:
        try:
            ch["email"]["profile_id"] = int(d["smtp_profile_id"])
        except:
            return jsonify({"error": "smtp_profile_id inválido"}), 400

    if "email_to" in d:
        if isinstance(d["email_to"], str):
            ch["email"]["to"] = [x.strip() for x in d["email_to"].split(",") if x.strip()]
        elif isinstance(d["email_to"], list):
            ch["email"]["to"] = [x.strip() for x in d["email_to"] if x.strip()]
        else:
            return jsonify({"error": "email_to debe ser lista o texto"}), 400

    db = get_db_connection()
    cur = db.cursor()
    try:
        if rule_id is None:
            # CREAR
            cur.execute("""
                INSERT INTO alert_rules
                (name, enabled, scope, selector, metric, op, threshold, duration_sec,
                 hysteresis, cooldown_sec, severity, channels_json)
                VALUES (%s, 1, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s)
            """, (
                d["name"], d["scope"], d["selector"], d["metric"], d["op"],
                float(d["threshold"]), int(d["duration_sec"]),
                float(d.get("hysteresis", 0)), int(d.get("cooldown_sec", 600)),
                d["severity"], json.dumps(ch)
            ))
            db.commit()
            new_id = cur.lastrowid
            log_action("CREATE_ALERT_RULE", "alert_rule", new_id,
                       {"name": d["name"], "metric": d["metric"], "severity": d["severity"]})
            return jsonify({"id": new_id})
        else:
            # ACTUALIZAR
            cur.execute("""
                UPDATE alert_rules SET
                  name = %s,
                  scope = %s,
                  selector = %s,
                  metric = %s,
                  op = %s,
                  threshold = %s,
                  duration_sec = %s,
                  hysteresis = %s,
                  cooldown_sec = %s,
                  severity = %s,
                  channels_json = %s
                WHERE id = %s
            """, (
                d["name"], d["scope"], d["selector"], d["metric"], d["op"],
                float(d["threshold"]), int(d["duration_sec"]),
                float(d.get("hysteresis", 0)), int(d.get("cooldown_sec", 600)),
                d["severity"], json.dumps(ch),
                rule_id
            ))
            db.commit()
            log_action("UPDATE_ALERT_RULE", "alert_rule", rule_id,
                       {"name": d["name"], "metric": d["metric"], "severity": d["severity"]})
            return jsonify({"id": rule_id})
    except Exception as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close()
        db.close()

# CORS preflight para PUT y DELETE
@alerts_rules_bp.route("/alerts/rules/<int:rule_id>", methods=["OPTIONS"])
def options_rule(rule_id):
    return '', 200
