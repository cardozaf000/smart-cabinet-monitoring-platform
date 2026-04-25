"""
audit_utils.py — Utilidad de auditoría central.
Llama a log_action() desde cualquier ruta para registrar eventos.
Falla silenciosamente para no interrumpir el flujo principal.
"""
import json
from flask import request as flask_request


def log_action(
    action: str,
    resource_type: str = None,
    resource_id=None,
    details: dict = None,
    status: str = "success",
    # Pasar explícitamente cuando no hay token en el request (ej: LOGIN_FAILURE)
    username: str = None,
    user_id: int = None,
    rol: str = None,
):
    """
    Registra un evento en audit_log.

    Parámetros:
        action        — Código del evento (LOGIN_SUCCESS, CREATE_USER, etc.)
        resource_type — Tipo de recurso afectado (user, network, sensor…)
        resource_id   — ID del recurso (puede ser str o int)
        details       — Dict con contexto adicional (se guarda como JSON)
        status        — 'success' | 'warning' | 'error'
        username/user_id/rol — Solo si no se puede inferir del token (ej: login fallido)
    """
    try:
        from app.db_config import get_db_connection

        # Inferir usuario del token si no se pasó explícitamente
        if username is None:
            user = getattr(flask_request, "user", {}) or {}
            username = user.get("username", "sistema")
            user_id  = user.get("id")
            rol      = user.get("rol")

        # IP real (soporte para proxies / Cloudflare)
        ip = (
            flask_request.headers.get("CF-Connecting-IP")
            or flask_request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            or flask_request.remote_addr
            or "—"
        )

        details_json = json.dumps(details, ensure_ascii=False, default=str) if details else None

        db  = get_db_connection()
        cur = db.cursor()
        try:
            cur.execute(
                """
                INSERT INTO audit_log
                    (username, user_id, rol, action, resource_type, resource_id,
                     details, ip_address, status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    username, user_id, rol, action,
                    resource_type, str(resource_id) if resource_id is not None else None,
                    details_json, ip, status,
                ),
            )
            db.commit()
        finally:
            cur.close()
            db.close()

    except Exception:
        pass  # Nunca interrumpir el flujo principal
