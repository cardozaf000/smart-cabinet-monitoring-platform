import spidev
import RPi.GPIO as GPIO
import time
import math
import json
import os
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime
import mysql.connector

DC_PIN  = 24
RST_PIN = 25
WIDTH   = 240
HEIGHT  = 240

CONFIG_PATH  = "/home/admin/backend/display_config.json"
MOUNT_OFFSET = 86   # rotación física de montaje — equivale al "0°" del usuario

DEFAULT_TFT = {
    "enabled": True,
    "mode": "sensor_data",
    "rotation_cw": 90,
    "rotation_fine": 0,
    "custom_lines": ["", "", ""],
}


def load_tft_config():
    try:
        with open(CONFIG_PATH) as f:
            data = json.load(f)
        return {**DEFAULT_TFT, **data.get("tft", {})}
    except Exception:
        return dict(DEFAULT_TFT)


# ── Driver GC9A01 ─────────────────────────────────────────────
class GC9A01:
    def __init__(self):
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)
        GPIO.setup(DC_PIN,  GPIO.OUT)
        GPIO.setup(RST_PIN, GPIO.OUT)
        self.spi = spidev.SpiDev()
        self.spi.open(0, 0)
        self.spi.max_speed_hz = 40_000_000
        self.spi.mode = 0
        self._reset()
        self._init()

    def _reset(self):
        GPIO.output(RST_PIN, GPIO.HIGH); time.sleep(0.05)
        GPIO.output(RST_PIN, GPIO.LOW);  time.sleep(0.05)
        GPIO.output(RST_PIN, GPIO.HIGH); time.sleep(0.15)

    def _cmd(self, cmd):
        GPIO.output(DC_PIN, GPIO.LOW)
        self.spi.writebytes([cmd])

    def _data(self, data):
        GPIO.output(DC_PIN, GPIO.HIGH)
        for i in range(0, len(data), 4096):
            self.spi.writebytes2(data[i:i+4096])

    def _send(self, cmd, data=None):
        self._cmd(cmd)
        if data: self._data(data)

    def _init(self):
        for cmd, data in [
            (0xEF,[]),(0xEB,[0x14]),(0xFE,[]),(0xEF,[]),(0xEB,[0x14]),
            (0x84,[0x40]),(0x85,[0xFF]),(0x86,[0xFF]),(0x87,[0xFF]),
            (0x88,[0x0A]),(0x89,[0x21]),(0x8A,[0x00]),(0x8B,[0x80]),
            (0x8C,[0x01]),(0x8D,[0x01]),(0x8E,[0xFF]),(0x8F,[0xFF]),
            (0xB6,[0x00,0x00]),(0x3A,[0x05]),(0x90,[0x08,0x08,0x08,0x08]),
            (0xBD,[0x06]),(0xBC,[0x00]),(0xFF,[0x60,0x01,0x04]),
            (0xC3,[0x13]),(0xC4,[0x13]),(0xC9,[0x22]),(0xBE,[0x11]),
            (0xE1,[0x10,0x0E]),(0xDF,[0x21,0x0C,0x02]),
            (0xF0,[0x45,0x09,0x08,0x08,0x26,0x2A]),
            (0xF1,[0x43,0x70,0x72,0x36,0x37,0x6F]),
            (0xF2,[0x45,0x09,0x08,0x08,0x26,0x2A]),
            (0xF3,[0x43,0x70,0x72,0x36,0x37,0x6F]),
            (0xED,[0x1B,0x0B]),(0xAE,[0x77]),(0xCD,[0x63]),
            (0x70,[0x07,0x07,0x04,0x0E,0x0F,0x09,0x07,0x08,0x03]),
            (0xE8,[0x34]),
            (0x62,[0x18,0x0D,0x71,0xED,0x70,0x70,0x18,0x0F,0x71,0xEF,0x70,0x70]),
            (0x63,[0x18,0x11,0x71,0xF1,0x70,0x70,0x18,0x13,0x71,0xF3,0x70,0x70]),
            (0x64,[0x28,0x29,0xF1,0x01,0xF1,0x00,0x07]),
            (0x66,[0x3C,0x00,0xCD,0x67,0x45,0x45,0x10,0x00,0x00,0x00]),
            (0x67,[0x00,0x3C,0x00,0x00,0x00,0x01,0x54,0x10,0x32,0x98]),
            (0x74,[0x10,0x85,0x80,0x00,0x00,0x4E,0x00]),
            (0x98,[0x3E,0x07]),(0x36,[0x48]),(0x35,[]),(0x21,[]),
        ]:
            self._send(cmd, data if data else None)
        self._cmd(0x11); time.sleep(0.12)
        self._cmd(0x29); time.sleep(0.02)

    def show(self, img):
        self._send(0x2A, [0x00,0x00,0x00,0xEF])
        self._send(0x2B, [0x00,0x00,0x00,0xEF])
        self._cmd(0x2C)
        buf = bytearray(WIDTH * HEIGHT * 2)
        for i, (r,g,b) in enumerate(img.getdata()):
            rgb = ((r&0xF8)<<8)|((g&0xFC)<<3)|(b>>3)
            buf[i*2] = rgb>>8; buf[i*2+1] = rgb&0xFF
        self._data(buf)

    def cleanup(self):
        self.spi.close(); GPIO.cleanup()


