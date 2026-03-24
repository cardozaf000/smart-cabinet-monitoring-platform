# backend/app/auth_utils.py
from functools import wraps
from flask import request, jsonify
import os
import bcrypt
import jwt
from datetime import datetime, timedelta
from werkzeug.security import check_password_hash as wz_check

# ===== Config =====
SECRET_KEY = os.getenv("JWT_SECRET", "tesis_monitor_2025")
BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "12"))
JWT_EXPIRES_MIN = int(os.getenv("JWT_EXPIRES_MIN", "120"))
BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")

# ===== Utilidades de contraseña =====
def hash_password(password_plano: str) -> str:
    if not password_plano:
        raise ValueError("Password vacío")
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return bcrypt.hashpw(password_plano.encode("utf-8"), salt).decode("utf-8")

def detectar_esquema(h) -> str:
    hs = h.decode("utf-8") if isinstance(h, (bytes, bytearray)) else str(h or "")
    if hs.startswith(BCRYPT_PREFIXES): return "bcrypt"
    if hs.startswith("pbkdf2:"):       return "pbkdf2"
    if hs.startswith("scrypt:"):       return "scrypt"
    return "unknown"

def verificar_password(password_plano: str, password_hash) -> bool:
    if not password_hash:
        return False
    hs = password_hash if isinstance(password_hash, str) else password_hash.decode("utf-8")
    if hs.startswith(BCRYPT_PREFIXES):
        try:
            return bcrypt.checkpw(password_plano.encode("utf-8"), hs.encode("utf-8"))
        except ValueError:
            return False  # hash corrupto/truncado
    # Fallback a pbkdf2/scrypt de Werkzeug
    try:
        return wz_check(hs, password_plano)
    except Exception:
        return False

# ===== JWT =====
def generar_token(user_dict: dict, minutes: int = JWT_EXPIRES_MIN) -> str:
    now = datetime.utcnow()
    payload = {"user": user_dict, "iat": now, "exp": now + timedelta(minutes=minutes)}
    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    return token if isinstance(token, str) else token.decode("utf-8")

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            auth_header = request.headers["Authorization"]
            if auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1]
        if not token:
            return jsonify({"error": "Token requerido"}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            request.user = data["user"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expirado"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Token inválido"}), 401
        return f(*args, **kwargs)
    return decorated

# ===== Control de acceso por rol =====
def roles_required(*roles_permitidos):
    """
    Uso:
      @roles_required("admin")
      @roles_required("admin", "supervisor")

    Valida JWT y exige que request.user['rol'] esté en roles_permitidos.
    """
    roles_norm = {str(r).strip().lower() for r in roles_permitidos if r is not None}

    def outer(f):
        @wraps(f)
        @token_required  # primero valida el token y rellena request.user
        def decorated(*args, **kwargs):
            user = getattr(request, "user", {}) or {}
            rol = str(user.get("rol", "")).lower()
            if roles_norm and rol not in roles_norm:
                return jsonify({"error": "No autorizado: rol insuficiente"}), 403
            return f(*args, **kwargs)
        return decorated
    return outer

__all__ = [
    "hash_password",
    "verificar_password",
    "generar_token",
    "token_required",
    "detectar_esquema",
    "roles_required",
]
