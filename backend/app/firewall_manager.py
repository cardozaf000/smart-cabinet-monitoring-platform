import subprocess
from app.db_config import get_db_connection

def run_cmd(cmd, dry_run=False):
    if dry_run:
        print("[SIMULACIÓN] Ejecutar:", cmd)
        return
    subprocess.run(cmd, shell=True, check=True)

def apply_firewall_rules(dry_run=False):
    try:
        db = get_db_connection()
        cursor = db.cursor(dictionary=True)

        # Obtener configuración general
        cursor.execute("SELECT * FROM security_settings WHERE id = 1")
        settings = cursor.fetchone()
        deny_all_incoming = settings['deny_all_incoming'] if settings else True
        allow_all_outgoing = settings['allow_all_outgoing'] if settings else True

        # === Reset UFW ===
        run_cmd("ufw --force reset", dry_run)

        # === Política por defecto ===
        run_cmd(f"ufw default {'deny' if deny_all_incoming else 'allow'} incoming", dry_run)
        run_cmd(f"ufw default {'allow' if allow_all_outgoing else 'deny'} outgoing", dry_run)

        # === Reglas por ACL ===
        cursor.execute("""
            SELECT
                s.port, s.protocol, s.name AS service_name,
                n.cidr, a.allowed
            FROM service_acl a
            JOIN security_services s ON a.service_id = s.id
            JOIN security_networks n ON a.network_id = n.id
            WHERE a.allowed = TRUE AND s.enabled = TRUE AND n.enabled = TRUE
        """)
        rows = cursor.fetchall()

        if not rows:
            print("[INFO] No se encontraron reglas activas para aplicar.")
        else:
            for row in rows:
                cmd = f"ufw allow from {row['cidr']} to any port {row['port']} proto {row['protocol'].lower()}"
                run_cmd(cmd, dry_run)

        # === Activar UFW ===
        run_cmd("ufw --force enable", dry_run)

        return {"status": "ok", "message": "Reglas de firewall aplicadas exitosamente"}
    
    except Exception as e:
        print(f"[ERROR][FIREWALL] {e}")
        return {"status": "error", "message": str(e)}, 500