# ── Base de datos ─────────────────────────────────────────────
DB_CFG = dict(
    host="localhost", user="iotuser",
    password="iotpass123", database="monitoring_iot",
    connection_timeout=3
)


def get_sensor_data():
    try:
        conn = mysql.connector.connect(**DB_CFG)
        cur  = conn.cursor()
        cur.execute("""
            SELECT l.tipo_medida, l.valor, l.sensor_id, l.timestamp
            FROM lecturas l
            INNER JOIN (
                SELECT sensor_id, tipo_medida, MAX(timestamp) AS max_ts
                FROM lecturas
                WHERE tipo_medida IN ('temperatura', 'humedad')
                  AND timestamp >= NOW() - INTERVAL 5 MINUTE
                GROUP BY sensor_id, tipo_medida
            ) ult ON l.sensor_id   = ult.sensor_id
                 AND l.tipo_medida = ult.tipo_medida
                 AND l.timestamp   = ult.max_ts
        """)
        rows = cur.fetchall()
        temps  = [(float(r[1]), r[3]) for r in rows if r[0] == 'temperatura']
        hums   = [(float(r[1]), r[3]) for r in rows if r[0] == 'humedad']
        t_sids = set(r[2] for r in rows if r[0] == 'temperatura')
        t_val  = round(max(v for v, _ in temps), 1) if temps else None
        h_val  = round(sum(v for v, _ in hums) / len(hums), 1) if hums else None
        n      = len(t_sids)
        ts     = max((t for _, t in temps + hums), default=None)
        anomalia = None
        try:
            cur.execute(
                "SELECT es_anomalia FROM anomalias_ml ORDER BY timestamp DESC LIMIT 1"
            )
            row = cur.fetchone()
            if row:
                anomalia = bool(row[0])
        except Exception:
            pass
        cur.close(); conn.close()
        return t_val, h_val, n, anomalia, ts
    except Exception:
        return None, None, 0, None, None


def get_cpu_temp():
    try:
        with open('/sys/class/thermal/thermal_zone0/temp') as f:
            return round(int(f.read()) / 1000.0, 1)
    except Exception:
        return None


def get_door_state():
    """Devuelve True si hay proximidad detectada (puerta abierta)."""
    try:
        conn = mysql.connector.connect(**DB_CFG)
        cur  = conn.cursor()
        cur.execute("""
            SELECT valor FROM lecturas
            WHERE tipo_medida = 'proximidad'
              AND timestamp >= NOW() - INTERVAL 1 MINUTE
            ORDER BY timestamp DESC LIMIT 1
        """)
        row = cur.fetchone()
        cur.close(); conn.close()
        if row:
            return float(row[0]) < 150  # mm — umbral: < 15 cm = abierta
        return None
    except Exception:
        return None


# ── Helpers de dibujo ─────────────────────────────────────────
def _polar(cx, cy, r, deg):
    rad = ((deg - 90) * math.pi) / 180
    return cx + r * math.cos(rad), cy + r * math.sin(rad)

