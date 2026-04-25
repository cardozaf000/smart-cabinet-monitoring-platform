# app/alerts_engine.py
# Motor de evaluación de reglas:
# - Evalúa lecturas contra alert_rules habilitadas
# - Persiste incidentes en alert_incidents (BD)
# - Envía email con perfil SMTP configurado
# - Gestiona duración sostenida, histéresis y cooldown

from datetime import datetime, timedelta
from typing import Dict, Any, Optional
import json
import os
import smtplib, ssl
from email.mime.text import MIMEText

from app.db_config import get_db_connection
from app.crypto_utils import decrypt_str

_ALERT_CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'led_alert_config.json')

_BLINK_SPEED_MS = {'slow': 1000, 'medium': 500, 'fast': 200}

def _hex_to_rgb(hex_color: str):
    h = str(hex_color or "#000000").lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    try:
        v = int(h, 16)
        return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
    except Exception:
        return [0, 0, 0]


def _fire_led_for_alert(rule: Dict[str, Any], lectura: Dict[str, Any]) -> None:
    """Publica comando MQTT a la tira LED cuando se activa una alerta."""
    try:
        from app.mqtt_client import publish_mqtt
        with open(_ALERT_CONFIG_PATH) as f:
            cfg = json.load(f)
    except Exception:
        return

    if not cfg.get('alert_bindings_enabled'):
        return

    rule_id   = str(rule.get('id', ''))
    gab_id    = lectura.get('gabinete_id') or cfg.get('strip', {}).get('gabinete_id') or 'cab-1'
    bindings  = cfg.get('alert_bindings', [])

    # Primero busca por rule_id exacto, luego por comodín 'any'
    matched = next(
        (b for b in bindings if str(b.get('rule_id', '')) == rule_id),
        next((b for b in bindings if str(b.get('rule_id', '')) == 'any'), None)
    )
    if not matched:
        return

    mode       = matched.get('action_mode', 'blink')
    color      = matched.get('action_color', '#ff0000')
    speed_key  = matched.get('action_speed', 'medium')
    period_ms  = _BLINK_SPEED_MS.get(speed_key, 500)
    rgb        = _hex_to_rgb(color)

    payload = json.dumps({
        "r": rgb[0], "g": rgb[1], "b": rgb[2],
        "mode": mode,
        "period_ms": period_ms,
        "source": "alert_engine",
    })
    topic = f"actuadores/{gab_id}/rgb"
    publish_mqtt(topic, payload)
    print(f"[alerts-LED] alerta={rule.get('name')} → modo={mode} color={color} topic={topic}")


def _restore_led_after_alert(lectura: Dict[str, Any]) -> None:
    """Restaura el LED al estado normal cuando una alerta se resuelve."""
    try:
        from app.mqtt_client import publish_mqtt
        with open(_ALERT_CONFIG_PATH) as f:
            cfg = json.load(f)
    except Exception:
        return

    if not cfg.get('restore_on_resolve', True):
        return

    strip  = cfg.get('strip', {})
    gab_id = lectura.get('gabinete_id') or strip.get('gabinete_id') or 'cab-1'

    if not strip.get('enabled', True):
        payload = json.dumps({"r": 0, "g": 0, "b": 0, "mode": "off"})
    else:
        rgb  = _hex_to_rgb(strip.get('color', '#00aaff'))
        mode = strip.get('mode', 'fixed')
        payload = json.dumps({
            "r": rgb[0], "g": rgb[1], "b": rgb[2],
            "mode": mode,
            "period_ms": 500,
            "source": "alert_engine_restore",
        })

    topic = f"actuadores/{gab_id}/rgb"
    publish_mqtt(topic, payload)
    print(f"[alerts-LED] alerta resuelta → restaurando LED normal topic={topic}")


def _now() -> datetime:
    return datetime.utcnow()


# Estado en memoria
_violation_since:     Dict[int, datetime] = {}  # rule_id -> cuándo empezó la violación
_last_notified:       Dict[int, datetime] = {}  # rule_id -> última notificación
_current_incident_id: Dict[int, int]      = {}  # rule_id -> id del incidente activo en BD


def _compare(op: str, value: float, thr: float) -> bool:
    return {
        ">":  lambda a, b: a >  b,
        ">=": lambda a, b: a >= b,
        "<":  lambda a, b: a <  b,
        "<=": lambda a, b: a <= b,
        "=":  lambda a, b: a == b,
    }[op](value, thr)


def _match_rule(rule: Dict[str, Any], lectura: Dict[str, Any]) -> bool:
    scope  = rule["scope"]
    sel    = rule["selector"]
    tipo   = lectura.get("tipo")
    sensor = lectura.get("sensor_id")
    gab    = lectura.get("gabinete_id")

    if   scope == "sensor":   matched = sensor == sel
    elif scope == "tipo":     matched = tipo   == sel
    elif scope == "gabinete": matched = gab    == sel
    else: return False

    if not matched:
        return False

    metric = rule.get("metric")
    if metric and tipo and metric != tipo:
        return False
    return True


# ── Persistencia de incidentes ───────────────────────────────────────────────

def _open_incident(rule: Dict[str, Any], lectura: Dict[str, Any], value: float) -> Optional[int]:
    """Inserta un nuevo incidente activo. Devuelve el id o None si falla."""
    try:
        db  = get_db_connection()
        cur = db.cursor()
        cur.execute(
            """
            INSERT INTO alert_incidents
              (rule_id, rule_name, sensor_id, metric, severity,
               value, threshold, op, status, message, fired_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'active', %s, %s)
            """,
            (
                rule["id"],
                rule["name"],
                lectura.get("sensor_id"),
                rule.get("metric") or lectura.get("tipo"),
                rule["severity"],
                round(value, 4),
                float(rule["threshold"]),
                rule["op"],
                f"{rule['name']}: {rule['metric']} {rule['op']} {rule['threshold']} (actual: {value:.2f})",
                _now(),
            ),
        )
        db.commit()
        inc_id = cur.lastrowid
        cur.close(); db.close()
        return inc_id
    except Exception as e:
        print(f"[alerts] Error al abrir incidente: {e}")
        return None


