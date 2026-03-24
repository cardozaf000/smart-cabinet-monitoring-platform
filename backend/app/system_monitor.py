# app/system_monitor.py
import time
import subprocess
from typing import Optional

import psutil

THERMAL_PATH = "/sys/class/thermal/thermal_zone0/temp"

def _read_cpu_temp() -> Optional[float]:
    # 1) sysfs (mili°C en la mayoría de RPi)
    try:
        with open(THERMAL_PATH, "r") as f:
            raw = f.read().strip()
        t = float(raw)
        if t > 1000:  # mili°C
            t = t / 1000.0
        return t
    except Exception:
        pass
    # 2) vcgencmd como alternativa
    try:
        out = subprocess.check_output(["vcgencmd", "measure_temp"], text=True).strip()
        # ejemplo: "temp=58.9'C"
        if "temp=" in out:
            val = out.split("temp=")[1].split("'")[0]
            return float(val)
    except Exception:
        pass
    return None

def get_system_snapshot() -> dict:
    try:
        cpu_temp = _read_cpu_temp()
        cpu_pct = psutil.cpu_percent(interval=0.2)

        vm = psutil.virtual_memory()
        used_mb  = round(vm.used / (1024*1024), 1)
        total_mb = round(vm.total / (1024*1024), 1)
        mem_pct  = round(vm.percent, 1)

        snap = {
            "id": "rpi",
            "nombre": "Raspberry Pi",
            "tipo": "sistema",
            "gabinete_id": "gab-rpi",
            "ts": int(time.time()),
            "medidas": {}
        }

        if cpu_temp is not None:
            snap["medidas"]["cpu_temp"] = {"valor": round(cpu_temp, 3), "unidad": "°C"}

        snap["medidas"]["cpu_usage"]    = {"valor": round(cpu_pct, 1), "unidad": "%"}
        snap["medidas"]["mem_usage"]    = {"valor": mem_pct,         "unidad": "%"}
        snap["medidas"]["mem_used_mb"]  = {"valor": used_mb,         "unidad": "MB"}
        snap["medidas"]["mem_total_mb"] = {"valor": total_mb,        "unidad": "MB"}

        return snap
    except Exception as e:
        print(f"[system_monitor] error: {e}")
        return {}
