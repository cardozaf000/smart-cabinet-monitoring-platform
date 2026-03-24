"""
Rutas de Backup y Restauración del sistema.

GET  /api/backup         → Exporta configuración completa como JSON
POST /api/restore        → Importa (reemplaza) configuración desde JSON
"""
from flask import Blueprint, request, jsonify
from app.db_config import get_db_connection
from app.auth_utils import token_required
from app.audit_utils import log_action
from datetime import datetime
import json

backup_bp = Blueprint("backup_bp", __name__)

BACKUP_VERSION = "1.0"


# ─────────────────────────────────────────────
# EXPORT
# ─────────────────────────────────────────────
@backup_bp.get("/api/backup")
@token_required
def export_backup():
    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        # Gabinetes
        cur.execute("SELECT id, name, location, status FROM gabinetes")
        gabinetes = cur.fetchall()

        # Dashboard widgets (con columnas de grid)
        cur.execute("SELECT * FROM dashboard_widgets")
        widgets = cur.fetchall()
        for w in widgets:
            if isinstance(w.get("time_range"), str):
                try:
                    w["time_range"] = json.loads(w["time_range"])
                except Exception:
                    w["time_range"] = {}

        # Reglas de alerta
        cur.execute("SELECT * FROM alert_rules ORDER BY id")
        alert_rules = cur.fetchall()
        for r in alert_rules:
            for col in ("channels_json", "scope"):
                if col in r and isinstance(r[col], (bytes, bytearray)):
                    r[col] = r[col].decode()

        # Perfiles SMTP (sin password)
        try:
            cur.execute(
                "SELECT id, name, host, port, tls_mode, username, from_name, from_email, enabled FROM smtp_profiles ORDER BY id"
            )
            smtp_profiles = cur.fetchall()
        except Exception:
            smtp_profiles = []

        log_action("EXPORT_BACKUP", "sistema", None, {"tablas": ["gabinetes", "widgets", "alert_rules", "smtp_profiles"]})

        return jsonify({
            "version":     BACKUP_VERSION,
            "exported_at": datetime.now().isoformat(timespec="seconds"),
            "gabinetes":   gabinetes,
            "widgets":     widgets,
            "alert_rules": alert_rules,
            "smtp_profiles": smtp_profiles,
        })

    except Exception as e:
        print("❌ Error al exportar backup:", e)
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()


# ─────────────────────────────────────────────
# IMPORT / RESTORE
# ─────────────────────────────────────────────
@backup_bp.post("/api/restore")
@token_required
def import_backup():
    data = request.get_json(force=True) or {}

    if data.get("version") != BACKUP_VERSION:
        return jsonify({"error": f"Versión no compatible: {data.get('version')}"}), 400

    db = get_db_connection()
    cur = db.cursor()
    results = {}

    try:
        # ── Gabinetes ──
        gabinetes = data.get("gabinetes", [])
        for g in gabinetes:
            if not g.get("id"):
                continue
            cur.execute(
                """INSERT INTO gabinetes (id, name, location, status)
                   VALUES (%s, %s, %s, %s)
                   ON DUPLICATE KEY UPDATE name=%s, location=%s, status=%s""",
                (g["id"], g.get("name",""), g.get("location",""), g.get("status","OK"),
                 g.get("name",""), g.get("location",""), g.get("status","OK"))
            )
        results["gabinetes"] = len(gabinetes)

        # ── Widgets ──
        widgets = data.get("widgets", [])
        for w in widgets:
            if not w.get("id"):
                continue
            cur.execute(
                """INSERT INTO dashboard_widgets
                   (id, title, chart_type, measure, sensor_scope, sensor_id,
                    agg, time_range, max_points, decimals, unit_override, pinned,
                    col_span, gx, gy, gw, gh)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON DUPLICATE KEY UPDATE
                     title=%s, chart_type=%s, measure=%s, sensor_scope=%s,
                     sensor_id=%s, agg=%s, time_range=%s, max_points=%s,
                     decimals=%s, unit_override=%s, pinned=%s,
                     col_span=%s, gx=%s, gy=%s, gw=%s, gh=%s""",
                (
                    w["id"], w.get("title",""), w.get("chart_type","line"), w.get("measure",""),
                    w.get("sensor_scope","any"), w.get("sensor_id",""), w.get("agg","none"),
                    json.dumps(w.get("time_range", {})),
                    w.get("max_points", 200), w.get("decimals", 2), w.get("unit_override",""),
                    int(bool(w.get("pinned", False))),
                    w.get("col_span", 1), w.get("gx"), w.get("gy"), w.get("gw"), w.get("gh"),
                    # ON DUPLICATE KEY UPDATE values
                    w.get("title",""), w.get("chart_type","line"), w.get("measure",""),
                    w.get("sensor_scope","any"), w.get("sensor_id",""), w.get("agg","none"),
                    json.dumps(w.get("time_range", {})),
                    w.get("max_points", 200), w.get("decimals", 2), w.get("unit_override",""),
                    int(bool(w.get("pinned", False))),
                    w.get("col_span", 1), w.get("gx"), w.get("gy"), w.get("gw"), w.get("gh"),
                )
            )
        results["widgets"] = len(widgets)

        # ── Reglas de alerta ──
        alert_rules = data.get("alert_rules", [])
        for r in alert_rules:
            if not r.get("name"):
                continue
            channels = r.get("channels_json", "[]")
            if isinstance(channels, (list, dict)):
                channels = json.dumps(channels)
            cur.execute(
                """INSERT INTO alert_rules
                   (name, scope, selector, metric, op, threshold, duration_sec, severity, channels_json, enabled)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON DUPLICATE KEY UPDATE
                     scope=%s, selector=%s, metric=%s, op=%s, threshold=%s,
                     duration_sec=%s, severity=%s, channels_json=%s, enabled=%s""",
                (
                    r["name"], r.get("scope","any"), r.get("selector",""), r.get("metric",""),
                    r.get("op",">"), r.get("threshold", 0), r.get("duration_sec", 60),
                    r.get("severity","warning"), channels, int(bool(r.get("enabled", True))),
                    r.get("scope","any"), r.get("selector",""), r.get("metric",""),
                    r.get("op",">"), r.get("threshold", 0), r.get("duration_sec", 60),
                    r.get("severity","warning"), channels, int(bool(r.get("enabled", True))),
                )
            )
        results["alert_rules"] = len(alert_rules)

        db.commit()
        log_action("IMPORT_BACKUP", "sistema", None, results)
        return jsonify({"ok": True, "restored": results})

    except Exception as e:
        db.rollback()
        print("❌ Error al restaurar backup:", e)
        return jsonify({"error": str(e)}), 500
    finally:
        cur.close(); db.close()
