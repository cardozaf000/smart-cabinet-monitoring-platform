import os
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

def create_app():
    load_dotenv()

    app = Flask(__name__)

    # ==========================================================
    # ✅ CONFIGURACIÓN CORS CORREGIDA (CLOUDLFARE + AZURE + LAN)
    # ==========================================================
    ALLOWED_ORIGINS = [
        "https://white-grass-08042cc0f.4.azurestaticapps.net",  # nuevo Azure Static Web App
        "https://web.tesis-monitoring.xyz",                     # dominio personalizado (Cloudflare)
        "https://api.tesis-monitoring.xyz",                     # por si el frontend llama desde mismo dominio
        "http://localhost:3000",                                # desarrollo local
        "http://127.0.0.1:3000",
        "http://192.168.0.25:3000",                             # acceso LAN
    ]

    CORS(
        app,
        resources={r"/*": {"origins": ALLOWED_ORIGINS}},
        supports_credentials=False,
        allow_headers=["Content-Type", "Authorization", "X-Requested-With", "Cache-Control"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    )

    app.config["JSON_AS_ASCII"] = False
    app.config["JSON_SORT_KEYS"] = False

    # --- Rutas principales ---
    from app.routes.lecturas_routes import lecturas_bp
    app.register_blueprint(lecturas_bp)
    
    from app.email_test import email_bp
    app.register_blueprint(email_bp)

    from app.routes.widgets_routes import widgets_bp
    app.register_blueprint(widgets_bp)
    
    from app.security_bp import security_bp
    app.register_blueprint(security_bp)
    
    from app.routes.upload_routes import upload_bp
    app.register_blueprint(upload_bp)

    from app.routes.mqtt_uart import mqtt_uart_bp
    app.register_blueprint(mqtt_uart_bp)

    from app.routes.themes_routes import themes_bp
    app.register_blueprint(themes_bp)

    from app.routes.sensor_routes import sensor_bp
    app.register_blueprint(sensor_bp)
    
    from app.routes.smtp_profiles_routes import smtp_bp
    app.register_blueprint(smtp_bp)
    
    from app.routes.alerts_rules_routes import alerts_rules_bp
    app.register_blueprint(alerts_rules_bp)

    from app.routes.historico_routes import historico_bp
    app.register_blueprint(historico_bp)

    from app.routes.system_routes import system_bp
    app.register_blueprint(system_bp)

    from app.routes.network_routes import network_bp
    app.register_blueprint(network_bp)

    from app.routes.audit_routes import audit_bp
    app.register_blueprint(audit_bp)

    from app.routes.incidents_routes import incidents_bp
    app.register_blueprint(incidents_bp)

    from app.routes.snmp_routes import snmp_bp
    app.register_blueprint(snmp_bp)

    from app.routes.branding_routes import branding_bp
    app.register_blueprint(branding_bp)

    from app.routes.cabinets_routes import cabinets_bp
    app.register_blueprint(cabinets_bp)

    from app.routes.rgb_routes import rgb_bp
    app.register_blueprint(rgb_bp)

    from app.routes.backup_routes import backup_bp
    app.register_blueprint(backup_bp)

    from app.routes.preferences_routes import preferences_bp
    app.register_blueprint(preferences_bp)

    from app.routes.ml_routes import ml_bp
    app.register_blueprint(ml_bp)

    from app.routes.sensor_alias_routes import sensor_alias_bp
    app.register_blueprint(sensor_alias_bp)

    # --- Auth: login y registro de usuarios ---
    try:
        from app.routes.auth_routes import auth_bp
        app.register_blueprint(auth_bp)
    except Exception as e:
        print(f"[ERROR] No se pudo registrar auth_bp: {e}")

    # --- Compatibilidad con módulos WiFi previos ---
    try:
        from app.routes.config_wifi import wifi_config
        app.register_blueprint(wifi_config)
    except Exception:
        pass

    try:
        from app.routes.wifi_status import wifi_bp as wifi_status_bp
        app.register_blueprint(wifi_status_bp)
    except Exception:
        pass

    try:
        from app.routes.wifi_networks_manage import wifi_mgmt
        app.register_blueprint(wifi_mgmt)
    except Exception:
        pass

    # mqtt_uart_bp ya fue registrado arriba

    # --- Ruta de verificación (salud del backend) ---
    @app.route("/health")
    def health():
        return jsonify({"ok": True})

    # --- Cliente MQTT se lanza una sola vez ---
    try:
        from app.mqtt_client import start_mqtt
        if not app.config.get("MQTT_STARTED", False):
            start_mqtt()
            app.config["MQTT_STARTED"] = True
    except Exception:
        pass

    return app