def _resolve_incident(inc_id: int) -> None:
    """Marca un incidente como resuelto."""
    try:
        db  = get_db_connection()
        cur = db.cursor()
        cur.execute(
            "UPDATE alert_incidents SET status='resolved', resolved_at=%s WHERE id=%s AND status='active'",
            (_now(), inc_id),
        )
        db.commit()
        cur.close(); db.close()
    except Exception as e:
        print(f"[alerts] Error al resolver incidente {inc_id}: {e}")


# ── Email ────────────────────────────────────────────────────────────────────

def _build_email(rule, lectura, value):
    sev   = rule["severity"]
    title = f"[{sev}] Alerta: {rule['name']}"
    lines = [
        f"Regla:      {rule['name']} (id={rule['id']})",
        f"Ámbito:     {rule['scope']} = {rule['selector']}",
        f"Condición:  {rule['metric']} {rule['op']} {rule['threshold']}",
        f"Valor:      {value:.4f}",
        f"Sensor:     {lectura.get('sensor_id')}  Tipo: {lectura.get('tipo')}",
        f"Fecha UTC:  {_now().isoformat()}",
    ]
    return title, "\n".join(lines)


def _send_email_with_profile(profile_id: int, subject: str, body: str, to_list):
    db  = get_db_connection()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM smtp_profiles WHERE id=%s AND enabled=1", (profile_id,))
    p = cur.fetchone()
    cur.close(); db.close()
    if not p:
        raise RuntimeError("Perfil SMTP no encontrado o deshabilitado")

    host = p["host"]; port = int(p["port"]); mode = p["tls_mode"]
    username = p["username"]; pwd = decrypt_str(p["password_enc"])
    from_email = p["from_email"]

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"]    = from_email
    msg["To"]      = ", ".join(to_list)

    ctx = ssl.create_default_context()
    if mode == "ssl":
        with smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
            if username: s.login(username, pwd)
            s.sendmail(from_email, to_list, msg.as_string())
    else:
        with smtplib.SMTP(host, port, timeout=20) as s:
            s.starttls(context=ctx)
            if username: s.login(username, pwd)
            s.sendmail(from_email, to_list, msg.as_string())


# ── Motor principal ──────────────────────────────────────────────────────────

def evaluate_new_reading(lectura: Dict[str, Any]):
    """
    Llamar cada vez que ingrese una nueva lectura.
    lectura = {
      'sensor_id': str,
      'tipo': str,
      'valor': float,
      'ts': datetime (UTC) opcional,
      'gabinete_id': str opcional,
    }
    """
    try:
        valor = float(lectura.get("valor"))
    except Exception:
        return

    ts = lectura.get("ts") or _now()
    if not isinstance(ts, datetime):
        try:
            ts = datetime.fromisoformat(str(ts))
        except Exception:
            ts = _now()

    db  = get_db_connection()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM alert_rules WHERE enabled=1")
    rules = cur.fetchall()
    cur.close(); db.close()

    for r in rules:
        rid = int(r["id"])
        if not _match_rule(r, lectura):
            _violation_since.pop(rid, None)
            continue

        thr = float(r["threshold"])
        op  = r["op"]
        dur = int(r["duration_sec"])
        hys = float(r.get("hysteresis", 0) or 0)
        cd  = int(r.get("cooldown_sec", 0) or 0)

        in_violation = _compare(op, valor, thr)

        if in_violation:
            since = _violation_since.get(rid)
            if since is None:
                _violation_since[rid] = ts
                since = ts

            sustained = (ts - since) >= timedelta(seconds=dur)
            if sustained:
                # Abrir incidente en BD si no hay uno activo
                if rid not in _current_incident_id:
                    inc_id = _open_incident(r, lectura, valor)
                    if inc_id:
                        _current_incident_id[rid] = inc_id

                # LED: disparar solo la primera vez que se abre el incidente
                if rid not in _current_incident_id:
                    _fire_led_for_alert(r, lectura)

                # Cooldown para email
                last = _last_notified.get(rid)
                if (last is None) or ((ts - last) >= timedelta(seconds=cd)):
                    ch = r.get("channels_json") or {}
                    if isinstance(ch, str):
                        try: ch = json.loads(ch)
                        except: ch = {}
                    email_cfg = ch.get("email")
                    if email_cfg:
                        to = [x for x in list(email_cfg.get("to", [])) if x]
                        if to:
                            subject, body = _build_email(r, lectura, valor)
                            try:
                                _send_email_with_profile(int(email_cfg["profile_id"]), subject, body, to)
                                _last_notified[rid] = ts
                                print(f"[alerts] Email enviado: rule={rid} to={to}")
                            except Exception as e:
                                print(f"[alerts] Error SMTP rule={rid}: {e}")
        else:
            # Recuperación con histéresis
            recovered = False
            if   op in (">", ">="): recovered = valor <= (thr - hys)
            elif op in ("<", "<="): recovered = valor >= (thr + hys)
            else:                   recovered = valor != thr

            if recovered:
                _violation_since.pop(rid, None)
                # Cerrar incidente activo si existe
                inc_id = _current_incident_id.pop(rid, None)
                if inc_id:
                    _resolve_incident(inc_id)
                    _restore_led_after_alert(lectura)
