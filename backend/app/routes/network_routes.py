import json
import os
import re
import subprocess
from flask import Blueprint, jsonify, request
from app.auth_utils import token_required, roles_required
from app.audit_utils import log_action

network_bp = Blueprint("network", __name__)

CONFIG_PATH      = os.path.join(os.path.dirname(__file__), "..", "..", "network_config.json")
DHCPCD_CONF      = "/etc/dhcpcd.conf"
WPA_SUPPLICANT   = "/etc/wpa_supplicant/wpa_supplicant.conf"

IFACE_DEFAULTS = {
    "mode": "dhcp", "ip": "", "mask": "24", "gateway": "", "dns": "8.8.8.8"
}

# ──────────────────────────────────────────────
#  Helpers: config JSON (eth0 + wlan0)
# ──────────────────────────────────────────────
def load_config():
    """Carga network_config.json con compatibilidad hacia versiones antiguas."""
    defaults = {
        "eth0":  dict(IFACE_DEFAULTS),
        "wlan0": dict(IFACE_DEFAULTS),
    }
    try:
        if os.path.exists(CONFIG_PATH):
            with open(CONFIG_PATH) as f:
                saved = json.load(f)
            # Migrar formato antiguo: {"iface": "eth0", "mode": ...} → nuevo
            if "iface" in saved:
                iface = saved.get("iface", "eth0")
                defaults[iface] = {
                    "mode": saved.get("mode", "dhcp"),
                    "ip":   saved.get("ip", ""),
                    "mask": saved.get("mask", "24"),
                    "gateway": saved.get("gateway", ""),
                    "dns": saved.get("dns", "8.8.8.8"),
                }
                return defaults
            # Formato nuevo
            for iface in ("eth0", "wlan0"):
                if iface in saved:
                    defaults[iface] = {**IFACE_DEFAULTS, **saved[iface]}
    except Exception:
        pass
    return defaults


def save_config(cfg):
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    with open(CONFIG_PATH, "w") as f:
        json.dump(cfg, f, indent=2)


# ──────────────────────────────────────────────
#  Helpers: sistema
# ──────────────────────────────────────────────
def _iface_live_ip(iface):
    """Devuelve (ip, mask_prefix) en vivo con 'ip addr show'."""
    try:
        proc = subprocess.run(
            ["ip", "addr", "show", iface],
            capture_output=True, text=True, timeout=5
        )
        m = re.search(r"inet (\d+\.\d+\.\d+\.\d+)/(\d+)", proc.stdout)
        return (m.group(1), m.group(2)) if m else ("", "24")
    except Exception:
        return ("", "24")


def _iface_up(iface):
    """True si la interfaz tiene enlace activo."""
    try:
        proc = subprocess.run(
            ["ip", "link", "show", iface],
            capture_output=True, text=True, timeout=5
        )
        return "UP" in proc.stdout and "NO-CARRIER" not in proc.stdout
    except Exception:
        return False


def _wifi_current_ssid():
    """SSID al que está conectado wlan0 ahora mismo."""
    try:
        proc = subprocess.run(
            ["iwgetid", "wlan0", "-r"],
            capture_output=True, text=True, timeout=5
        )
        return proc.stdout.strip()
    except Exception:
        return ""


def _wifi_configured_ssid():
    """SSID guardado en wpa_supplicant.conf."""
    try:
        with open(WPA_SUPPLICANT) as f:
            content = f.read()
        m = re.search(r'ssid="([^"]+)"', content)
        return m.group(1) if m else ""
    except Exception:
        return ""


# ──────────────────────────────────────────────
#  Helpers: dhcpcd.conf
# ──────────────────────────────────────────────
_BLOCK_DIRECTIVES = (
    "static ", "fallback ", "inform ", "option ",
    "request ", "nohook ", "nodhcp ", "noipv6 ", "slaac ",
)


