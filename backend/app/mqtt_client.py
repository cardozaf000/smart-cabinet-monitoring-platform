
import json
import queue
import threading
import time
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
from app.db_config import get_db_connection
from app.alerts_engine import evaluate_new_reading

MQTT_BROKER = "localhost"
MQTT_PORT = 1883

TOPIC_DATA = "sensores/datos"
TOPIC_STATUS = "esp32/+/status"
TOPIC_NET = "uad/+/net"

SUBSCRIPTIONS = [
    (TOPIC_DATA, 0),
    (TOPIC_STATUS, 0),
    (TOPIC_NET, 0),
]

_datos_cache: List[Dict[str, Any]] = []
_datos_lock = threading.Lock()

_estado_cache: Dict[str, Dict[str, Any]] = {}
_estado_lock = threading.Lock()

_mqtt_pub_client: Optional[mqtt.Client] = None
_pub_lock = threading.Lock()

# Acumulador por sensor: clave = "{sensor_id}_{tipo}" → lectura formateada
_sensor_latest: Dict[str, Dict[str, Any]] = {}
_sensor_latest_lock = threading.Lock()

# Colas SSE: una por cliente conectado
_sse_queues: List[queue.Queue] = []
_sse_lock = threading.Lock()


def register_sse_client() -> queue.Queue:
    q: queue.Queue = queue.Queue(maxsize=10)
    with _sse_lock:
        _sse_queues.append(q)
    return q


def unregister_sse_client(q: queue.Queue) -> None:
    with _sse_lock:
        try:
            _sse_queues.remove(q)
        except ValueError:
            pass


def _push_sse_snapshot() -> None:
    """Envía el snapshot completo de _sensor_latest a todos los clientes SSE."""
    with _sensor_latest_lock:
        snapshot = list(_sensor_latest.values())
    if not snapshot:
        return
    with _sse_lock:
        dead: List[queue.Queue] = []
        for q in _sse_queues:
            try:
                q.put_nowait(snapshot)
            except queue.Full:
                dead.append(q)
        for q in dead:
            _sse_queues.remove(q)


def get_sensor_latest() -> List[Dict[str, Any]]:
    """Devuelve el snapshot en memoria (para /datos_sensores sin consulta a BD)."""
    with _sensor_latest_lock:
        return list(_sensor_latest.values())


