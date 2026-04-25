from flask import Blueprint, request, jsonify
from app.db_config import get_db_connection
from app.auth_utils import token_required
from app.audit_utils import log_action

themes_bp = Blueprint("themes", __name__)

# Obtener todos los temas
@themes_bp.route("/themes", methods=["GET"])
def get_themes():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM themes")
    themes = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(themes)

# Crear tema
@themes_bp.route("/themes", methods=["POST"])
@token_required
def create_theme():
    data = request.json
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO themes (key_name, name, logo, primary_color, bg_color, accent_color)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (
        data["key_name"],
        data["name"],
        data.get("logo", ""),
        data["primaryColor"],
        data["bgColor"],
        data["accentColor"],
    ))

    conn.commit()
    cursor.close()
    conn.close()
    log_action("CREATE_THEME", "theme", data.get("key_name"), {"name": data.get("name")})
    return jsonify({"message": "Tema creado"}), 201

# Eliminar tema
@themes_bp.route("/themes/<key_name>", methods=["DELETE"])
@token_required
def delete_theme(key_name):
    if key_name == "default":
        return jsonify({"error": "No se puede eliminar el tema por defecto"}), 400
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM themes WHERE key_name=%s", (key_name,))
    conn.commit()
    cursor.close()
    conn.close()
    log_action("DELETE_THEME", "theme", key_name, status="warning")
    return jsonify({"message": "Tema eliminado"})
