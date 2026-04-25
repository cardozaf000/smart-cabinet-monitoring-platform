from flask import Blueprint, request, jsonify
import serial
import json

mqtt_uart_bp = Blueprint('mqtt_uart', __name__)

UART_PORT = "/dev/serial0"
UART_BAUDRATE = 115200

@mqtt_uart_bp.route('/configurar_esp32', methods=['POST'])
def configurar_esp32():
    try:
        data = request.get_json()

        # Validaciones generales
        if not data.get("modo") in ["wifi", "ethernet"]:
            return jsonify({"error": "El campo 'modo' debe ser 'wifi' o 'ethernet'"}), 400

        if not data.get("broker_ip"):
            return jsonify({"error": "broker_ip es requerido"}), 400

        # Construir mensaje según ESP32
        mensaje = {
            "modo": data["modo"],
            "broker": data["broker_ip"],   # 👉 ESP32 espera "broker"
            "broker_port": data.get("broker_port", 1883)
        }

        # Config WiFi
        if data["modo"] == "wifi":
            if not data.get("wifi_ssid") or not data.get("wifi_password"):
                return jsonify({"error": "Se requieren 'wifi_ssid' y 'wifi_password' para modo WiFi"}), 400

            mensaje.update({
                "wifi_ssid": data["wifi_ssid"],
                "wifi_password": data["wifi_password"]
            })

        # Config Ethernet
        elif data["modo"] == "ethernet":
            ip_mode = data.get("ip_mode", "dhcp").lower()
            if ip_mode not in ["dhcp", "static"]:
                return jsonify({"error": "ip_mode debe ser 'dhcp' o 'static'"}), 400

            mensaje["ip_mode"] = ip_mode

            if ip_mode == "static":
                required_fields = ["ip_address", "subnet_mask", "gateway", "dns"]
                for field in required_fields:
                    if not data.get(field):
                        return jsonify({"error": f"Falta el campo '{field}' para IP estática"}), 400

                mensaje.update({
                    "esp_ip": data["ip_address"],
                    "subnet": data["subnet_mask"],
                    "gateway": data["gateway"],
                    "dns": data["dns"]
                })

        # Enviar JSON al ESP32 por UART
        mensaje_uart = json.dumps(mensaje) + "\n"
        with serial.Serial(UART_PORT, UART_BAUDRATE, timeout=2) as ser:
            ser.write(mensaje_uart.encode())

        return jsonify({"status": "ok", "enviado": mensaje})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
