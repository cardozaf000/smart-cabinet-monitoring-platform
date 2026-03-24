"""
Rutas para gabinetes persistidos en BD.

SQL a ejecutar una sola vez en el servidor:
  CREATE TABLE IF NOT EXISTS gabinetes (
    id          VARCHAR(64)  PRIMARY KEY,
    name        VARCHAR(255) NOT NULL DEFAULT '',
    location    VARCHAR(255)          DEFAULT '',
    status      VARCHAR(32)           DEFAULT 'OK',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
"""
from flask import Blueprint, request, jsonify
from app.db_config import get_db_connection
from app.auth_utils import token_required
from app.audit_utils import log_action

cabinets_bp = Blueprint("cabinets_bp", __name__)


@cabinets_bp.get("/api/gabinetes")
def list_cabinets():
    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("SELECT id, name, location, status FROM gabinetes ORDER BY created_at")
        return jsonify(cur.fetchall())
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()


@cabinets_bp.post("/api/gabinetes")
@token_required
def create_cabinet():
    d = request.get_json(force=True) or {}
    if not d.get("id") or not d.get("name"):
        return jsonify({"error": "id y name son requeridos"}), 400
    db = get_db_connection()
    cur = db.cursor()
    try:
        cur.execute(
            """INSERT INTO gabinetes (id, name, location, status)
               VALUES (%s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE name=%s, location=%s, status=%s""",
            (d["id"], d["name"], d.get("location", ""), d.get("status", "OK"),
             d["name"], d.get("location", ""), d.get("status", "OK"))
        )
        db.commit()
        log_action("CREATE_CABINET", "gabinete", d["id"], {"name": d["name"]})
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()


@cabinets_bp.put("/api/gabinetes/<cabinet_id>")
@token_required
def update_cabinet(cabinet_id):
    d = request.get_json(force=True) or {}
    db = get_db_connection()
    cur = db.cursor()
    try:
        cur.execute(
            "UPDATE gabinetes SET name=%s, location=%s, status=%s WHERE id=%s",
            (d.get("name", ""), d.get("location", ""), d.get("status", "OK"), cabinet_id)
        )
        db.commit()
        log_action("UPDATE_CABINET", "gabinete", cabinet_id, {"name": d.get("name")})
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()


@cabinets_bp.delete("/api/gabinetes/<cabinet_id>")
@token_required
def delete_cabinet(cabinet_id):
    db = get_db_connection()
    cur = db.cursor()
    try:
        cur.execute("DELETE FROM gabinetes WHERE id=%s", (cabinet_id,))
        db.commit()
        log_action("DELETE_CABINET", "gabinete", cabinet_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()
