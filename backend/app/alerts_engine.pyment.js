# app/alerts_engine.py
# Motor de evaluación de reglas:
# - Evalúa lecturas contra alert_rules habilitadas
# - Persiste incidentes en alert_incidents (BD)
# - Envía email con perfil SMTP configurado
# - Gestiona duración sostenida, histéresis y cooldown

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
import json
import os
import re
import time
import smtplib, ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

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

# Cache de reglas (TTL 30 s para evitar ~10-15 queries de BD por mensaje MQTT)
_rules_cache:    List[Dict[str, Any]] = []
_rules_cache_ts: float                = 0.0
_RULES_CACHE_TTL = 30.0


def _get_rules() -> List[Dict[str, Any]]:
    global _rules_cache, _rules_cache_ts
    if time.time() - _rules_cache_ts < _RULES_CACHE_TTL:
        return _rules_cache
    db  = get_db_connection()
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT * FROM alert_rules WHERE enabled=1")
    rows = cur.fetchall()
    cur.close(); db.close()
    _rules_cache    = rows
    _rules_cache_ts = time.time()
    return rows


def invalidate_rules_cache() -> None:
    """Llamar cuando se crea, edita o elimina una regla."""
    global _rules_cache_ts
    _rules_cache_ts = 0.0


def _compare(op: str, value: float, thr: float) -> bool:
    return {
        ">":  lambda a, b: a >  b,
        ">=": lambda a, b: a >= b,
        "<":  lambda a, b: a <  b,
        "<=": lambda a, b: a <= b,
        "=":  lambda a, b: a == b,
        "==": lambda a, b: a == b,
        "!=": lambda a, b: a != b,
    }.get(op, lambda a, b: False)(value, thr)


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

_SEVERITY_COLORS = {
    'CRITICAL': '#ef4444', 'HIGH': '#f97316',
    'WARNING':  '#f59e0b', 'INFO': '#3b82f6',
}

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


_DEFAULT_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <title>Alerta IoT — {{rule_name}}</title>
  <style>
    body,table,td,div,p,a{font-family:'Segoe UI',Helvetica,Arial,sans-serif;margin:0;padding:0;}
    body{width:100%!important;-webkit-text-size-adjust:100%;}
    .wrap{width:100%;max-width:600px;margin:0 auto;}
    .bar{height:5px;background:{{severity_color}};}
    .body{padding:32px 28px;}
    .badge{display:inline-block;padding:5px 13px;background:{{severity_color}}1a;color:{{severity_color}};
           font-size:11px;font-weight:800;border-radius:4px;text-transform:uppercase;
           letter-spacing:1.5px;border:1px solid {{severity_color}}33;}
    .title{font-size:24px;font-weight:800;color:#111;margin:14px 0 6px;letter-spacing:-0.5px;}
    .subtitle{font-size:15px;color:#555;line-height:1.55;margin:0 0 24px;}
    .box{width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:28px;}
    .box tr td{padding:13px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;vertical-align:top;}
    .box tr:last-child td{border-bottom:none;}
    .lbl{color:#6b7280;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;width:38%;}
    .val{color:#111;font-weight:700;text-align:right;word-break:break-word;}
    .val-alert{color:{{severity_color}};font-weight:800;text-align:right;}
    .footer{text-align:center;padding:28px 20px;font-size:11px;color:#9ca3af;line-height:1.8;}
    @media(prefers-color-scheme:dark){
      .title{color:#f1f5f9!important;} .subtitle{color:#94a3b8!important;}
      .box tr td{border-color:#1e293b!important;} .lbl{color:#64748b!important;}
      .val{color:#f1f5f9!important;} .footer{color:#475569!important;}
    }
  </style>
</head>
<body>
<table class="wrap" border="0" cellpadding="0" cellspacing="0">
  <tr><td class="bar" bgcolor="{{severity_color}}"></td></tr>
  <tr><td class="body">

    <div class="badge">{{severity}}</div>
    <h1 class="title">{{rule_name}}</h1>
    <p class="subtitle">El sistema de monitoreo IoT ha detectado una condición fuera de rango que requiere atención.</p>

    <table class="box" border="0" cellspacing="0" cellpadding="0">
      <tr><td class="lbl">Sensor</td>      <td class="val">{{sensor_name}}</td></tr>
      <tr><td class="lbl">Métrica</td>     <td class="val">{{metric}}</td></tr>
      <tr><td class="lbl">Valor actual</td><td class="val-alert">{{value}} {{unit}}</td></tr>
      <tr><td class="lbl">Condición</td>   <td class="val">{{metric}} {{op}} {{threshold}} {{unit}}</td></tr>
      <tr><td class="lbl">Gabinete</td>    <td class="val">{{location}}</td></tr>
      <tr><td class="lbl">Fecha / Hora</td><td class="val">{{timestamp}}</td></tr>
      <tr><td class="lbl">Severidad</td>   <td class="val-alert">{{severity}}</td></tr>
    </table>

    <table width="100%" border="0" cellspacing="0" cellpadding="0">
      <tr><td class="footer">
        <strong>Sistema de Monitoreo IoT</strong><br>
        Gabinete de Centro de Datos · Monitoreo en tiempo real<br>
        Este mensaje es generado automáticamente. No responder.<br>
        © 2026 UNMSM — Proyecto de Tesis
      </td></tr>
    </table>

  </td></tr>
</table>
</body>
</html>"""


def _render_custom_html(rule, lectura, value) -> Optional[str]:
    """Usa template personalizado si existe, o el template profesional por defecto."""
    custom = (rule.get('custom_html') or '').strip()
    html   = custom if custom else _DEFAULT_HTML_TEMPLATE
    sev    = str(rule.get('severity', 'WARNING')).upper()
    ctx = {
        'sensor_id':      str(lectura.get('sensor_id', '')),
        'sensor_name':    str(lectura.get('nombre', lectura.get('sensor_id', ''))),
        'metric':         str(rule.get('metric', lectura.get('tipo', ''))),
        'value':          f"{value:.2f}",
        'unit':           str(lectura.get('unidad', '')),
        'op':             str(rule.get('op', '')),
        'threshold':      str(rule.get('threshold', '')),
        'severity':       sev,
        'severity_color': _SEVERITY_COLORS.get(sev, '#f59e0b'),
        'rule_name':      str(rule.get('name', '')),
        'timestamp':      datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'location':       str(lectura.get('gabinete_id', 'N/A')),
    }
    return re.sub(r'\{\{(\w+)\}\}', lambda m: ctx.get(m.group(1), m.group(0)), html)


def _send_email_with_profile(profile_id: int, subject: str, body: str, to_list,
                              html_body: Optional[str] = None):
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

    if html_body:
        msg = MIMEMultipart("alternative")
        msg.attach(MIMEText(body,      "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html",  "utf-8"))
    else:
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

    rules = _get_rules()

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
                        _fire_led_for_alert(r, lectura)  # LED solo al abrir el incidente

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
                            html_body = _render_custom_html(r, lectura, valor)
                            try:
                                _send_email_with_profile(int(email_cfg["profile_id"]), subject, body, to, html_body)
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
