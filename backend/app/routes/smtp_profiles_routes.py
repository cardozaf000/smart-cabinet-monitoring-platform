from flask import Blueprint, request, jsonify
from app.db_config import get_db_connection
from app.crypto_utils import encrypt_str, decrypt_str
import smtplib, ssl
from email.mime.text import MIMEText

smtp_bp = Blueprint("smtp_bp", __name__)

# =======================
# GET: Listar perfiles
# =======================
@smtp_bp.get("/alerts/email_profiles")
def list_profiles():
    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    cur.execute("""
        SELECT id, name, host, port, tls_mode, username, from_name, from_email, enabled, created_at
        FROM smtp_profiles
        ORDER BY id DESC
    """)
    rows = cur.fetchall()
    cur.close()
    db.close()
    return jsonify(rows)

# =======================
# POST: Crear perfil
# =======================
@smtp_bp.post("/alerts/email_profiles")
def create_profile():
    d = request.get_json(force=True)
    required = ["name", "host", "port", "tls_mode", "from_email"]
    if not all(d.get(k) for k in required):
        return jsonify({"error": "Faltan campos obligatorios"}), 400

    try:
        db = get_db_connection()
        cur = db.cursor()

        password_enc = encrypt_str(d["password"]) if d.get("password") else None
        cur.execute("""
            INSERT INTO smtp_profiles
            (name, host, port, tls_mode, username, password_enc, from_name, from_email, enabled)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 1)
        """, (
            d["name"],
            d["host"],
            int(d["port"]),
            d["tls_mode"],
            d.get("username"),
            password_enc,
            d.get("from_name"),
            d["from_email"]
        ))
        db.commit()
        pid = cur.lastrowid
        cur.close()
        db.close()
        return jsonify({"id": pid})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =======================
# PUT: Editar perfil
# =======================
@smtp_bp.put("/alerts/email_profiles/<int:pid>")
def update_profile(pid):
    d = request.get_json(force=True)
    required = ["name", "host", "port", "tls_mode", "from_email"]
    if not all(d.get(k) for k in required):
        return jsonify({"error": "Faltan campos obligatorios"}), 400

    try:
        db = get_db_connection()
        cur = db.cursor()

        # Obtener contraseña actual si no se reenvió una nueva
        cur.execute("SELECT password_enc FROM smtp_profiles WHERE id = %s", (pid,))
        current = cur.fetchone()
        password_enc = encrypt_str(d["password"]) if d.get("password") else (current[0] if current else None)

        cur.execute("""
            UPDATE smtp_profiles SET
                name=%s, host=%s, port=%s, tls_mode=%s,
                username=%s, password_enc=%s,
                from_name=%s, from_email=%s
            WHERE id=%s
        """, (
            d["name"],
            d["host"],
            int(d["port"]),
            d["tls_mode"],
            d.get("username"),
            password_enc,
            d.get("from_name"),
            d["from_email"],
            pid
        ))
        db.commit()
        cur.close()
        db.close()
        return jsonify({"updated": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =======================
# DELETE: Eliminar perfil
# =======================
@smtp_bp.delete("/alerts/email_profiles/<int:pid>")
def delete_profile(pid):
    try:
        db = get_db_connection()
        cur = db.cursor()
        cur.execute("DELETE FROM smtp_profiles WHERE id = %s", (pid,))
        db.commit()
        cur.close()
        db.close()
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Preflight DELETE
@smtp_bp.route("/alerts/email_profiles/<int:pid>", methods=["OPTIONS"])
def options_profile_delete(pid):
    return '', 200

# =======================
# POST: Test de envío SMTP
# =======================
@smtp_bp.post("/alerts/email_profiles/<int:pid>/test")
def test_profile(pid: int):
    d = request.get_json(force=True)
    to = d.get("to")
    subject = d.get("subject", "Test SMTP")
    message = d.get("message", "Correo de prueba desde sistema de monitoreo")
    is_html = d.get("is_html", False)

    if not to:
        return jsonify({"error": "Falta 'to'"}), 400

    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM smtp_profiles WHERE id = %s AND enabled = 1", (pid,))
    p = cur.fetchone()
    cur.close()
    db.close()

    if not p:
        return jsonify({"error": "Perfil no encontrado"}), 404

    try:
        msg = MIMEText(message, "html" if is_html else "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = f"{p['from_name']} <{p['from_email']}>" if p["from_name"] else p["from_email"]
        msg["To"] = to

        ctx = ssl.create_default_context()
        if p["tls_mode"] == "ssl":
            with smtplib.SMTP_SSL(p["host"], p["port"], context=ctx, timeout=20) as s:
                if p["username"]:
                    s.login(p["username"], decrypt_str(p["password_enc"]))
                s.sendmail(p["from_email"], [to], msg.as_string())
        else:
            with smtplib.SMTP(p["host"], p["port"], timeout=20) as s:
                if p["tls_mode"] == "starttls":
                    s.starttls(context=ctx)
                if p["username"]:
                    s.login(p["username"], decrypt_str(p["password_enc"]))
                s.sendmail(p["from_email"], [to], msg.as_string())

        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": f"SMTP: {e}"}), 500
