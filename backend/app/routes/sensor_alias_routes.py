"""
Rutas para gestionar alias (nombres personalizados) de sensores.

SQL ejecutado automáticamente al primer uso:
  CREATE TABLE IF NOT EXISTS sensor_aliases (
    sensor_id  VARCHAR(128) PRIMARY KEY,
    alias      VARCHAR(255) NOT NULL DEFAULT '',
    updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP
  );
"""
from flask import Blueprint, jsonify, request
from app.db_config import get_db_connection
from app.auth_utils import token_required

sensor_alias_bp = Blueprint("sensor_alias_bp", __name__)

# ── Asegurar que la tabla exista ────────────────────────────────────────────
_TABLE_CREATED = False

def _ensure_table(cursor):
    global _TABLE_CREATED
    if _TABLE_CREATED:
        return
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sensor_aliases (
            sensor_id  VARCHAR(128) NOT NULL PRIMARY KEY,
            alias      VARCHAR(255) NOT NULL DEFAULT '',
            updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                       ON UPDATE CURRENT_TIMESTAMP
        )
    """)
    _TABLE_CREATED = True


# ── GET /api/sensores/aliases ───────────────────────────────────────────────
@sensor_alias_bp.get("/api/sensores/aliases")
def get_aliases():
    """Devuelve un dict {sensor_id: alias} con todos los alias guardados."""
    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        _ensure_table(cur)
        db.commit()
        cur.execute("SELECT sensor_id, alias FROM sensor_aliases")
        rows = cur.fetchall()
        return jsonify({r["sensor_id"]: r["alias"] for r in rows if r["alias"]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()


# ── PUT /api/sensores/<sensor_id>/alias ────────────────────────────────────
@sensor_alias_bp.put("/api/sensores/<path:sensor_id>/alias")
@token_required
def set_alias(sensor_id):
    """
    Guarda o actualiza el alias de un sensor.
    Body JSON: {"alias": "Nombre personalizado"}
    Si alias es vacío o null, se elimina el registro (equivale a DELETE).
    """
    data = request.get_json(force=True) or {}
    alias = (data.get("alias") or "").strip()

    db = get_db_connection()
    cur = db.cursor()
    try:
        _ensure_table(cur)
        if not alias:
            cur.execute("DELETE FROM sensor_aliases WHERE sensor_id = %s", (sensor_id,))
        else:
            cur.execute(
                """INSERT INTO sensor_aliases (sensor_id, alias)
                   VALUES (%s, %s)
                   ON DUPLICATE KEY UPDATE alias = %s""",
                (sensor_id, alias, alias)
            )
        db.commit()
        return jsonify({"ok": True, "sensor_id": sensor_id, "alias": alias})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()


# ── DELETE /api/sensores/<sensor_id>/alias ─────────────────────────────────
@sensor_alias_bp.delete("/api/sensores/<path:sensor_id>/alias")
@token_required
def delete_alias(sensor_id):
    """Elimina el alias de un sensor (vuelve al nombre por defecto)."""
    db = get_db_connection()
    cur = db.cursor()
    try:
        _ensure_table(cur)
        cur.execute("DELETE FROM sensor_aliases WHERE sensor_id = %s", (sensor_id,))
        db.commit()
        return jsonify({"ok": True, "sensor_id": sensor_id})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()
