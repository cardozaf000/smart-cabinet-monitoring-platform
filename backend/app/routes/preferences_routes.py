"""
Preferencias por usuario (tema, modo, tema custom).

SQL a ejecutar una sola vez:
  CREATE TABLE IF NOT EXISTS user_preferences (
    user_id      INT         NOT NULL,
    theme_key    VARCHAR(64) NOT NULL DEFAULT 'default',
    theme_mode   VARCHAR(16) NOT NULL DEFAULT 'dark',
    custom_theme JSON                 DEFAULT NULL,
    updated_at   TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
                             ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""
from flask import Blueprint, request, jsonify
from app.db_config import get_db_connection
from app.auth_utils import token_required
import json

preferences_bp = Blueprint("preferences_bp", __name__)


@preferences_bp.get("/api/preferences")
@token_required
def get_preferences():
    user_id = request.user.get("id")
    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("SELECT theme_key, theme_mode, custom_theme FROM user_preferences WHERE user_id=%s", (user_id,))
        row = cur.fetchone()
        if not row:
            return jsonify({"saved": False})
        ct = row.get("custom_theme")
        if isinstance(ct, str):
            try: ct = json.loads(ct)
            except Exception: ct = None
        return jsonify({"saved": True, "themeKey": row["theme_key"], "themeMode": row["theme_mode"], "customTheme": ct})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()


@preferences_bp.put("/api/preferences")
@token_required
def save_preferences():
    user_id = request.user.get("id")
    d = request.get_json(force=True) or {}
    db = get_db_connection()
    cur = db.cursor()
    try:
        ct = d.get("customTheme")
        cur.execute(
            """INSERT INTO user_preferences (user_id, theme_key, theme_mode, custom_theme)
               VALUES (%s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE theme_key=%s, theme_mode=%s, custom_theme=%s""",
            (user_id, d.get("themeKey","default"), d.get("themeMode","dark"),
             json.dumps(ct) if ct else None,
             d.get("themeKey","default"), d.get("themeMode","dark"),
             json.dumps(ct) if ct else None)
        )
        db.commit()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()
