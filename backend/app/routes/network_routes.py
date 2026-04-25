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
WLAN_IFACE       = "wlan0"

# Rutas absolutas — gunicorn corre sin PATH del sistema
SUDO      = "/usr/bin/sudo"
NMCLI     = "/usr/bin/nmcli"
IWLIST    = "/sbin/iwlist"
IWGETID   = "/usr/sbin/iwgetid"
WPA_CLI   = "/usr/sbin/wpa_cli"
SYSTEMCTL = "/usr/bin/systemctl"
TEE       = "/usr/bin/tee"
IP_CMD    = "/usr/sbin/ip"

IFACE_DEFAULTS = {
    "mode": "dhcp", "ip": "", "mask": "24", "gateway": "", "dns": "8.8.8.8"
}

# ──────────────────────────────────────────────
#  Detección de gestor de red
# ──────────────────────────────────────────────
def _has_nm():
    """True si NetworkManager está activo (Pi OS Bookworm)."""
    try:
        r = subprocess.run(
            [SYSTEMCTL, "is-active", "--quiet", "NetworkManager"],
            timeout=4
        )
        return r.returncode == 0
    except Exception:
        return False

def _has_dhcpcd():
    """True si dhcpcd está activo (Pi OS Bullseye/Buster)."""
    try:
        r = subprocess.run(
            [SYSTEMCTL, "is-active", "--quiet", "dhcpcd"],
            timeout=4
        )
        return r.returncode == 0
    except Exception:
        return False

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
            [IP_CMD, "addr", "show", iface],
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
            [IP_CMD, "link", "show", iface],
            capture_output=True, text=True, timeout=5
        )
        return "UP" in proc.stdout and "NO-CARRIER" not in proc.stdout
    except Exception:
        return False


def _wifi_current_ssid():
    """SSID al que está conectado wlan0 ahora mismo."""
    # nmcli (NetworkManager)
    try:
        proc = subprocess.run(
            [NMCLI, "-t", "-f", "ACTIVE,SSID", "dev", "wifi"],
            capture_output=True, text=True, timeout=5
        )
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                parts = line.rsplit(":", 1)
                if len(parts) == 2 and parts[0].strip().lower() == "yes":
                    return parts[1].replace("\\:", ":").strip()
    except Exception:
        pass
    # Fallback: iwgetid (wpa_supplicant clásico)
    try:
        proc = subprocess.run(
            [IWGETID, WLAN_IFACE, "-r"],
            capture_output=True, text=True, timeout=5
        )
        return proc.stdout.strip()
    except Exception:
        return ""


def _wifi_configured_ssid():
    """SSID guardado (nmcli o wpa_supplicant.conf)."""
    # nmcli: última conexión WiFi guardada
    try:
        proc = subprocess.run(
            [NMCLI, "-t", "-f", "NAME,TYPE", "con", "show"],
            capture_output=True, text=True, timeout=5
        )
        if proc.returncode == 0:
            for line in proc.stdout.splitlines():
                parts = line.rsplit(":", 1)
                if len(parts) == 2 and "wireless" in parts[1].lower():
                    return parts[0].replace("\\:", ":").strip()
    except Exception:
        pass
    # Fallback: wpa_supplicant.conf
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
    """Escribe dhcpcd.conf con sudo tee y reinicia dhcpcd (Pi OS Bullseye)."""
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
        [SUDO, TEE, DHCPCD_CONF],
        input=content.encode(), capture_output=True, timeout=10
    )
    if proc.returncode != 0:
        raise RuntimeError(f"tee falló: {proc.stderr.decode().strip()}")
    subprocess.run(
        [SUDO, SYSTEMCTL, "restart", "dhcpcd"],
        check=True, capture_output=True, timeout=20
    )


def _nm_con_name(iface):
    """Devuelve el nombre de la conexión activa para la interfaz (NetworkManager)."""
    proc = subprocess.run(
        [NMCLI, "-t", "-f", "NAME,DEVICE", "con", "show", "--active"],
        capture_output=True, text=True, timeout=5
    )
    for line in proc.stdout.splitlines():
        parts = line.rsplit(":", 1)
        if len(parts) == 2 and parts[1].strip() == iface:
            return parts[0].replace("\\:", ":").strip()
    # Si no hay activa, buscar la primera para esa interfaz
    proc2 = subprocess.run(
        [NMCLI, "-t", "-f", "NAME,DEVICE", "con", "show"],
        capture_output=True, text=True, timeout=5
    )
    for line in proc2.stdout.splitlines():
        parts = line.rsplit(":", 1)
        if len(parts) == 2 and parts[1].strip() == iface:
            return parts[0].replace("\\:", ":").strip()
    return None


