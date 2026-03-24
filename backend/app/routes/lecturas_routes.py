from flask import Blueprint, jsonify, request
from app.db_config import get_db_connection

# NUEVO: snapshot del sistema (sensor lógico RPi)
from app.system_monitor import get_system_snapshot

lecturas_bp = Blueprint('lecturas', __name__)


@lecturas_bp.route('/datos_sensores', methods=['GET'])
def obtener_datos_sensores():
    """
    Devuelve la última lectura por (sensor_id, tipo_medida) desde la tabla 'lecturas'
    y ANEXA 3 sensores lógicos del Raspberry Pi:
      - rpi.cpu_temp  (tipo=temperatura, unidad=°C)
      - rpi.cpu_usage (tipo=cpu, unidad=%)
      - rpi.mem_usage (tipo=memoria, unidad=%)
    Estructura de salida: lista de dicts con:
      sensor_id, nombre, tipo, cabinetId, lectura{valor, unidad, timestamp}
    """
    db = None
    cursor = None
    try:
        db = get_db_connection()
        cursor = db.cursor()

        # Última lectura por sensor_id + tipo_medida
        cursor.execute("""
            SELECT l.sensor_id, l.nombre_sensor, l.tipo_medida, l.valor, l.unidad, l.timestamp
            FROM lecturas l
            INNER JOIN (
                SELECT sensor_id, tipo_medida, MAX(`timestamp`) AS max_ts
                FROM lecturas
                GROUP BY sensor_id, tipo_medida
            ) ult
              ON l.sensor_id   = ult.sensor_id
             AND l.tipo_medida = ult.tipo_medida
             AND l.`timestamp` = ult.max_ts
            ORDER BY l.sensor_id, l.tipo_medida;
        """)

        filas = cursor.fetchall()

        datos = []
        for sensor_id, nombre_sensor, tipo_medida, valor, unidad, ts in filas:
            datos.append({
                "sensor_id": sensor_id,
                "nombre": nombre_sensor,
                "tipo": tipo_medida,
                "cabinetId": "cab-desconocido",  # placeholder
                "lectura": {
                    "valor": valor,
                    "unidad": unidad,
                    "timestamp": ts.strftime('%Y-%m-%d %H:%M:%S') if ts else None
                }
            })

        # ============ SENSORES LÓGICOS: RASPBERRY PI ============
        rpi = get_system_snapshot()
        if rpi and rpi.get("medidas"):
            from datetime import datetime
            ts_epoch = rpi.get("ts")
            ts_str = None
            if isinstance(ts_epoch, (int, float)):
                ts_str = datetime.fromtimestamp(ts_epoch).strftime('%Y-%m-%d %H:%M:%S')

            # Temp CPU (°C)
            cpu_temp = rpi["medidas"].get("cpu_temp", {})
            if cpu_temp.get("valor") is not None:
                datos.append({
                    "sensor_id": "rpi.cpu_temp",
                    "nombre": "Raspberry Pi - Temp CPU",
                    "tipo": "temperatura",
                    "cabinetId": "gab-rpi",
                    "lectura": {
                        "valor": round(float(cpu_temp["valor"]), 2),
                        "unidad": cpu_temp.get("unidad", "°C"),
                        "timestamp": ts_str
                    }
                })

            # Uso CPU (%)
            cpu_usage = rpi["medidas"].get("cpu_usage", {})
            if cpu_usage.get("valor") is not None:
                datos.append({
                    "sensor_id": "rpi.cpu_usage",
                    "nombre": "Raspberry Pi - Uso CPU",
                    "tipo": "cpu",
                    "cabinetId": "gab-rpi",
                    "lectura": {
                        "valor": round(float(cpu_usage["valor"]), 1),
                        "unidad": cpu_usage.get("unidad", "%"),
                        "timestamp": ts_str
                    }
                })

            # Uso Memoria (%)
            mem_usage = rpi["medidas"].get("mem_usage", {})
            if mem_usage.get("valor") is not None:
                datos.append({
                    "sensor_id": "rpi.mem_usage",
                    "nombre": "Raspberry Pi - Uso Memoria",
                    "tipo": "memoria",
                    "cabinetId": "gab-rpi",
                    "lectura": {
                        "valor": round(float(mem_usage["valor"]), 1),
                        "unidad": mem_usage.get("unidad", "%"),
                        "timestamp": ts_str
                    }
                })

        return jsonify(datos)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            if cursor: cursor.close()
            if db: db.close()
        except:
            pass


@lecturas_bp.route('/historico', methods=['GET'])
def obtener_historico():
    """
    Devuelve lecturas históricas filtradas por:
    - tipo (obligatorio)
    - sensorId (opcional)
    - from (ISO datetime)
    - to (ISO datetime)
    - limit (por defecto 500)
    """
    db = None
    cursor = None
    try:
        tipo = request.args.get('tipo')
        sensor_id = request.args.get('sensorId')
        from_ts = request.args.get('from')
        to_ts = request.args.get('to')
        limit = int(request.args.get('limit', 500))

        if not tipo:
            return jsonify({'error': 'Falta el parámetro tipo'}), 400

        db = get_db_connection()
        cursor = db.cursor(dictionary=True)

        query = """
            SELECT timestamp, valor, unidad
            FROM lecturas
            WHERE tipo_medida = %s
        """
        params = [tipo]

        if sensor_id:
            query += " AND sensor_id = %s"
            params.append(sensor_id)

        if from_ts:
            query += " AND timestamp >= %s"
            params.append(from_ts)

        if to_ts:
            query += " AND timestamp <= %s"
            params.append(to_ts)

        query += " ORDER BY timestamp DESC LIMIT %s"
        params.append(limit)

        cursor.execute(query, tuple(params))
        filas = cursor.fetchall()

        # Convertir timestamp a string si es datetime
        for fila in filas:
            if isinstance(fila['timestamp'], (str, type(None))):
                continue
            fila['timestamp'] = fila['timestamp'].strftime('%Y-%m-%d %H:%M:%S')

        return jsonify(filas[::-1])  # se invierte para mostrar en orden ASC

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            if cursor: cursor.close()
            if db: db.close()
        except:
            pass
