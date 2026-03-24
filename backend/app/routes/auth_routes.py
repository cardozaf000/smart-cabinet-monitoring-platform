# backend/app/routes/auth_routes.py

from flask import Blueprint, request, jsonify, current_app
from app.db_config import get_db_connection
from app.auth_utils import (
    verificar_password,
    hash_password,
    generar_token,
    detectar_esquema,
    roles_required,
    token_required,
)
from app.audit_utils import log_action

auth_bp = Blueprint("auth", __name__)

# === LOGIN ===
@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "Usuario y contraseña requeridos"}), 400

    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute(
            "SELECT id, username, password_hash, rol FROM usuarios WHERE username=%s",
            (username,)
        )
        user = cur.fetchone()

        if not user or not verificar_password(password, user["password_hash"]):
            log_action("LOGIN_FAILURE", "session", None,
                       {"username_intentado": username}, "error",
                       username="sistema", user_id=None, rol=None)
            return jsonify({"error": "Credenciales inválidas"}), 401

        # Migrar hash si es necesario
        try:
            if detectar_esquema(user["password_hash"]) != "bcrypt":
                new_hash = hash_password(password)
                cur.execute(
                    "UPDATE usuarios SET password_hash=%s WHERE id=%s",
                    (new_hash, user["id"])
                )
                db.commit()
        except Exception as e:
            current_app.logger.warning(f"No se pudo migrar hash de {username}: {e}")

        token = generar_token({
            "id": user["id"],
            "username": user["username"],
            "rol": user["rol"]
        })

        log_action("LOGIN_SUCCESS", "session", None, None, "success",
                   username=user["username"], user_id=user["id"], rol=user["rol"])
        return jsonify({
            "status": "ok",
            "token": token,
            "user": {
                "id": user["id"],
                "username": user["username"],
                "rol": user["rol"]
            }
        }), 200
    finally:
        cur.close()
        db.close()

# === REGISTER ===
@auth_bp.route("/register", methods=["POST"])
@roles_required("admin", "superadmin")
def register():
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    nombre = (data.get("nombre") or username).strip()
    rol = (data.get("rol") or "operador").strip().lower()

    if not username or not password:
        return jsonify({"error": "Usuario y contraseña requeridos"}), 400
    if rol not in {"superadmin", "admin", "operador", "viewer"}:
        return jsonify({"error": "Rol inválido. Use 'superadmin', 'admin', 'operador' o 'viewer'."}), 400

    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("SELECT id FROM usuarios WHERE username=%s", (username,))
        if cur.fetchone():
            return jsonify({"error": "El nombre de usuario ya existe"}), 409

        password_hash = hash_password(password)
        cur.execute(
            "INSERT INTO usuarios (nombre, username, password_hash, rol) VALUES (%s, %s, %s, %s)",
            (nombre, username, password_hash, rol)
        )
        db.commit()

        log_action("CREATE_USER", "user", None,
                   {"nuevo_username": username, "rol": rol})
        return jsonify({"status": "ok", "message": "Usuario creado correctamente"}), 201
    finally:
        cur.close()
        db.close()

# === LISTADO DE USUARIOS ===
@auth_bp.route("/users", methods=["GET"])
@roles_required("admin", "superadmin")
def list_users():
    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("""
            SELECT id, nombre, username, rol, creado_en
            FROM usuarios
            ORDER BY creado_en DESC
        """)
        return jsonify(cur.fetchall())
    finally:
        cur.close()
        db.close()

# === EDITAR USUARIO ===
@auth_bp.route("/users/<int:user_id>", methods=["PUT"])
@roles_required("admin", "superadmin")
def update_user(user_id):
    data = request.get_json(force=True, silent=True) or {}
    username = (data.get("username") or "").strip()
    nombre   = (data.get("nombre")   or "").strip()
    rol      = (data.get("rol")      or "").strip().lower()

    if not username or rol not in {"superadmin", "admin", "operador", "viewer"}:
        return jsonify({"error": "Datos inválidos"}), 400

    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("SELECT id FROM usuarios WHERE id=%s", (user_id,))
        if not cur.fetchone():
            return jsonify({"error": "Usuario no encontrado"}), 404

        cur.execute(
            "UPDATE usuarios SET nombre=%s, username=%s, rol=%s WHERE id=%s",
            (nombre or username, username, rol, user_id)
        )
        db.commit()
        log_action("UPDATE_USER", "user", user_id,
                   {"username": username, "nuevo_rol": rol})
        return jsonify({"status": "ok", "message": "Usuario actualizado"})
    finally:
        cur.close()
        db.close()

# === CAMBIAR CONTRASEÑA (admin) ===
@auth_bp.route("/users/<int:user_id>/password", methods=["PATCH"])
@roles_required("admin", "superadmin")
def reset_user_password(user_id):
    data = request.get_json(force=True, silent=True) or {}
    password = data.get("password") or ""
    if len(password) < 4:
        return jsonify({"error": "La contraseña debe tener al menos 4 caracteres"}), 400

    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("SELECT id FROM usuarios WHERE id=%s", (user_id,))
        if not cur.fetchone():
            return jsonify({"error": "Usuario no encontrado"}), 404

        password_hash = hash_password(password)
        cur.execute("UPDATE usuarios SET password_hash=%s WHERE id=%s", (password_hash, user_id))
        db.commit()
        log_action("RESET_PASSWORD", "user", user_id)
        return jsonify({"status": "ok", "message": "Contraseña actualizada"})
    finally:
        cur.close()
        db.close()

# === ELIMINAR USUARIO ===
@auth_bp.route("/users/<int:user_id>", methods=["DELETE"])
@roles_required("admin", "superadmin")
def delete_user(user_id):
    db = get_db_connection()
    cur = db.cursor(dictionary=True)
    try:
        cur.execute("SELECT id FROM usuarios WHERE id=%s", (user_id,))
        if not cur.fetchone():
            return jsonify({"error": "Usuario no encontrado"}), 404

        cur.execute("DELETE FROM usuarios WHERE id=%s", (user_id,))
        db.commit()
        log_action("DELETE_USER", "user", user_id, None, "warning")
        return jsonify({"status": "ok", "message": "Usuario eliminado"})
    finally:
        cur.close()
        db.close()

# === LOGOUT ===
@auth_bp.route("/logout", methods=["POST"])
@token_required
def logout():
    log_action("LOGOUT", "session", None, None, "success")
    return jsonify({"status": "ok"})