def _map_lecturas(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    ts = int(time.time() * 1000)
    gabinete_id = payload.get("gabinete_id") or payload.get("cabinetId")
    ch = payload.get("channel")
    if ch is None:
        return out

    if "reed_closed" in payload:
        out.append({
            "sensor_id": "reed",
            "nombre": "reed_switch",
            "tipo": "estado",
            "gabinete_id": gabinete_id,
            "lectura": {
                "valor": 1 if payload["reed_closed"] else 0,
                "unidad": "estado",
                "timestamp": ts
            }
        })

    if "sht31" in payload:
        for s in payload["sht31"]:
            addr   = s.get("addr")
            # ESP32 envía "canal"; "port" es el campo antiguo como fallback
            puerto = s.get("canal", s.get("port", ch))
            sid    = f"sht31_{addr}_p{puerto}"
            nombre = f"SHT3X P{puerto}"
            # ESP32 envía "t" y "h"; "temperatura"/"humedad" son nombres alternativos
            temp_val = s.get("t", s.get("temperatura"))
            hum_val  = s.get("h", s.get("humedad"))
            out.append({
                "sensor_id": sid,
                "nombre": nombre,
                "tipo": "temperatura",
                "gabinete_id": gabinete_id,
                "puerto": puerto,
                "lectura": {
                    "valor": temp_val,
                    "unidad": "°C",
                    "timestamp": ts
                }
            })
            out.append({
                "sensor_id": sid,
                "nombre": nombre,
                "tipo": "humedad",
                "gabinete_id": gabinete_id,
                "puerto": puerto,
                "lectura": {
                    "valor": hum_val,
                    "unidad": "%",
                    "timestamp": ts
                }
            })

    if "bh1750" in payload:
        for s in payload["bh1750"]:
            puerto_bh = s.get("canal", s.get("port", ch))
            out.append({
                "sensor_id": f"bh1750_{s.get('addr')}_p{puerto_bh}",
                "nombre": f"BH1750 P{puerto_bh}",
                "tipo": "luz",
                "gabinete_id": gabinete_id,
                "puerto": puerto_bh,
                "lectura": {
                    "valor": s.get("lux"),
                    "unidad": "lux",
                    "timestamp": ts
                }
            })

    if "mpu6050" in payload:
        # mpu6050 ahora es un array de objetos
        mpu_list = payload["mpu6050"]
        if isinstance(mpu_list, dict):
            mpu_list = [mpu_list]   # compatibilidad con formato antiguo
        for s in mpu_list:
            # mag está anidado en "accel": {"mag": ...}; fallback a raíz por compatibilidad
            accel_obj = s.get("accel") if isinstance(s.get("accel"), dict) else {}
            mag_val   = accel_obj.get("mag", s.get("mag", 0))
            puerto_mpu = s.get("canal", s.get("port", ch))
            sid_mpu = f"mpu6050_{s.get('addr')}_p{puerto_mpu}"
            out.append({
                "sensor_id": sid_mpu,
                "nombre": f"MPU6050 P{puerto_mpu}",
                "tipo": "vibracion",
                "gabinete_id": gabinete_id,
                "puerto": puerto_mpu,
                "lectura": {
                    "valor": round(float(mag_val), 2),
                    "unidad": "m/s²",
                    "timestamp": ts
                }
            })
            out.append({
                "sensor_id": sid_mpu,
                "nombre": f"MPU6050 P{puerto_mpu}",
                "tipo": "estado",
                "gabinete_id": gabinete_id,
                "puerto": puerto_mpu,
                "lectura": {
                    "valor": 0 if s.get("normal") else 1,
                    "unidad": "estado",
                    "timestamp": ts
                }
            })

    if "vl53l0x" in payload:
        for s in payload["vl53l0x"]:
            puerto_vl = s.get("canal", s.get("port", ch))
            out.append({
                "sensor_id": f"vl53l0x_{s.get('addr')}_p{puerto_vl}",
                "nombre": f"VL53L0X P{puerto_vl}",
                "tipo": "distancia",
                "gabinete_id": gabinete_id,
                "puerto": puerto_vl,
                "lectura": {
                    "valor": s.get("mm"),
                    "unidad": "mm",
                    "timestamp": ts
                }
            })

    if "pir" in payload:
        s = payload["pir"]
        out.append({
            "sensor_id": "pir",
            "nombre": "PIR",
            "tipo": "movimiento",
            "gabinete_id": gabinete_id,
            "puerto": ch,
            "lectura": {
                "valor": 1 if s.get("detected") else 0,
                "unidad": "estado",
                "timestamp": ts
            }
        })

    if "mq2" in payload:
        s = payload["mq2"]
        out.append({
            "sensor_id": "mq2",
            "nombre": "MQ-2",
            "tipo": "humo",
            "gabinete_id": gabinete_id,
            "puerto": s.get("port", ch),
            "lectura": {
                "valor": s.get("ppm"),
                "unidad": "ppm",
                "timestamp": ts
            }
        })

    if "rgb" in payload:
        s = payload["rgb"]
        # Almacena el estado on/off de la tira como lectura de estado
        out.append({
            "sensor_id": "rgb",
            "nombre": "RGB",
            "tipo": "estado",
            "gabinete_id": gabinete_id,
            "puerto": ch,
            "lectura": {
                "valor": 1 if s.get("on") else 0,
                "unidad": "estado",
                "timestamp": ts
            }
        })

    return out


def _update_wifi_from_net_payload(payload: str):
    try:
        d = json.loads(payload)
    except Exception as e:
        print(f"❌ NET json inválido: {e} | payload={payload!r}")
        return

    wifi = d.get("wifi") or {}
    if not isinstance(wifi, dict):
        print(f"⚠️ NET sin objeto wifi: {payload!r}")
        return

    ssid = (wifi.get("ssid") or "").strip()
    ip = (wifi.get("ip") or "").strip() or None
    rssi = wifi.get("rssi")
    try:
        rssi = int(rssi) if rssi is not None else None
    except Exception:
        rssi = None

    if not ssid:
        print(f"⚠️ NET sin SSID. payload={payload!r}")
        return

    sql = """
    INSERT INTO wifi_networks (ssid, last_ip, last_rssi, last_seen)
    VALUES (%s, %s, %s, NOW())
    ON DUPLICATE KEY UPDATE
        last_ip=VALUES(last_ip),
        last_rssi=VALUES(last_rssi),
        last_seen=VALUES(last_seen),
        updated_at=CURRENT_TIMESTAMP
    """
    try:
        conn = get_db_connection()
        try:

            cur = conn.cursor()
            cur.execute(sql, (ssid, ip, rssi))
            conn.commit()
            cur.close()
            print(f"🗂️ wifi_networks upsert: ssid={ssid} ip={ip} rssi={rssi}")
        finally:
            conn.close()
    except Exception as e:
        print(f"❌ DB error actualizando wifi_networks: {e}")


def _on_connect(client: mqtt.Client, userdata, flags, rc):
    if rc == 0:
        print("✅ MQTT conectado")
        client.subscribe(SUBSCRIPTIONS)
        print(f"📡 Suscrito a: {', '.join([s[0] for s in SUBSCRIPTIONS])}")
    else:
        print(f"❌ Error MQTT connect rc={rc}")


def _procesar_data(msg: mqtt.MQTTMessage):
    topic = getattr(msg, "topic", "")
    raw = msg.payload.decode("utf-8", errors="ignore")
    try:
        payload = json.loads(raw)
    except Exception as e:
        print(f"❌ Error parseando JSON en {topic}: {e} | raw={raw!r}")
        return

    mapped = _map_lecturas(payload)

    with _datos_lock:
        _datos_cache[:] = mapped

    # Actualizar acumulador por sensor (persiste entre mensajes MQTT)
    with _sensor_latest_lock:
        for d in mapped:
            key = f"{d['sensor_id']}_{d['tipo']}"
            ts_ms = d.get("lectura", {}).get("timestamp")
            ts_str = (
                datetime.fromtimestamp(ts_ms / 1000.0).strftime('%Y-%m-%d %H:%M:%S')
                if ts_ms else None
            )
            _sensor_latest[key] = {
                "sensor_id": d["sensor_id"],
                "nombre":    d["nombre"],
                "tipo":      d["tipo"],
                "puerto":    d.get("puerto"),
                "cabinetId": d.get("gabinete_id") or "cab-desconocido",
                "lectura": {
                    "valor":     d["lectura"]["valor"],
                    "unidad":    d["lectura"]["unidad"],
                    "timestamp": ts_str,
                },
            }

    if not mapped:
        print("ℹ️ sensores/datos sin lecturas. No hay inserts.")
        return

    try:
        conn = get_db_connection()
        try:

            cur = conn.cursor()
            sql = """
            INSERT INTO lecturas (sensor_id, nombre_sensor, tipo_medida, valor, unidad, puerto, timestamp)
            VALUES (%s, %s, %s, %s, %s, %s, NOW())
            """
            batch = [
                (
                    d["sensor_id"],
                    d["nombre"],
                    d["tipo"],
                    d["lectura"]["valor"],
                    d["lectura"]["unidad"],
                    d.get("puerto")
                )
                for d in mapped
            ]
            cur.executemany(sql, batch)
            conn.commit()
            cur.close()
            print(f"✅ Insertados en BD: {len(mapped)} lecturas")
        finally:
            conn.close()
    except Exception as db_error:
        print(f"❌ Error insertando en BD: {db_error}")

    print(f"📥 Lecturas recibidas: {len(mapped)} items")

    # Push en tiempo real a los clientes SSE conectados
    _push_sse_snapshot()

    for d in mapped:
        try:
            ts_ms = d.get("lectura", {}).get("timestamp")
            ts_dt = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).replace(tzinfo=None) if ts_ms else datetime.utcnow()

            evaluate_new_reading({
                "sensor_id":  d.get("sensor_id"),
                "nombre":     d.get("nombre", ""),
                "tipo":       d.get("tipo"),
                "valor":      float(d.get("lectura", {}).get("valor")),
                "unidad":     d.get("lectura", {}).get("unidad", ""),
                "ts":         ts_dt,
                "gabinete_id": d.get("gabinete_id"),
            })
        except Exception as e:
            print(f"[alerts] Error en evaluación: {e}")


