"""
Rutas de widgets del dashboard.

SQL a ejecutar una sola vez en el servidor si la tabla ya existe:
  ALTER TABLE dashboard_widgets
    ADD COLUMN IF NOT EXISTS col_span INT DEFAULT 1,
    ADD COLUMN IF NOT EXISTS gx      INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gy      INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gw      INT DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS gh      INT DEFAULT NULL;

Si la tabla aún no existe, créala completa:
  CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id           VARCHAR(64)  PRIMARY KEY,
    title        VARCHAR(255) DEFAULT '',
    chart_type   VARCHAR(64)  DEFAULT 'line',
    measure      VARCHAR(64)  DEFAULT '',
    sensor_scope VARCHAR(32)  DEFAULT 'any',
    sensor_id    VARCHAR(128) DEFAULT '',
    agg          VARCHAR(16)  DEFAULT 'none',
    time_range   JSON,
    max_points   INT          DEFAULT 200,
    decimals     INT          DEFAULT 2,
    unit_override VARCHAR(32) DEFAULT '',
    pinned       TINYINT(1)   DEFAULT 0,
    col_span     INT          DEFAULT 1,
    gx           INT          DEFAULT NULL,
    gy           INT          DEFAULT NULL,
    gw           INT          DEFAULT NULL,
    gh           INT          DEFAULT NULL
  );
"""
from flask import Blueprint, request, jsonify
from app.db_config import get_db_connection
from app.auth_utils import token_required
from app.audit_utils import log_action
import json

widgets_bp = Blueprint('widgets', __name__, url_prefix='/api/widgets')


# ─── GET: todos o solo destacados ───────────────────────────────
@widgets_bp.route('', methods=['GET'])
def get_widgets():
    pinned_only = request.args.get('pinned', '').lower() in ('1', 'true', 'yes')
    conn = get_db_connection()
    cur = conn.cursor(dictionary=True)
    try:
        if pinned_only:
            cur.execute("SELECT * FROM dashboard_widgets WHERE pinned = 1")
        else:
            cur.execute("SELECT * FROM dashboard_widgets")
        widgets = cur.fetchall()
        for w in widgets:
            try:
                if isinstance(w.get('time_range'), str):
                    w['time_range'] = json.loads(w['time_range'])
            except Exception:
                w['time_range'] = {}
        return jsonify(widgets)
    except Exception as e:
        print("❌ Error al obtener widgets:", e)
        return jsonify({'error': 'Error al obtener widgets'}), 500
    finally:
        cur.close(); conn.close()


# ─── POST: crear / actualizar un widget ──────────────────────────
@widgets_bp.route('', methods=['POST'])
@token_required
def save_widget():
    data = request.json or {}
    if not data.get('id'):
        return jsonify({'error': 'Falta id'}), 400
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO dashboard_widgets
              (id, title, chart_type, measure, sensor_scope, sensor_id,
               agg, time_range, max_points, decimals, unit_override, pinned,
               col_span, gx, gy, gw, gh)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
              title=%s, chart_type=%s, measure=%s, sensor_scope=%s,
              sensor_id=%s, agg=%s, time_range=%s, max_points=%s,
              decimals=%s, unit_override=%s, pinned=%s,
              col_span=%s, gx=%s, gy=%s, gw=%s, gh=%s
        """, (
            data['id'],
            data.get('title',''), data.get('chartType','line'), data.get('measure',''),
            data.get('sensorScope','any'), data.get('sensorId',''), data.get('agg','none'),
            json.dumps(data.get('timeRange', {})),
            data.get('maxPoints', 200), data.get('decimals', 2), data.get('unitOverride',''),
            int(bool(data.get('pinned', False))),
            data.get('colSpan', 1),
            data.get('gx'), data.get('gy'), data.get('gw'), data.get('gh'),
            # ON DUPLICATE
            data.get('title',''), data.get('chartType','line'), data.get('measure',''),
            data.get('sensorScope','any'), data.get('sensorId',''), data.get('agg','none'),
            json.dumps(data.get('timeRange', {})),
            data.get('maxPoints', 200), data.get('decimals', 2), data.get('unitOverride',''),
            int(bool(data.get('pinned', False))),
            data.get('colSpan', 1),
            data.get('gx'), data.get('gy'), data.get('gw'), data.get('gh'),
        ))
        conn.commit()
        log_action("SAVE_WIDGET", "widget", data['id'], {"title": data.get("title")})
        return jsonify({'ok': True})
    except Exception as e:
        print("❌ Error al guardar widget:", e)
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close(); conn.close()


# ─── POST /sync: reemplaza TODOS los widgets custom de una vez ───
@widgets_bp.route('/sync', methods=['POST'])
@token_required
def sync_widgets():
    """Recibe array de todos los widgets (incluidos fixed-*) y los reemplaza todos."""
    items = request.get_json(force=True)
    if not isinstance(items, list):
        return jsonify({'error': 'Se esperaba un array'}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Borra todos los widgets (fixed incluidos) para remplazar con el estado completo
        cur.execute("DELETE FROM dashboard_widgets")
        for w in items:
            if not w.get('id'):
                continue
            cur.execute("""
                INSERT INTO dashboard_widgets
                  (id, title, chart_type, measure, sensor_scope, sensor_id,
                   agg, time_range, max_points, decimals, unit_override, pinned,
                   col_span, gx, gy, gw, gh)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, (
                w['id'],
                w.get('title',''), w.get('chartType','line'), w.get('measure',''),
                w.get('sensorScope','any'), w.get('sensorId',''), w.get('agg','none'),
                json.dumps(w.get('timeRange', {})),
                w.get('maxPoints', 200), w.get('decimals', 2), w.get('unitOverride',''),
                int(bool(w.get('pinned', False))),
                w.get('colSpan', 1),
                w.get('gx'), w.get('gy'), w.get('gw'), w.get('gh'),
            ))
        conn.commit()
        return jsonify({'ok': True, 'synced': len(items)})
    except Exception as e:
        print("❌ Error en sync_widgets:", e)
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close(); conn.close()


# ─── DELETE /<id> ────────────────────────────────────────────────
@widgets_bp.route('/<widget_id>', methods=['DELETE'])
@token_required
def delete_widget(widget_id):
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM dashboard_widgets WHERE id = %s", (widget_id,))
        conn.commit()
        log_action("DELETE_WIDGET", "widget", widget_id)
        return jsonify({'ok': True})
    except Exception as e:
        print("❌ Error al eliminar widget:", e)
        return jsonify({'error': str(e)}), 500
    finally:
        cur.close(); conn.close()