def _strip_dhcpcd_block(content, iface):
    """Elimina el bloque 'interface <iface>' (y 'profile static_<iface>') del conf."""
    profile_name = f"static_{iface}"
    lines = content.splitlines()
    result = []
    skip = False

    for line in lines:
        stripped = line.strip()

        # Inicio de bloque a eliminar
        if stripped == f"profile {profile_name}" or stripped == f"interface {iface}":
            skip = True
            continue

        # Inicio de otro bloque → dejar de saltar
        if skip and (stripped.startswith("interface ") or stripped.startswith("profile ")):
            skip = False

        if skip:
            # Directivas del bloque → saltar
            if stripped == "" or stripped.startswith("#") or \
               any(stripped.startswith(d) for d in _BLOCK_DIRECTIVES):
                if stripped == "":   # línea en blanco cierra el bloque
                    skip = False
                continue
            else:
                skip = False   # línea inesperada → dejar de saltar

        result.append(line)

    return "\n".join(result).rstrip() + "\n"


def _apply_dhcpcd(iface, mode, ip, mask, gateway, dns):
    """Escribe dhcpcd.conf con sudo tee y reinicia dhcpcd."""
    with open(DHCPCD_CONF) as f:
        content = f.read()

    content = _strip_dhcpcd_block(content, iface)

    if mode == "static" and ip:
        block = f"\ninterface {iface}\nstatic ip_address={ip}/{mask}\n"
        if gateway:
            block += f"static routers={gateway}\n"
        if dns:
            block += f"static domain_name_servers={dns}\n"
        content = content.rstrip() + "\n" + block

    proc = subprocess.run(
        ["sudo", "tee", DHCPCD_CONF],
        input=content.encode(), capture_output=True, timeout=10
    )
    if proc.returncode != 0:
        raise RuntimeError(f"tee falló: {proc.stderr.decode().strip()}")

    subprocess.run(
        ["sudo", "systemctl", "restart", "dhcpcd"],
        check=True, capture_output=True, timeout=20
    )


# ──────────────────────────────────────────────
#  Helpers: wpa_supplicant
# ──────────────────────────────────────────────
def _write_wpa_supplicant(ssid, password, country="CR"):
    content = (
        f"country={country}\n"
        f"ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\n"
        f"update_config=1\n\n"
        f"network={{\n"
        f'\tssid="{ssid}"\n'
        f'\tpsk="{password}"\n'
        f"\tkey_mgmt=WPA-PSK\n"
        f"}}\n"
    )
    proc = subprocess.run(
        ["sudo", "tee", WPA_SUPPLICANT],
        input=content.encode(), capture_output=True, timeout=10
    )
    if proc.returncode != 0:
        raise RuntimeError(f"No se pudo escribir wpa_supplicant.conf: {proc.stderr.decode().strip()}")

    # Reconfigura wpa_supplicant sin cortar la conexión actual
    subprocess.run(
        ["sudo", "wpa_cli", "-i", "wlan0", "reconfigure"],
        capture_output=True, timeout=10
    )


def _scan_wifi():
    """Escanea redes WiFi disponibles con iwlist."""
    try:
        proc = subprocess.run(
            ["sudo", "iwlist", "wlan0", "scan"],
            capture_output=True, text=True, timeout=15
        )
        networks = []
        current = {}
        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("Cell ") and "Address:" in line:
                if current.get("ssid"):
                    networks.append(current)
                current = {}
            elif line.startswith("ESSID:"):
                ssid = line.split('"')[1] if '"' in line else ""
                if ssid:
                    current["ssid"] = ssid
            elif "Signal level=" in line:
                m = re.search(r"Signal level=(-?\d+)", line)
                if m:
                    current["signal"] = int(m.group(1))
            elif "WPA2" in line:
                current["security"] = "WPA2"
            elif "WPA" in line and "security" not in current:
                current["security"] = "WPA"
            elif 'Encryption key:off' in line and "security" not in current:
                current["security"] = "Abierta"

        if current.get("ssid"):
            networks.append(current)

        # Deduplicar por SSID, quedarse con la señal más fuerte
        seen = {}
        for n in networks:
            s = n["ssid"]
            if s not in seen or n.get("signal", -999) > seen[s].get("signal", -999):
                seen[s] = n

        return sorted(seen.values(), key=lambda x: x.get("signal", -999), reverse=True)
    except Exception:
        return []


