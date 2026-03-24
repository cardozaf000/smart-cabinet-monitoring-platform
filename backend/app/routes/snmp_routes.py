import json
import os
from flask import Blueprint, jsonify, request
from app.auth_utils import token_required
from app.audit_utils import log_action

snmp_bp = Blueprint("snmp", __name__)

DEVICES_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "snmp_devices.json")

# Plantillas de dispositivos con OIDs estándar
DEVICE_TEMPLATES = {
    "ups": {
        "label": "UPS (RFC 1628)",
        "oids": {
            "battery_status":    {"oid": "1.3.6.1.2.1.33.1.2.1.0",   "label": "Estado batería"},
            "battery_capacity":  {"oid": "1.3.6.1.2.1.33.1.2.4.0",   "label": "Capacidad batería (%)"},
            "estimated_runtime": {"oid": "1.3.6.1.2.1.33.1.2.3.0",   "label": "Tiempo restante (min)"},
            "output_load":       {"oid": "1.3.6.1.2.1.33.1.4.4.1.5.1","label": "Carga de salida (%)"},
            "input_voltage":     {"oid": "1.3.6.1.2.1.33.1.3.3.1.3.1","label": "Voltaje entrada (V)"},
            "output_voltage":    {"oid": "1.3.6.1.2.1.33.1.4.4.1.2.1","label": "Voltaje salida (V)"},
        },
    },
    "pdu": {
        "label": "PDU (APC/Raritan estándar)",
        "oids": {
            "total_power":   {"oid": "1.3.6.1.4.1.13742.6.5.2.3.1.4.1.1.1.1","label": "Potencia total (W)"},
            "outlet_count":  {"oid": "1.3.6.1.4.1.13742.6.3.2.2.1.4.1.1",    "label": "Número de salidas"},
            "current_amps":  {"oid": "1.3.6.1.4.1.13742.6.5.2.3.1.2.1.1.1.1","label": "Corriente (A)"},
        },
    },
}


def load_devices():
    if os.path.exists(DEVICES_PATH):
        with open(DEVICES_PATH) as f:
            return json.load(f)
    return []


def save_devices(devices):
    os.makedirs(os.path.dirname(DEVICES_PATH), exist_ok=True)
    with open(DEVICES_PATH, "w") as f:
        json.dump(devices, f, indent=2)


@snmp_bp.route("/snmp/templates", methods=["GET"])
def get_templates():
    return jsonify(DEVICE_TEMPLATES)


@snmp_bp.route("/snmp/devices", methods=["GET"])
def get_devices():
    try:
        return jsonify(load_devices())
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@snmp_bp.route("/snmp/devices", methods=["POST"])
@token_required
def add_device():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data"}), 400
    try:
        devices = load_devices()
        new_id = max((d["id"] for d in devices), default=0) + 1
        device = {
            "id": new_id,
            "name": data.get("name", f"Dispositivo {new_id}"),
            "type": data.get("type", "ups"),
            "ip": data.get("ip", ""),
            "community": data.get("community", "public"),
            "version": data.get("version", "v2c"),
            "port": int(data.get("port", 161)),
            "cabinet_id": data.get("cabinet_id"),
            "status": "pending",
            "last_values": {},
        }
        devices.append(device)
        save_devices(devices)
        log_action("ADD_SNMP_DEVICE", "snmp_device", new_id,
                   {"name": device["name"], "type": device["type"], "ip": device["ip"]})
        return jsonify(device), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@snmp_bp.route("/snmp/devices/<int:device_id>", methods=["DELETE"])
@token_required
def delete_device(device_id):
    try:
        devices = [d for d in load_devices() if d["id"] != device_id]
        save_devices(devices)
        log_action("DELETE_SNMP_DEVICE", "snmp_device", device_id, status="warning")
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@snmp_bp.route("/snmp/devices/<int:device_id>/query", methods=["GET"])
def query_device(device_id):
    devices = load_devices()
    device = next((d for d in devices if d["id"] == device_id), None)
    if not device:
        return jsonify({"error": "Dispositivo no encontrado"}), 404

    template = DEVICE_TEMPLATES.get(device["type"], {})
    oids = template.get("oids", {})
    results = {}

    try:
        from pysnmp.hlapi import (
            getCmd, SnmpEngine, CommunityData, UdpTransportTarget,
            ContextData, ObjectType, ObjectIdentity,
        )
        for key, info in oids.items():
            err_ind, err_status, _, var_binds = next(
                getCmd(
                    SnmpEngine(),
                    CommunityData(device["community"], mpModel=1),
                    UdpTransportTarget((device["ip"], device["port"]),
                                       timeout=2, retries=1),
                    ContextData(),
                    ObjectType(ObjectIdentity(info["oid"])),
                )
            )
            if not err_ind and not err_status:
                results[key] = {"label": info["label"],
                                "value": str(var_binds[0][1])}
            else:
                results[key] = {"label": info["label"], "value": None,
                                "error": str(err_ind or err_status)}

        device["status"] = "ok" if any(
            v.get("value") is not None for v in results.values()
        ) else "error"

    except ImportError:
        # pysnmp no instalado: devolver indicador
        device["status"] = "no_pysnmp"
        results = {
            k: {"label": v["label"], "value": "N/A",
                "note": "Instalar pysnmp: pip install pysnmp"}
            for k, v in oids.items()
        }
    except Exception as exc:
        device["status"] = "error"
        results = {"_error": {"label": "Error", "value": str(exc)}}

    # Actualizar estado en almacenamiento
    device["last_values"] = results
    for i, d in enumerate(devices):
        if d["id"] == device_id:
            devices[i]["status"] = device["status"]
            devices[i]["last_values"] = results
    save_devices(devices)

    return jsonify({"device": device, "values": results})