def _apply_nm(iface, mode, ip, mask, gateway, dns):
    """Configura IP con NetworkManager (Pi OS Bookworm)."""
    con = _nm_con_name(iface)
    if not con:
        raise RuntimeError(f"No se encontró conexión para {iface} en NetworkManager.")
    if mode == "dhcp":
        subprocess.run(
            [SUDO, NMCLI, "con", "mod", con,
             "ipv4.method", "auto",
             "ipv4.addresses", "", "ipv4.gateway", "", "ipv4.dns", ""],
            capture_output=True, timeout=10
        )
    else:
        cmd = [SUDO, NMCLI, "con", "mod", con,
               "ipv4.method", "manual",
               "ipv4.addresses", f"{ip}/{mask}"]
        if gateway:
            cmd += ["ipv4.gateway", gateway]
        if dns:
            cmd += ["ipv4.dns", dns]
        subprocess.run(cmd, capture_output=True, timeout=10)
    proc = subprocess.run(
        [SUDO, NMCLI, "con", "up", con, "ifname", iface],
        capture_output=True, text=True, timeout=20
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or proc.stdout.strip())


def _apply_ip_config(iface, mode, ip, mask, gateway, dns):
    """Aplica config IP: intenta NetworkManager, luego dhcpcd."""
    if _has_nm():
        _apply_nm(iface, mode, ip, mask, gateway, dns)
        return
    _apply_dhcpcd(iface, mode, ip, mask, gateway, dns)


# ──────────────────────────────────────────────
#  Helpers: WiFi scan y conexión
# ──────────────────────────────────────────────
def _parse_nmcli_scan(output):
    """Parsea salida de 'nmcli -t -f SSID,SIGNAL,SECURITY dev wifi list'."""
    seen = {}
    for line in output.splitlines():
        if not line.strip():
            continue
        # rsplit desde la derecha: SSID puede tener ':', SIGNAL y SECURITY son los últimos 2 campos
        parts = line.rsplit(":", 2)
        if len(parts) < 3:
            continue
        ssid = parts[0].replace("\\:", ":").strip()
        if not ssid or ssid == "--":
            continue
        try:
            signal_pct = int(parts[1].strip())
        except ValueError:
            signal_pct = 0
        security = parts[2].strip()
        if not security or security == "--":
            security = "Abierta"
        elif "WPA2" in security:
            security = "WPA2"
        elif "WPA" in security:
            security = "WPA"
        # Convertir % → dBm aproximado: 100% ≈ -50 dBm, 0% ≈ -100 dBm
        signal_dbm = int(-100 + signal_pct * 0.5)
        if ssid not in seen or signal_pct > seen[ssid]["_pct"]:
            seen[ssid] = {"ssid": ssid, "signal": signal_dbm,
                          "security": security, "_pct": signal_pct}
    result = [{"ssid": v["ssid"], "signal": v["signal"], "security": v["security"]}
              for v in seen.values()]
    return sorted(result, key=lambda x: x.get("signal", -999), reverse=True)