# ══════════════════════════════════════════════
#  ENDPOINT: GET /network/rpi_config
# ══════════════════════════════════════════════
@network_bp.route("/network/rpi_config", methods=["GET"])
@token_required
def get_network_config():
    try:
        cfg = load_config()

        # IPs en vivo
        eth0_ip_live, eth0_mask_live = _iface_live_ip("eth0")
        wlan0_ip_live, wlan0_mask_live = _iface_live_ip("wlan0")

        return jsonify({
            "eth0": {
                **cfg["eth0"],
                "ip_live":   eth0_ip_live,
                "mask_live": eth0_mask_live,
                "connected": _iface_up("eth0"),
            },
            "wlan0": {
                **cfg["wlan0"],
                "ip_live":        wlan0_ip_live,
                "mask_live":      wlan0_mask_live,
                "connected":      _iface_up("wlan0") or bool(wlan0_ip_live),
                "ssid_connected": _wifi_current_ssid(),
                "ssid_configured": _wifi_configured_ssid(),
            },
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════
#  ENDPOINT: POST /network/rpi_config  (IP eth0 / wlan0)
# ══════════════════════════════════════════════
@network_bp.route("/network/rpi_config", methods=["POST"])
@roles_required("admin", "superadmin")
def set_network_config():
    data = request.get_json(silent=True) or {}
    iface = data.get("iface", "eth0")
    if iface not in ("eth0", "wlan0"):
        return jsonify({"error": "Interfaz no válida. Usa 'eth0' o 'wlan0'."}), 400

    # Solo superadmin puede cambiar wlan0 IP
    if iface == "wlan0" and (getattr(request, "user", {}) or {}).get("rol") != "superadmin":
        return jsonify({"error": "Se requiere rol superadmin para cambiar la IP de wlan0."}), 403

    iface_cfg = {
        "mode":    data.get("mode", "dhcp"),
        "ip":      data.get("ip", ""),
        "mask":    data.get("mask", "24"),
        "gateway": data.get("gateway", ""),
        "dns":     data.get("dns", "8.8.8.8"),
    }

    cfg = load_config()
    cfg[iface] = iface_cfg
    save_config(cfg)

    applied = False
    msg = "Configuración guardada."
    try:
        _apply_dhcpcd(iface, **iface_cfg)
        applied = True
        msg = "Configuración guardada y aplicada. El servicio dhcpcd se reinició."
    except Exception as e:
        msg = f"Guardado, pero no se pudo aplicar: {e}"

    log_action(f"NETWORK_{iface.upper()}", "network", iface,
               {**iface_cfg, "applied": applied},
               "success" if applied else "warning")
    return jsonify({"ok": True, "message": msg, "applied": applied, "iface": iface, **iface_cfg})


# ══════════════════════════════════════════════
#  ENDPOINT: POST /network/wifi_ssid  (superadmin)
# ══════════════════════════════════════════════
@network_bp.route("/network/wifi_ssid", methods=["POST"])
@roles_required("superadmin")
def set_wifi_ssid():
    data = request.get_json(silent=True) or {}
    ssid     = (data.get("ssid") or "").strip()
    password = data.get("password") or ""

    if not ssid:
        return jsonify({"error": "El SSID es requerido."}), 400
    if len(password) < 8:
        return jsonify({"error": "La contraseña WiFi debe tener al menos 8 caracteres."}), 400

    try:
        _write_wpa_supplicant(ssid, password)
        log_action("WIFI_SSID", "network", "wlan0", {"ssid": ssid})
        return jsonify({
            "ok": True,
            "message": f"Red WiFi '{ssid}' configurada. El dispositivo se conectará en unos segundos.",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ══════════════════════════════════════════════
#  ENDPOINT: GET /network/wifi_scan  (superadmin)
# ══════════════════════════════════════════════
@network_bp.route("/network/wifi_scan", methods=["GET"])
@roles_required("superadmin")
def wifi_scan():
    try:
        networks = _scan_wifi()
        return jsonify({"ok": True, "networks": networks})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
