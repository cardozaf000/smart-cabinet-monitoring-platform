from flask import Blueprint, jsonify
from app.mqtt_client import get_datos

sensor_bp = Blueprint("sensor_routes", __name__)

# Ruta para probar que todo funciona
@sensor_bp.route("/test", methods=["GET"])
def test():
    return "Servidor Flask operativo"

# Ruta que devuelve las lecturas de sensores reales mapeadas
#@sensor_bp.route("/datos_sensores", methods=["GET"])
#def obtener_datos():
#    return jsonify(get_datos())
