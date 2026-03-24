from flask import Blueprint, request, jsonify
from app.db_config import get_db_connection
from app.firewall_manager import apply_firewall_rules
import ipaddress
import traceback

security_bp = Blueprint("security", __name__)

def is_valid_cidr(cidr):
    try:
        ipaddress.ip_network(cidr)
        return True
    except ValueError:
        return False

@security_bp.route("/security/networks", methods=["GET"])
def list_networks():
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT * FROM security_networks ORDER BY id DESC")
        return jsonify(cursor.fetchall())
    except Exception as e:
        print("[ERROR][GET /security/networks]", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@security_bp.route("/security/services", methods=["GET"])
def list_services():
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT * FROM security_services ORDER BY port ASC")
        return jsonify(cursor.fetchall())
    except Exception as e:
        print("[ERROR][GET /security/services]", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@security_bp.route("/security/policies", methods=["GET"])
def list_policies():
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)
        cursor.execute("""
            SELECT
                acl.id,
                acl.service_id,
                acl.network_id,
                s.name AS service_name,
                s.port AS service_port,
                s.protocol AS service_protocol,
                s.system_name,
                n.cidr AS network_cidr,
                n.description AS network_description,
                acl.allowed
            FROM service_acl acl
            JOIN security_services s ON acl.service_id = s.id
            JOIN security_networks n ON acl.network_id = n.id
            ORDER BY s.port, n.cidr
        """)
        return jsonify(cursor.fetchall())
    except Exception as e:
        print("[ERROR][GET /security/policies]", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@security_bp.route("/security/audit", methods=["GET"])
def list_audit_logs():
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT * FROM security_audit ORDER BY created_at DESC LIMIT 100")
        return jsonify(cursor.fetchall())
    except Exception as e:
        print("[ERROR][GET /security/audit]", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@security_bp.route("/security/networks", methods=["POST"])
def add_network():
    try:
        data = request.get_json()
        cidr = data.get("cidr")
        description = data.get("description", "")

        if not cidr or not is_valid_cidr(cidr):
            return jsonify({"error": "CIDR inválido"}), 400

        db = get_db_connection()
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT id FROM security_networks WHERE cidr = %s", (cidr,))
        if cursor.fetchone():
            return jsonify({"error": "La red ya está registrada"}), 409

        cursor.execute("INSERT INTO security_networks (cidr, description) VALUES (%s, %s)", (cidr, description))
        db.commit()
        return jsonify({"status": "ok", "message": "Red agregada correctamente"})
    except Exception as e:
        print("[ERROR][POST /security/networks]", e)
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