def _arc(cx, cy, r, a1, a2):
    sx, sy = _polar(cx, cy, r, a1)
    ex, ey = _polar(cx, cy, r, a2)
    large  = 1 if (a2 - a1) > 180 else 0
    return f"M {sx:.1f} {sy:.1f} A {r} {r} 0 {large} 1 {ex:.1f} {ey:.1f}"

def load_fonts():
    try:
        bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        reg  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        return {
            'title': ImageFont.truetype(reg,  12),
            'lbl':   ImageFont.truetype(reg,  11),
            'val':   ImageFont.truetype(bold, 46),
            'unit':  ImageFont.truetype(bold, 17),
            'stat':  ImageFont.truetype(bold, 15),
            'small': ImageFont.truetype(reg,  11),
            'mid':   ImageFont.truetype(bold, 24),
            'big':   ImageFont.truetype(bold, 38),
            'clock': ImageFont.truetype(bold, 32),
            'date':  ImageFont.truetype(reg,  16),
        }
    except Exception:
        d = ImageFont.load_default()
        return {k: d for k in ('title','lbl','val','unit','stat','small','mid','big','clock','date')}

def centered(draw, text, font, y, color):
    b  = draw.textbbox((0, 0), text, font=font)
    tx = (240 - (b[2]-b[0])) // 2
    draw.text((tx, y), text, font=font, fill=color)

def dark_bg(draw):
    cx = cy = 120
    for r in range(116, 0, -1):
        f = r / 116
        draw.ellipse([cx-r, cy-r, cx+r, cy+r],
                     fill=(int(5*f), int(9*f), int(20*f)))
    draw.arc([3, 3, 237, 237], 0, 360, fill=(18, 24, 44), width=5)

def temp_color(t):
    v = min(max((t - 30) / 45.0, 0.0), 1.0)
    if v < 0.33:
        tt = v / 0.33
        return (int(tt*80), int(200+tt*55), int(255-tt*130))
    elif v < 0.66:
        tt = (v-0.33)/0.33
        return (int(80+tt*175), 255, int(125-tt*125))
    else:
        tt = (v-0.66)/0.34
        return (255, int(255-tt*200), 0)

def hum_color(h):
    v = min(max(h/100.0, 0.0), 1.0)
    return (int(10+v*20), int(80+v*110), int(180+v*75))

def bar(draw, x, y, w, h, pct, color):
    draw.rectangle([x, y, x+w, y+h], fill=(18, 24, 42))
    if pct <= 0:
        return
    fw = max(int(w * pct), 4)
    cr, cg, cb = color
    for px in range(fw):
        fade = 0.45 + 0.55*(px/fw)
        draw.rectangle([x+px, y, x+px+1, y+h],
                       fill=(int(cr*fade), int(cg*fade), int(cb*fade)))
    draw.rectangle([x+fw-3, y-1, x+fw+1, y+h+1], fill=color)

