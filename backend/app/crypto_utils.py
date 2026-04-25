# app/crypto_utils.py
import os
from cryptography.fernet import Fernet, InvalidToken

_key_b64 = os.getenv("MASTER_KEY", "")
if not _key_b64:
    raise RuntimeError("MASTER_KEY no configurada en .env")

try:
    _f = Fernet(_key_b64.encode())
except Exception as e:
    raise RuntimeError("MASTER_KEY inválida (debe ser base64 de Fernet)") from e

def encrypt_str(s: str) -> str:
    """Devuelve texto cifrado (base64 urlsafe)"""
    if s is None:
        s = ""
    return _f.encrypt(s.encode("utf-8")).decode("utf-8")

def decrypt_str(s: str) -> str:
    """Devuelve texto plano a partir de un cifrado válido"""
    if not s:
        return ""
    try:
        return _f.decrypt(s.encode("utf-8")).decode("utf-8")
    except InvalidToken as e:
        raise ValueError("Cipher inválido o clave incorrecta") from e