def _procesar_status(msg: mqtt.MQTTMessage):
    topic = getattr(msg, "topic", "")
    try:
        data = json.loads(msg.payload.decode("utf-8", errors="ignore"))
    except Exception as e:
        print("❌ Error parseando status:", e)
        return

    parts = topic.split("/")
    if len(parts) < 3:
        print("⚠️ Tópico status inesperado:", topic)
        return
    mac = parts[1].upper()

    estado = {
        "ssid": data.get("ssid", ""),
        "wifi_connected": bool(data.get("wifi_connected", False)),
        "mqtt_connected": bool(data.get("mqtt_connected", False)),
        "ip": data.get("ip", ""),
        "last_update": data.get("last_update", None),
        "_topic": topic,
        "_ts_backend": time.time()
    }

    with _estado_lock:
        _estado_cache[mac] = estado

    print(f"🟢 Estado [{mac}] wifi={estado['wifi_connected']} mqtt={estado['mqtt_connected']} ssid={estado['ssid']} ip={estado['ip']}")


def _procesar_net(msg: mqtt.MQTTMessage):
    payload = msg.payload.decode("utf-8", errors="ignore")
    _update_wifi_from_net_payload(payload)


def _on_message(client: mqtt.Client, userdata, msg: mqtt.MQTTMessage):
    t = getattr(msg, "topic", "")
    if t.startswith("uad/") and t.endswith("/hb"):
        return