def value_with_unit(draw, val_str, unit_str, f_val, f_unit, y, color):
    vb = draw.textbbox((0,0), val_str,  font=f_val)
    ub = draw.textbbox((0,0), unit_str, font=f_unit)
    vw, uw = vb[2]-vb[0], ub[2]-ub[0]
    tx = (240 - vw - 5 - uw) // 2
    cr, cg, cb = color
    for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
        draw.text((tx+dx, y+dy), val_str, font=f_val,  fill=(cr//4,cg//4,cb//4))
    draw.text((tx,      y),    val_str, font=f_val,  fill=color)
    draw.text((tx+vw+5, y+10), unit_str, font=f_unit, fill=color)

def relative_time(ts):
    if ts is None: return ""
    diff = (datetime.now() - ts).total_seconds()
    if diff <  10: return "ahora"
    if diff <  60: return f"hace {int(diff)}s"
    if diff < 3600: return f"hace {int(diff//60)} min"
    return f"hace {int(diff//3600)}h"


# ── Modos de pantalla ─────────────────────────────────────────
def draw_sensor_data(f, t_val, h_val, n_sensors, anomalia, ts):
    img  = Image.new("RGB", (240,240), (0,0,0))
    draw = ImageDraw.Draw(img)
    dark_bg(draw)
    centered(draw, "MONITOREO IoT", f['title'], 22, (65,80,120))
    centered(draw, "TEMP. MÁX",    f['lbl'],   38, (55,68,105))
    if t_val is not None:
        tc = temp_color(t_val)
        value_with_unit(draw, f"{t_val:.1f}", "°C", f['val'], f['unit'], 52, tc)
        bar(draw, 35, 100, 170, 8, min(max((t_val-15)/35,0),1), tc)
    else:
        centered(draw, "—", f['val'], 52, (40,48,72))
        bar(draw, 35, 100, 170, 8, 0, (0,0,0))
    for x in range(45,196):
        v = int(35*max(1-abs(x-120)/75,0))
        draw.point((x,116), fill=(v,v+4,v+16))
    centered(draw, "HUMEDAD PROM.", f['lbl'], 122, (55,68,105))
    if h_val is not None:
        hc = hum_color(h_val)
        value_with_unit(draw, f"{h_val:.1f}", "%", f['val'], f['unit'], 136, hc)
        bar(draw, 35, 185, 170, 8, h_val/100.0, hc)
    else:
        centered(draw, "—", f['val'], 136, (40,48,72))
        bar(draw, 35, 185, 170, 8, 0, (0,0,0))
    if anomalia is True:
        s_col, s_txt = (220,60,60),  "ALERTA"
    elif anomalia is False:
        s_col, s_txt = (30,200,120), "NORMAL"
    else:
        s_col, s_txt = (70,85,120),  "SIN DATOS"
    sb  = draw.textbbox((0,0), s_txt, font=f['stat'])
    sw  = sb[2]-sb[0]; sh = sb[3]-sb[1]
    dot = 4; gap = 7
    sx  = (240-(dot*2+gap+sw))//2
    dy  = 202
    cr,cg,cb = s_col
    draw.ellipse([sx-1,dy-dot-1,sx+dot*2+1,dy+dot+1], fill=(cr//4,cg//4,cb//4))
    draw.ellipse([sx,dy-dot,sx+dot*2,dy+dot], fill=s_col)
    draw.text((sx+dot*2+gap, dy-sh//2), s_txt, font=f['stat'], fill=s_col)
    pie = f"{n_sensors} sensor{'es' if n_sensors!=1 else ''}"
    if ts: pie += f"  ·  {relative_time(ts)}"
    centered(draw, pie, f['small'], 219, (45,55,88))
    return img


def draw_cpu_gauge(f):
    img  = Image.new("RGB", (240,240), (0,0,0))
    draw = ImageDraw.Draw(img)
    dark_bg(draw)
    cx = cy = 120

    cpu_temp = get_cpu_temp()
    tc  = temp_color(cpu_temp) if cpu_temp is not None else (70,85,120)
    t_str = f"{cpu_temp:.1f}°C" if cpu_temp is not None else "—"

    # Arco gauge usando Pillow nativo (0°=derecha, sentido horario)
    # Nuestro gauge: 60° → 300° en Pillow = 240° totales
    R, W = 76, 12
    box  = [cx-R, cy-R, cx+R, cy+R]
    draw.arc(box, 60, 300, fill=(26,36,60), width=W)          # track
    if cpu_temp is not None:
        pct      = min(max(cpu_temp / 100.0, 0), 1)
        fill_end = 60 + pct * 240
        draw.arc(box, 60, fill_end, fill=tc, width=W)         # relleno

    # Layout sin solapamiento: lbl(14px) + big(50px) + sep + clock(42px) + small(14px)
    centered(draw, "CPU TEMP",               f['lbl'],   48, (65,80,120))
    centered(draw, t_str,                    f['big'],   68, tc)
    draw.line([(cx-46, 124), (cx+46, 124)],  fill=(38,51,72), width=1)
    ahora = datetime.now()
    centered(draw, ahora.strftime("%H:%M:%S"), f['clock'], 130, (0,175,215))
    centered(draw, ahora.strftime("%d/%m/%Y"), f['small'], 178, (44,58,90))
    return img


def draw_clock(f):
    img  = Image.new("RGB", (240,240), (0,0,0))
    draw = ImageDraw.Draw(img)
    dark_bg(draw)
    ahora = datetime.now()
    dias  = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"]
    centered(draw, ahora.strftime("%H:%M:%S"),   f['clock'], 76,  (0,175,215))
    draw.line([(55,126),(185,126)], fill=(38,51,72), width=1)
    centered(draw, dias[ahora.weekday()],         f['date'],  136, (107,122,158))
    centered(draw, ahora.strftime("%d/%m/%Y"),    f['mid'],   164, (74,85,130))
    return img


def draw_door_status(f):
    img  = Image.new("RGB", (240,240), (0,0,0))
    draw = ImageDraw.Draw(img)
    dark_bg(draw)
    ahora = datetime.now()
    # clock(42px) en y=28 → termina en ~70; date(14px) en y=78 → sin solapamiento
    centered(draw, ahora.strftime("%H:%M:%S"), f['clock'], 28,  (0,175,215))
    centered(draw, ahora.strftime("%d/%m/%Y"), f['small'], 78,  (58,74,112))
    draw.line([(55,96),(185,96)], fill=(38,51,72), width=1)
    door_open = get_door_state()
    centered(draw, "PUERTA", f['lbl'], 106, (74,88,130))
    if door_open is True:
        s_col, s_txt, d_col = (220,60,60),  "Abierta",   (220,60,60)
    elif door_open is False:
        s_col, s_txt, d_col = (30,200,120), "Cerrada",   (30,200,120)
    else:
        s_col, s_txt, d_col = (70,85,120),  "Sin datos", (70,85,120)
    centered(draw, s_txt, f['mid'], 122, s_col)
    draw.ellipse([100,152,140,192], fill=d_col)
    sb = draw.textbbox((0,0), "OK", font=f['lbl'])
    draw.text(((240-(sb[2]-sb[0]))//2, 164), "OK", font=f['lbl'], fill=(0,0,0))
    return img


def draw_custom(f, lines):
    img  = Image.new("RGB", (240,240), (0,0,0))
    draw = ImageDraw.Draw(img)
    dark_bg(draw)
    ys = [80, 112, 140]
    colors = [(226,232,240),(148,163,184),(100,116,139)]
    fonts  = [f['mid'], f['date'], f['small']]
    for i, (line, y, color, font) in enumerate(zip(lines, ys, colors, fonts)):
        if line:
            centered(draw, line, font, y, color)
    centered(draw, "Personalizado", f['small'], 210, (45,55,88))
    return img


# ── Main ──────────────────────────────────────────────────────
display = GC9A01()
print("Pantalla OK — monitor iniciando")

fonts        = load_fonts()
cfg          = load_tft_config()
ultimo_cfg   = 0
ultimo_db    = 0
t_val = h_val = anomalia = ts = None
n_sensors    = 0

try:
    while True:
        ahora = time.time()

        # Recargar config cada 4 s (cambios desde la web se aplican aquí)
        if ahora - ultimo_cfg >= 4:
            cfg        = load_tft_config()
            ultimo_cfg = ahora

        if not cfg.get("enabled", True):
            # Pantalla apagada — enviar negro
            img = Image.new("RGB", (240,240), (0,0,0))
            display.show(img)
            time.sleep(3)
            continue

        mode = cfg.get("mode", "sensor_data")
        rot  = MOUNT_OFFSET + int(cfg.get("rotation_cw", 0)) + int(cfg.get("rotation_fine", 0))

        # Actualizar sensores solo cuando se necesitan
        if mode in ("sensor_data", "door_status"):
            if ahora - ultimo_db >= 4:
                t_val, h_val, n_sensors, anomalia, ts = get_sensor_data()
                ultimo_db = ahora

        if mode == "sensor_data":
            img = draw_sensor_data(fonts, t_val, h_val, n_sensors, anomalia, ts)
        elif mode == "cpu_gauge":
            img = draw_cpu_gauge(fonts)
        elif mode == "clock":
            img = draw_clock(fonts)
        elif mode == "door_status":
            img = draw_door_status(fonts)
        elif mode == "custom":
            lines = cfg.get("custom_lines", ["", "", ""])
            img   = draw_custom(fonts, lines)
        else:
            img = draw_sensor_data(fonts, t_val, h_val, n_sensors, anomalia, ts)

        display.show(img.rotate(-rot))
        time.sleep(3)

except KeyboardInterrupt:
    display.cleanup()
    print("Detenido.")
