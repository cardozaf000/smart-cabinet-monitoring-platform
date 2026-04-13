from flask import Blueprint, jsonify, request
from app.db_config import get_db_connection

ml_bp = Blueprint('ml', __name__)


@ml_bp.route('/api/anomalias', methods=['GET'])
def obtener_anomalias():
    """
    Devuelve las ultimas detecciones del modelo Isolation Forest.
    Query params opcionales:
      - gabinete_id   (int,  default 1)
      - limit         (int,  default 20)
      - solo_anomalias (bool, default false) — si true, devuelve solo es_anomalia=1 y revisado=0
    """
    db = None
    cursor = None
    try:
        gabinete_id    = int(request.args.get('gabinete_id', 1))
        limit          = int(request.args.get('limit', 20))
        solo_anomalias = request.args.get('solo_anomalias', 'false').lower() == 'true'

        db = get_db_connection()
        cursor = db.cursor(dictionary=True)

        query = """
            SELECT id, gabinete_id, timestamp, score_anomalia,
                   es_anomalia, revisado, features_json
            FROM anomalias_ml
            WHERE gabinete_id = %s
        """
        params = [gabinete_id]

        if solo_anomalias:
            query += " AND es_anomalia = 1 AND revisado = 0"

        query += " ORDER BY timestamp DESC LIMIT %s"
        params.append(limit)

        cursor.execute(query, tuple(params))
        filas = cursor.fetchall()

        for fila in filas:
            if fila['timestamp'] and not isinstance(fila['timestamp'], str):
                fila['timestamp'] = fila['timestamp'].strftime('%Y-%m-%d %H:%M:%S')
            fila['es_anomalia'] = bool(fila['es_anomalia'])
            fila['revisado']    = bool(fila['revisado'])
            # features_json llega como string JSON desde MariaDB

        return jsonify(filas)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            if cursor: cursor.close()
            if db: db.close()
        except Exception:
            pass


@ml_bp.route('/api/anomalias/historico', methods=['GET'])
def historico_anomalias():
    """
    Serie temporal de scores para el grafico de tendencia.
    Query params:
      - gabinete_id (int, default 1)
      - horas       (int, default 24) — ventana de tiempo
      - limit       (int, default 288) — maximo de puntos (288 = cada 5min en 24h)
    """
    db = None
    cursor = None
    try:
        gabinete_id = int(request.args.get('gabinete_id', 1))
        horas       = int(request.args.get('horas', 24))
        limit       = int(request.args.get('limit', 288))

        db = get_db_connection()
        cursor = db.cursor(dictionary=True)

        cursor.execute("""
            SELECT timestamp, score_anomalia AS score, es_anomalia
            FROM anomalias_ml
            WHERE gabinete_id = %s
              AND timestamp >= NOW() - INTERVAL %s HOUR
            ORDER BY timestamp ASC
            LIMIT %s
        """, (gabinete_id, horas, limit))

        rows = cursor.fetchall()
        for r in rows:
            if r['timestamp'] and not isinstance(r['timestamp'], str):
                r['timestamp'] = r['timestamp'].strftime('%Y-%m-%d %H:%M')
            r['es_anomalia'] = bool(r['es_anomalia'])
            r['score'] = float(r['score']) if r['score'] is not None else 0.0

        return jsonify(rows)

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            if cursor: cursor.close()
            if db: db.close()
        except Exception:
            pass


@ml_bp.route('/api/anomalias/<int:anomalia_id>/revisar', methods=['PUT'])
def revisar_anomalia(anomalia_id):
    """
    Marca una anomalia como revisada / no revisada.
    Body JSON: { "revisado": true/false }
    """
    db = None
    cursor = None
    try:
        data     = request.get_json()
        revisado = 1 if data.get('revisado', True) else 0

        db = get_db_connection()
        cursor = db.cursor()

        cursor.execute(
            "UPDATE anomalias_ml SET revisado = %s WHERE id = %s",
            (revisado, anomalia_id)
        )
        db.commit()

        if cursor.rowcount == 0:
            return jsonify({'error': 'Anomalia no encontrada'}), 404

        return jsonify({'ok': True, 'id': anomalia_id, 'revisado': bool(revisado)})

    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        try:
            if cursor: cursor.close()
            if db: db.close()
        except Exception:
            pass
