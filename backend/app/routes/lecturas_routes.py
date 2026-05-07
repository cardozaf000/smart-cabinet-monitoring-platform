import json
import queue as _queue_mod

from flask import Blueprint, jsonify, request, Response
from app.db_config import get_db_connection
from app.system_monitor import get_system_snapshot

lecturas_bp = Blueprint('lecturas', __name__)


# ── SSE: streaming en tiempo real ────────────────────────────────────────────

@lecturas_bp.route('/stream')
def sse_stream():
    from app.mqtt_client import register_sse_client, unregister_sse_client

    def generate():
        q = register_sse_client()
        try:
            yield 'data: {"type":"connected"}\n\n'
            while True:
                try:
                    snapshot = q.get(timeout=30)
                    yield f"data: {json.dumps(snapshot)}\n\n"
                except _queue_mod.Empty:
                    yield ": ping\n\n"
        except GeneratorExit:
            pass
        finally:
            unregister_sse_client(q)

    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control':      'no-cache',
            'X-Accel-Buffering':  'no',
            'Connection':         'keep-alive',
        },
    )


def _rpi_sensors(datos: list) -> None:
    """Anexa los sensores lógicos del Raspberry Pi a la lista datos (in-place)."""
    rpi = get_system_snapshot()
    if not (rpi and rpi.get("medidas")):
        return
    from datetime import datetime as _dt
    ts_epoch = rpi.get("ts")
    ts_str = (
        _dt.fromtimestamp(ts_epoch).strftime('%Y-%m-%d %H:%M:%S')
        if isinstance(ts_epoch, (int, float)) else None
    )
    medidas = rpi["medidas"]
    defs = [
        ("rpi.cpu_temp",  "Raspberry Pi - Temp CPU",    "temperatura", "cpu_temp",  "°C"),
        ("rpi.cpu_usage", "Raspberry Pi - Uso CPU",     "cpu",         "cpu_usage", "%"),
        ("rpi.mem_usage", "Raspberry Pi - Uso Memoria", "memoria",     "mem_usage", "%"),
    ]
    for sid, nombre, tipo, key, default_unit in defs:
        m = medidas.get(key, {})
        if m.get("valor") is not None:
            datos.append({
                "sensor_id": sid,
                "nombre":    nombre,
                "tipo":      tipo,
                "cabinetId": "gab-rpi",
                "lectura": {
                    "valor":     round(float(m["valor"]), 2),
                    "unidad":    m.get("unidad", default_unit),
                    "timestamp": ts_str,
                },
            })


@lecturas_bp.route('/datos_sensores', methods=['GET'])
def obtener_datos_sensores():
    """
    Devuelve la última lectura por (sensor_id, tipo_medida).
    Intenta servir desde caché en memoria (_sensor_latest) antes de consultar la BD.
    Siempre anexa los 3 sensores lógicos del Raspberry Pi.
    """
    # ── Cache en memoria (evita la costosa GROUP BY en cada poll) ──
    from app.mqtt_client import get_sensor_latest
    cached = get_sensor_latest()
    if cached:
        datos = list(cached)
        _rpi_sensors(datos)
        return jsonify(datos)

    # ── Fallback a BD (primera carga o sin datos MQTT aún) ──
    db = None
    cursor = None
    try:
        db = get_db_connection()
        cursor = db.cursor()

        cursor.execute("""
            SELECT l.sensor_id, l.nombre_sensor, l.tipo_medida, l.valor, l.unidad, l.puerto, l.timestamp
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
        for sensor_id, nombre_sensor, tipo_medida, valor, unidad, puerto, ts in filas:
            datos.append({
                "sensor_id": sensor_id,
                "nombre":    nombre_sensor,
                "tipo":      tipo_medida,
                "puerto":    puerto,
                "cabinetId": "cab-desconocido",
                "lectura": {
                    "valor":     valor,
                    "unidad":    unidad,
                    "timestamp": ts.strftime('%Y-%m-%d %H:%M:%S') if ts else None,
                },
            })

        _rpi_sensors(datos)
        return jsonify(datos)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            if cursor: cursor.close()
            if db: db.close()
        except Exception:
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