def _scan_wifi():
    """Escanea redes WiFi. Devuelve (networks, error_str|None)."""
    last_error = None

    # ── Intentar nmcli (NetworkManager / Pi OS Bookworm) ──────────────
    try:
        # Forzar rescan primero
        subprocess.run(
            [SUDO, NMCLI, "dev", "wifi", "rescan", "ifname", WLAN_IFACE],
            capture_output=True, timeout=8
        )
        import time; time.sleep(1)  # esperar que terminen los beacons
        proc = subprocess.run(
            [NMCLI, "--terse", "--fields", "SSID,SIGNAL,SECURITY",
             "dev", "wifi", "list", "ifname", WLAN_IFACE],
            capture_output=True, text=True, timeout=12
        )
        if proc.returncode == 0:
            networks = _parse_nmcli_scan(proc.stdout)
            if networks:
                return networks, None
            # Sin resultados — puede que no haya redes o que wlan0 esté apagada
            last_error = "nmcli no encontró redes (¿wlan0 activa?)"
        else:
            last_error = (proc.stderr.strip() or "nmcli falló") [:200]
    except FileNotFoundError:
        last_error = "nmcli no disponible"
    except Exception as e:
        last_error = f"nmcli error: {e}"

    # ── Fallback: iwlist (wpa_supplicant / Pi OS Bullseye) ─────────────
    try:
        proc = subprocess.run(
            [SUDO, IWLIST, WLAN_IFACE, "scan"],
            capture_output=True, text=True, timeout=15
        )
        if proc.returncode != 0:
            iwlist_err = proc.stderr.strip() or "iwlist falló"
            return [], f"{last_error} | iwlist: {iwlist_err}"

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
                # Puede ser dBm (-45) o porcentaje (65/100)
                m = re.search(r"Signal level=(-?\d+)\s*dBm", line)
                if m:
                    current["signal"] = int(m.group(1))
                else:
                    m2 = re.search(r"Signal level=(\d+)/100", line)
                    if m2:
                        pct = int(m2.group(1))
                        current["signal"] = int(-100 + pct * 0.5)
                    else:
                        m3 = re.search(r"Signal level=(-?\d+)", line)
                        if m3:
                            current["signal"] = int(m3.group(1))
            elif "WPA2" in line:
                current["security"] = "WPA2"
            elif "WPA" in line and "security" not in current:
                current["security"] = "WPA"
            elif "Encryption key:off" in line and "security" not in current:
                current["security"] = "Abierta"

        if current.get("ssid"):
            networks.append(current)

        seen = {}
        for n in networks:
            s = n["ssid"]
            if s not in seen or n.get("signal", -999) > seen[s].get("signal", -999):
                seen[s] = n

        result = sorted(seen.values(), key=lambda x: x.get("signal", -999), reverse=True)
        return result, None
    except Exception as e:
        return [], f"{last_error} | iwlist error: {e}"


def _connect_wifi(ssid, password, country="CR"):
    """Conecta a una red WiFi (nmcli o wpa_supplicant)."""
    # ── nmcli (NetworkManager) ──────────────────────────────────────────
    if _has_nm():
        # Borrar perfil anterior con el mismo SSID si existe
        subprocess.run(
            [SUDO, NMCLI, "connection", "delete", ssid],
            capture_output=True, timeout=8
        )
        proc = subprocess.run(
            [SUDO, NMCLI, "dev", "wifi", "connect", ssid,
             "password", password, "ifname", WLAN_IFACE],
            capture_output=True, text=True, timeout=30
        )
        if proc.returncode != 0:
            err = proc.stderr.strip() or proc.stdout.strip()
            raise RuntimeError(f"nmcli connect falló: {err}")
        return

    # ── Fallback: wpa_supplicant ────────────────────────────────────────
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
        [SUDO, TEE, WPA_SUPPLICANT],
        input=content.encode(), capture_output=True, timeout=10
    )
    if proc.returncode != 0:
        raise RuntimeError(f"No se pudo escribir wpa_supplicant.conf: {proc.stderr.decode().strip()}")
    proc2 = subprocess.run(
        [SUDO, WPA_CLI, "-i", WLAN_IFACE, "reconfigure"],
        capture_output=True, text=True, timeout=10
    )
    if proc2.returncode != 0:
        raise RuntimeError(f"wpa_cli reconfigure falló: {proc2.stderr.strip()}")


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
        _apply_ip_config(iface, **iface_cfg)
        applied = True
        msg = "Configuración guardada y aplicada."
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
        _connect_wifi(ssid, password)
        log_action("WIFI_SSID", "network", "wlan0", {"ssid": ssid})
        return jsonify({
            "ok": True,
            "message": f"Conectando a '{ssid}'… espera unos segundos y recarga el estado.",
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
        networks, error = _scan_wifi()
        if error and not networks:
            return jsonify({"ok": False, "error": error, "networks": []}), 200
        return jsonify({"ok": True, "networks": networks,
                        "warning": error if (error and networks) else None})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
