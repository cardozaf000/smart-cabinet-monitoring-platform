# backend/app/email_test.py

import os, ssl, smtplib, datetime
from email.message import EmailMessage
from flask import Blueprint, request, jsonify
import jwt

email_bp = Blueprint("email", __name__)

JWT_SECRET = os.environ.get("JWT_SECRET", "clave_secreta_default")
JWT_ALG = "HS256"

def require_auth(f):
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"ok": False, "error": "Token requerido"}), 401
        token = auth.split(" ", 1)[1]
        try:
            jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        except Exception as e:
            return jsonify({"ok": False, "error": f"Token inválido: {e}"}), 401
        return f(*args, **kwargs)
    return wrapper

def _send_email(profile, to_addr, subject, message, is_html=False):
    msg = EmailMessage()
    msg["From"] = profile["from_email"]
    msg["To"] = to_addr
    msg["Subject"] = subject

    if is_html:
        msg.set_content("Este cliente no soporta HTML.")
        msg.add_alternative(message, subtype="html")
    else:
        msg.set_content(message)

    if profile["tls"] == "ssl":
        with smtplib.SMTP_SSL(profile["host"], int(profile["port"])) as server:
            server.login(profile["username"], profile["password"])
            server.send_message(msg)
    else:
        with smtplib.SMTP(profile["host"], int(profile["port"])) as server:
            if profile["tls"] == "starttls":
                server.starttls()
            server.login(profile["username"], profile["password"])
            server.send_message(msg)

@email_bp.route("/api/test_email", methods=["POST"])
@require_auth
def test_email():
    try:
        data = request.get_json(force=True)

        profile = data.get("profile")
        if not profile:
            return jsonify({"ok": False, "error": "Falta 'profile'"}), 400

        required = ["host", "port", "username", "password", "from_email", "tls"]
        for k in required:
            if not profile.get(k):
                return jsonify({"ok": False, "error": f"Falta campo: {k}"}), 400

        to = data.get("to")
        subject = data.get("subject", "Prueba de alerta")
        message = data.get("message", "Este es un mensaje de prueba.")
        is_html = data.get("is_html", False)

        _send_email(profile, to, subject, message, is_html)

        return jsonify({
            "ok": True,
            "sent_at": datetime.datetime.utcnow().isoformat() + "Z"
        })

    except smtplib.SMTPAuthenticationError:
        return jsonify({"ok": False, "error": "Error de autenticación SMTP"}), 401
    except Exception as e:
        return jsonify({"ok": False, "error": f"Error: {str(e)}"}), 500
