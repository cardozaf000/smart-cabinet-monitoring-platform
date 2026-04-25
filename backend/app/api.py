from flask import Flask, jsonify
from app.db_config import get_db_connection

app = Flask(__name__)

# Ruta principal para verificar estado
@app.route('/')
def index():
    return "✅ API de monitoreo IoT en funcionamiento."

# Ruta para obtener todas las lecturas recientes
@app.route('/api/lecturas', methods=['GET'])
def obtener_lecturas():
    try:
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        cursor.execute("""
            SELECT sensor_id, nombre_sensor, tipo_medida, valor, unidad, timestamp
            FROM lecturas
            ORDER BY timestamp DESC
            LIMIT 50
        """)

        resultados = cursor.fetchall()
        cursor.close()
        conn.close()

        return jsonify(resultados)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
