"""
incidents_routes.py — Endpoints para incidentes de alertas disparadas.
"""
import json
from flask import Blueprint, jsonify, request
from app.auth_utils import token_required
from app.db_config import get_db_connection
from app.audit_utils import log_action

incidents_bp = Blueprint("incidents", __name__)


@incidents_bp.route("/alerts/incidents", methods=["GET"])
@token_required
def list_incidents():
    """
    GET /alerts/incidents
    Params: page, per_page, status (active|resolved|acknowledged),
            severity, rule_id, sensor_id, from, to
    """
    try:
        page     = max(1, int(request.args.get("page", 1)))
        per_page = min(200, max(10, int(request.args.get("per_page", 50))))
        offset   = (page - 1) * per_page

        status_f   = request.args.get("status",    "").strip()
        severity_f = request.args.get("severity",  "").strip()
        rule_id_f  = request.args.get("rule_id",   "").strip()
        sensor_f   = request.args.get("sensor_id", "").strip()
        date_from  = request.args.get("from",      "").strip()
        date_to    = request.args.get("to",        "").strip()

        conditions, params = [], []

        if status_f:   conditions.append("status = %s");     params.append(status_f)
        if severity_f: conditions.append("severity = %s");   params.append(severity_f)
        if rule_id_f:  conditions.append("rule_id = %s");    params.append(rule_id_f)
        if sensor_f:   conditions.append("sensor_id LIKE %s"); params.append(f"%{sensor_f}%")
        if date_from:  conditions.append("fired_at >= %s");  params.append(date_from + " 00:00:00")
        if date_to:    conditions.append("fired_at <= %s");  params.append(date_to   + " 23:59:59")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        db  = get_db_connection()
        cur = db.cursor(dictionary=True)
        try:
            cur.execute(f"SELECT COUNT(*) AS total FROM alert_incidents {where}", params)
            total = cur.fetchone()["total"]

            cur.execute(
                f"""
                SELECT id, rule_id, rule_name, sensor_id, metric, severity,
                       value, threshold, op, status, message,
                       fired_at, resolved_at, ack_by, ack_at
                FROM alert_incidents {where}
                ORDER BY fired_at DESC, id DESC
                LIMIT %s OFFSET %s
                """,
                params + [per_page, offset],
            )
            rows = cur.fetchall()
            for row in rows:
                for col in ("fired_at", "resolved_at", "ack_at"):
                    if row.get(col):
                        row[col] = row[col].isoformat()

            # Stats rápidas
            cur.execute("""
                SELECT
                    SUM(status='active')       AS active,
                    SUM(status='resolved')     AS resolved,
                    SUM(status='acknowledged') AS acknowledged,
                    SUM(severity='critical' AND status='active') AS critical_active,
                    SUM(severity='warning'  AND status='active') AS warning_active
                FROM alert_incidents
            """)
            stats = cur.fetchone() or {}

            return jsonify({
                "incidents": rows,
                "total":     total,
                "page":      page,
                "per_page":  per_page,
                "pages":     max(1, (total + per_page - 1) // per_page),
                "stats":     stats,
            })
        finally:
            cur.close(); db.close()

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@incidents_bp.route("/alerts/incidents/<int:inc_id>/ack", methods=["POST"])
@token_required
def acknowledge_incident(inc_id):
    """Reconocer (acknowledge) un incidente activo."""
    try:
        user = getattr(request, "user", {}) or {}
        ack_by = user.get("username", "desconocido")

        db  = get_db_connection()
        cur = db.cursor()
        try:
            from datetime import datetime
            cur.execute(
                """
                UPDATE alert_incidents
                SET status='acknowledged', ack_by=%s, ack_at=%s
                WHERE id=%s AND status='active'
                """,
                (ack_by, datetime.utcnow(), inc_id),
            )
            db.commit()
            if cur.rowcount == 0:
                return jsonify({"error": "Incidente no encontrado o ya reconocido"}), 404
            log_action("ACK_INCIDENT", "incident", inc_id, {"ack_by": ack_by})
            return jsonify({"ok": True})
        finally:
            cur.close(); db.close()

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@incidents_bp.route("/alerts/incidents/<int:inc_id>/resolve", methods=["POST"])
@token_required
def resolve_incident(inc_id):
    """Resolver manualmente un incidente."""
    try:
        db  = get_db_connection()
        cur = db.cursor()
        try:
            from datetime import datetime
            cur.execute(
                "UPDATE alert_incidents SET status='resolved', resolved_at=%s WHERE id=%s",
                (datetime.utcnow(), inc_id),
            )
            db.commit()
            log_action("RESOLVE_INCIDENT", "incident", inc_id, status="warning")
            return jsonify({"ok": True})
        finally:
            cur.close(); db.close()

    except Exception as e:
        return jsonify({"error": str(e)}), 500
