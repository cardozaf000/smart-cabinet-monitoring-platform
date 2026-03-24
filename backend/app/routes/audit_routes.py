"""
audit_routes.py — Endpoints de auditoría.
Solo accesibles para admin y superadmin.
"""
import csv
import io
import json
from flask import Blueprint, jsonify, request, Response
from app.auth_utils import roles_required
from app.db_config import get_db_connection

audit_bp = Blueprint("audit", __name__)


@audit_bp.route("/audit/logs", methods=["GET"])
@roles_required("admin", "superadmin")
def get_audit_logs():
    """
    GET /audit/logs
    Query params:
      page        — Página (default 1)
      per_page    — Registros por página (default 50, max 200)
      search      — Texto libre (username, action, details)
      action      — Filtrar por código de acción exacto
      status      — success | warning | error
      username    — Filtrar por usuario exacto
      from        — Fecha inicio (YYYY-MM-DD)
      to          — Fecha fin   (YYYY-MM-DD)
    """
    try:
        page     = max(1, int(request.args.get("page", 1)))
        per_page = min(200, max(10, int(request.args.get("per_page", 50))))
        offset   = (page - 1) * per_page

        search       = request.args.get("search",   "").strip()
        action_f     = request.args.get("action",   "").strip()
        status_f     = request.args.get("status",   "").strip()
        username_f   = request.args.get("username", "").strip()
        date_from    = request.args.get("from",     "").strip()
        date_to      = request.args.get("to",       "").strip()

        conditions = []
        params     = []

        if search:
            conditions.append("(username LIKE %s OR action LIKE %s OR COALESCE(details,'') LIKE %s)")
            params += [f"%{search}%", f"%{search}%", f"%{search}%"]
        if action_f:
            conditions.append("action = %s");     params.append(action_f)
        if status_f:
            conditions.append("status = %s");     params.append(status_f)
        if username_f:
            conditions.append("username = %s");   params.append(username_f)
        if date_from:
            conditions.append("timestamp >= %s"); params.append(date_from + " 00:00:00")
        if date_to:
            conditions.append("timestamp <= %s"); params.append(date_to   + " 23:59:59")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        db  = get_db_connection()
        cur = db.cursor(dictionary=True)
        try:
            # Total
            cur.execute(f"SELECT COUNT(*) AS total FROM audit_log {where}", params)
            total = cur.fetchone()["total"]

            # Registros paginados
            cur.execute(
                f"""
                SELECT id, timestamp, username, user_id, rol,
                       action, resource_type, resource_id,
                       details, ip_address, status
                FROM audit_log {where}
                ORDER BY timestamp DESC, id DESC
                LIMIT %s OFFSET %s
                """,
                params + [per_page, offset],
            )
            rows = cur.fetchall()

            for row in rows:
                if row["timestamp"]:
                    row["timestamp"] = row["timestamp"].isoformat()
                if row["details"] and isinstance(row["details"], str):
                    try:
                        row["details"] = json.loads(row["details"])
                    except Exception:
                        pass

            # Estadísticas rápidas (hoy)
            cur.execute(
                """
                SELECT
                    COUNT(*) AS today_total,
                    SUM(status = 'success') AS today_success,
                    SUM(status = 'warning') AS today_warning,
                    SUM(status = 'error')   AS today_error,
                    COUNT(DISTINCT username) AS today_users
                FROM audit_log
                WHERE DATE(timestamp) = CURDATE()
                """
            )
            stats = cur.fetchone() or {}

            # Lista de acciones únicas (para el filtro del frontend)
            cur.execute("SELECT DISTINCT action FROM audit_log ORDER BY action")
            actions = [r["action"] for r in cur.fetchall()]

            # Lista de usuarios únicos (para el filtro)
            cur.execute("SELECT DISTINCT username FROM audit_log ORDER BY username")
            users = [r["username"] for r in cur.fetchall()]

            return jsonify({
                "logs":    rows,
                "total":   total,
                "page":    page,
                "per_page": per_page,
                "pages":   max(1, (total + per_page - 1) // per_page),
                "stats":   stats,
                "filters": {"actions": actions, "users": users},
            })
        finally:
            cur.close()
            db.close()

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@audit_bp.route("/audit/export", methods=["GET"])
@roles_required("admin", "superadmin")
def export_audit_csv():
    """
    GET /audit/export
    Query params (same filters as /audit/logs):
      limit       — Máx registros (default 100, max 5000)
      search, action, status, username, from, to
    Returns a CSV file.
    """
    try:
        limit      = min(5000, max(1, int(request.args.get("limit", 100))))
        search     = request.args.get("search",   "").strip()
        action_f   = request.args.get("action",   "").strip()
        status_f   = request.args.get("status",   "").strip()
        username_f = request.args.get("username", "").strip()
        date_from  = request.args.get("from",     "").strip()
        date_to    = request.args.get("to",       "").strip()

        conditions = []
        params     = []

        if search:
            conditions.append("(username LIKE %s OR action LIKE %s OR COALESCE(details,'') LIKE %s)")
            params += [f"%{search}%", f"%{search}%", f"%{search}%"]
        if action_f:
            conditions.append("action = %s");     params.append(action_f)
        if status_f:
            conditions.append("status = %s");     params.append(status_f)
        if username_f:
            conditions.append("username = %s");   params.append(username_f)
        if date_from:
            conditions.append("timestamp >= %s"); params.append(date_from + " 00:00:00")
        if date_to:
            conditions.append("timestamp <= %s"); params.append(date_to   + " 23:59:59")

        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        db  = get_db_connection()
        cur = db.cursor(dictionary=True)
        try:
            cur.execute(
                f"""
                SELECT id, timestamp, username, rol,
                       action, resource_type, resource_id,
                       details, ip_address, status
                FROM audit_log {where}
                ORDER BY timestamp DESC, id DESC
                LIMIT %s
                """,
                params + [limit],
            )
            rows = cur.fetchall()
        finally:
            cur.close()
            db.close()

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["ID", "Timestamp", "Usuario", "Rol", "Accion",
                         "Recurso", "ID Recurso", "Detalles", "IP", "Estado"])
        for row in rows:
            ts = row["timestamp"].isoformat() if row["timestamp"] else ""
            details_str = ""
            if row["details"]:
                try:
                    details_str = json.dumps(json.loads(row["details"]), ensure_ascii=False)
                except Exception:
                    details_str = str(row["details"])
            writer.writerow([
                row["id"], ts, row["username"], row["rol"],
                row["action"], row["resource_type"], row["resource_id"],
                details_str, row["ip_address"], row["status"],
            ])

        csv_data = output.getvalue()
        return Response(
            csv_data,
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=auditoria.csv"},
        )

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@audit_bp.route("/audit/stats", methods=["GET"])
@roles_required("admin", "superadmin")
def get_audit_stats():
    """Estadísticas generales para el dashboard de auditoría."""
    try:
        db  = get_db_connection()
        cur = db.cursor(dictionary=True)
        try:
            # Actividad por día (últimos 14 días)
            cur.execute(
                """
                SELECT DATE(timestamp) AS dia,
                       COUNT(*) AS total,
                       SUM(status = 'error') AS errores
                FROM audit_log
                WHERE timestamp >= DATE_SUB(CURDATE(), INTERVAL 14 DAY)
                GROUP BY DATE(timestamp)
                ORDER BY dia
                """
            )
            daily = cur.fetchall()
            for d in daily:
                if d["dia"]:
                    d["dia"] = str(d["dia"])

            # Top usuarios más activos
            cur.execute(
                """
                SELECT username, COUNT(*) AS total
                FROM audit_log
                WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY username
                ORDER BY total DESC
                LIMIT 10
                """
            )
            top_users = cur.fetchall()

            # Distribución por tipo de acción
            cur.execute(
                """
                SELECT action, COUNT(*) AS total
                FROM audit_log
                GROUP BY action
                ORDER BY total DESC
                """
            )
            by_action = cur.fetchall()

            return jsonify({
                "daily":     daily,
                "top_users": top_users,
                "by_action": by_action,
            })
        finally:
            cur.close()
            db.close()
    except Exception as e:
        return jsonify({"error": str(e)}), 500