def _attach_topic_callbacks(c: mqtt.Client):
    c.message_callback_add(TOPIC_DATA, lambda cli, ud, m: _procesar_data(m))
    c.message_callback_add(TOPIC_STATUS, lambda cli, ud, m: _procesar_status(m))
    c.message_callback_add(TOPIC_NET, lambda cli, ud, m: _procesar_net(m))


def start_mqtt():
    def run():
        global _mqtt_pub_client
        c = mqtt.Client()
        c.on_connect = _on_connect
        c.on_message = _on_message
        c.reconnect_delay_set(min_delay=1, max_delay=30)
        _attach_topic_callbacks(c)

        try:
            c.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        except Exception as e:
            print("❌ No se pudo conectar al broker MQTT:", e)
            return

        with _pub_lock:
            _mqtt_pub_client = c

        print("🔄 Cliente MQTT en background...")
        c.loop_forever()

    th = threading.Thread(target=run, daemon=True)
    th.start()


def publish_mqtt(topic: str, payload: str, qos: int = 0) -> bool:
    """Publica un mensaje MQTT desde cualquier ruta Flask."""
    with _pub_lock:
        c = _mqtt_pub_client
    if c is None:
        print(f"[MQTT] publish_mqtt: cliente no disponible (topic={topic})")
        return False
    try:
        result = c.publish(topic, payload, qos=qos)
        return result.rc == 0
    except Exception as e:
        print(f"[MQTT] publish_mqtt error: {e}")
        return False


def get_datos() -> List[Dict[str, Any]]:
    with _datos_lock:
        return list(_datos_cache)


def obtener_estado(mac: Optional[str] = None) -> Optional[Dict[str, Any]]:
    with _estado_lock:
        if mac:
            return _estado_cache.get(mac.upper())
        for _, v in _estado_cache.items():
            return v
        return None


def listar_macs() -> List[str]:
    with _estado_lock:
        return list(_estado_cache.keys())
