# backend/app/routes/historico_routes.py
from flask import Blueprint, request, jsonify
from app.db_config import get_db_connection
from datetime import datetime

historico_bp = Blueprint("historico", __name__)

@historico_bp.route("/historico", methods=["GET"])
def historico():
    sensor_id = request.args.get("sensorId")     # ej: 0x44
    tipo      = request.args.get("tipo")         # ej: temperatura/humedad/luz
    date_from = request.args.get("from")         # ISO o "YYYY-MM-DD HH:MM:SS"
    date_to   = request.args.get("to")           # ISO o "YYYY-MM-DD HH:MM:SS"
    limit     = int(request.args.get("limit", "2000"))

    clauses = []
    params = []

    # Filtrado por sensor y tipo
    if sensor_id:
        clauses.append("sensor_id = %s")
        params.append(sensor_id)
    if tipo:
        clauses.append("tipo_medida = %s")
        params.append(tipo)

    # Si no hay rango de fechas, filtrar solo el día actual
    if not date_from and not date_to:
        today = datetime.now().strftime("%Y-%m-%d")
        clauses.append("DATE(timestamp) = %s")
        params.append(today)
    else:
        if date_from:
            clauses.append("timestamp >= %s")
            params.append(date_from.replace("T", " "))
        if date_to:
            clauses.append("timestamp <= %s")
            params.append(date_to.replace("T", " "))

    where_sql = ("WHERE " + " AND ".join(clauses)) if clauses else ""

    sql = f"""
        SELECT sensor_id, nombre_sensor, tipo_medida, valor, unidad, timestamp
        FROM lecturas
        {where_sql}
        ORDER BY timestamp DESC
        LIMIT %s
    """
    params.append(limit)

    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    cur.execute(sql, params)
    rows = cur.fetchall()
    cur.close()
    conn.close()

    # Invertir para que el gráfico tenga orden cronológico
    rows.reverse()

    out = []
    for r in rows:
        out.append({
            "sensor_id": r["sensor_id"],
            "nombre": r["nombre_sensor"],
            "tipo": r["tipo_medida"],
            "valor": float(r["valor"]) if r["valor"] is not None else None,
            "unidad": r["unidad"] or "",
            "timestamp": r["timestamp"].strftime("%Y-%m-%d %H:%M:%S") if r["timestamp"] else None,
        })

    return jsonify(out)
