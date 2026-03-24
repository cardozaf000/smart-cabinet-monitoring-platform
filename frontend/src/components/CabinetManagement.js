import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  FiPlus, FiTrash2, FiRefreshCcw, FiX,
  FiCheckCircle, FiAlertCircle, FiEdit2, FiCheck, FiMapPin,
} from "react-icons/fi";
import Portal from "./Portal";

/* ============================================================
   CONSTANTES
============================================================ */
const BACKEND_URL   = `http://${window.location.hostname}:5000`;
const PLACEMENTS_KEY = "cabinet_placements_v2";

const RACK_W = 280, RACK_H = 680, U_COUNT = 42;
const RACK_MT = 28, RACK_MB = 28;
const U_STEP  = (RACK_H - RACK_MT - RACK_MB) / U_COUNT;
const uToY    = (u) => RACK_MT + (u - 1) * U_STEP + U_STEP / 2;
const xToSvgX = (x) => 18 + x * (RACK_W - 36);

const DEVICE_TYPES_SNMP = {
  ups: { label: "UPS (RFC 1628)" },
  pdu: { label: "PDU" },
};

const DEVICE_COLORS = {
  appliance:   "#6366f1",
  ups:         "#f59e0b",
  pdu:         "#10b981",
  temperatura: "#ef4444",
  temp:        "#ef4444",
  humedad:     "#3b82f6",
  luz:         "#fbbf24",
  lux:         "#fbbf24",
  puerta:      "#8b5cf6",
  reed:        "#8b5cf6",
  movimiento:  "#f97316",
  pir:         "#f97316",
  corriente:   "#06b6d4",
  voltaje:     "#06b6d4",
  presion:     "#84cc16",
};

const DEVICE_U_HEIGHT = { appliance: 1, ups: 3, pdu: 2 };

const getColor    = (type) => DEVICE_COLORS[String(type || "").toLowerCase()] || "#6b7280";
const isRackMount = (type) => ["appliance", "ups", "pdu"].includes(String(type || "").toLowerCase());

/* ============================================================
   UTILS
============================================================ */
const hexToRgb = (hex) => {
  const h = String(hex || "#000").replace("#", "");
  const s = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const b = parseInt(s, 16);
  if (Number.isNaN(b)) return [0, 0, 0];
  return [(b >> 16) & 255, (b >> 8) & 255, b & 255];
};

const postJSON = async (path, body) => {
  const res  = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  try { return JSON.parse(text); } catch { return {}; }
};

/* ============================================================
   DEVICE ICON
============================================================ */
function DeviceIcon({ type, size = 16, color = "currentColor" }) {
  const t = String(type || "").toLowerCase();
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };

  if (t === "appliance") return (
    <svg {...p}>
      <rect x="2" y="7" width="20" height="10" rx="1.5"/>
      <circle cx="18.5" cy="12" r="1.4" fill={color} stroke="none"/>
      <circle cx="15" cy="12" r="1.4" fill={color} stroke="none"/>
      <line x1="2" y1="12" x2="7" y2="12" strokeWidth="1.5"/>
    </svg>
  );
  if (t === "ups") return (
    <svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M10 9l-2 5h4l-2 5" strokeWidth="1.8"/>
    </svg>
  );
  if (t === "pdu") return (
    <svg {...p}>
      <rect x="2" y="8" width="20" height="8" rx="1.5"/>
      <circle cx="7" cy="12" r="1.8" strokeWidth="1.5"/>
      <circle cx="12" cy="12" r="1.8" strokeWidth="1.5"/>
      <circle cx="17" cy="12" r="1.8" strokeWidth="1.5"/>
      <line x1="12" y1="8" x2="12" y2="5" strokeWidth="1.5"/>
    </svg>
  );
  if (t.includes("temp")) return (
    <svg {...p}><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>
  );
  if (t.includes("hum")) return (
    <svg {...p}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
  );
  if (t.includes("puerta") || t.includes("reed") || t.includes("door")) return (
    <svg {...p}>
      <path d="M3 21h18"/><path d="M9 21V5l10-2v18"/>
      <circle cx="16" cy="12" r="1" fill={color} stroke="none"/>
    </svg>
  );
  if (t.includes("luz") || t.includes("lux") || t.includes("light")) return (
    <svg {...p}>
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/>
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
      <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
      <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
    </svg>
  );
  if (t.includes("mov") || t.includes("pir")) return (
    <svg {...p}>
      <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
      <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
      <circle cx="12" cy="20" r="1" fill={color} stroke="none"/>
    </svg>
  );
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
    </svg>
  );
}

/* ============================================================
   LIVE DOT
============================================================ */
function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: "#10b981" }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: "#10b981" }} />
    </span>
  );
}

/* ============================================================
   TOGGLE SWITCH
============================================================ */
const ToggleSwitch = ({ enabled, onChange, small }) => (
  <button
    role="switch" aria-checked={enabled}
    onClick={() => onChange(!enabled)}
    className="relative inline-flex items-center rounded-full border transition-all shrink-0"
    style={{
      width: small ? 36 : 44, height: small ? 20 : 26,
      backgroundColor: enabled ? "var(--color-primary)" : "var(--color-bg)",
      borderColor: "var(--color-border)",
    }}
  >
    <span
      className="inline-block rounded-full bg-white shadow transition-transform"
      style={{
        width: small ? 14 : 20, height: small ? 14 : 20,
        transform: enabled
          ? `translateX(${small ? 17 : 19}px)`
          : "translateX(2px)",
      }}
    />
  </button>
);

/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */
const CabinetManagement = ({ cabinets = [], sensors = [] }) => {
  const [cabinetData, setCabinetData] = useState(
    () => cabinets?.[0] || { id: "cab-1", name: "Gabinete Principal", location: "Sala DC", status: "OK" }
  );
  useEffect(() => { if (cabinets?.[0]) setCabinetData(cabinets[0]); }, [cabinets]);

  /* ---- Edición de info ---- */
  const [editingInfo, setEditingInfo] = useState(false);
  const [editName, setEditName]       = useState("");
  const [editLocation, setEditLocation] = useState("");
  const startEdit = () => { setEditName(cabinetData.name || ""); setEditLocation(cabinetData.location || ""); setEditingInfo(true); };
  const saveEdit  = () => { setCabinetData(p => ({ ...p, name: editName, location: editLocation })); setEditingInfo(false); };

  /* ---- LED ---- */
  const [ledEnabled, setLedEnabled]   = useState(true);
  const [fixedColor, setFixedColor]   = useState("#00aaff");
  const [alertColor, setAlertColor]   = useState("#ff0000");
  const [autoTemp, setAutoTemp]       = useState(false);
  const [doorFlash, setDoorFlash]     = useState(false);
  const [selectedStrip, setSelectedStrip] = useState(null);
  const lastCmdRef = React.useRef(0);

  const sendLedCommand = useCallback(async (mode, extra = {}) => {
    const now = Date.now();
    if (now - lastCmdRef.current < 180) return;
    lastCmdRef.current = now;
    try { await postJSON("/led_cmd", { type: "led_strip", mode: ledEnabled ? mode : "off", ...extra }); }
    catch { alert("No se pudo enviar el comando LED."); }
  }, [ledEnabled]);

  const handleToggle = useCallback(async (enabled) => {
    setLedEnabled(enabled);
    await sendLedCommand(enabled ? "fixed" : "off", { rgb: hexToRgb(fixedColor) });
    if (!enabled) { setAutoTemp(false); setDoorFlash(false); }
  }, [fixedColor, sendLedCommand]);

  /* ---- Posiciones en el rack ---- */
  const [placements, setPlacements] = useState(() => {
    try { const s = localStorage.getItem(PLACEMENTS_KEY); return s ? JSON.parse(s) : {}; }
    catch { return {}; }
  });
  useEffect(() => { localStorage.setItem(PLACEMENTS_KEY, JSON.stringify(placements)); }, [placements]);

  const [placingDevice, setPlacingDevice] = useState(null);

  const savePlacement   = (id, pos) => { setPlacements(p => ({ ...p, [id]: pos })); setPlacingDevice(null); };
  const removePlacement = (id)       => setPlacements(p => { const n = { ...p }; delete n[id]; return n; });

  /* ---- SNMP ---- */
  const [snmpDevices, setSnmpDevices]     = useState([]);
  const [snmpLoading, setSnmpLoading]     = useState(false);
  const [showSnmpModal, setShowSnmpModal] = useState(false);
  const [queryingId, setQueryingId]       = useState(null);
  const [queryResults, setQueryResults]   = useState({});

  const loadSnmpDevices = useCallback(async () => {
    setSnmpLoading(true);
    try { const r = await fetch(`${BACKEND_URL}/snmp/devices`); const d = await r.json(); setSnmpDevices(Array.isArray(d) ? d : []); }
    catch { } finally { setSnmpLoading(false); }
  }, []);
  useEffect(() => { loadSnmpDevices(); }, [loadSnmpDevices]);

  const handleDeleteSnmp = async (id) => {
    if (!window.confirm("¿Eliminar este dispositivo SNMP?")) return;
    await fetch(`${BACKEND_URL}/snmp/devices/${id}`, { method: "DELETE" });
    loadSnmpDevices();
  };
  const handleQuerySnmp = async (id) => {
    setQueryingId(id);
    try { const r = await fetch(`${BACKEND_URL}/snmp/devices/${id}/query`); const d = await r.json(); setQueryResults(p => ({ ...p, [id]: d })); loadSnmpDevices(); }
    catch { } finally { setQueryingId(null); }
  };

  /* ---- Lista unificada de equipos ---- */
  const allDevices = useMemo(() => {
    const list = [];
    list.push({ id: "device-system", name: "Equipo de monitoreo", type: "appliance", source: "system", uHeight: 1, desc: "Raspberry Pi · CPU, Temp, Memoria" });
    snmpDevices.forEach(d => list.push({ id: `device-snmp-${d.id}`, name: d.name, type: d.type, source: "snmp", uHeight: DEVICE_U_HEIGHT[d.type] || 1, desc: `${d.ip} · ${d.community}`, rawDevice: d }));
    (Array.isArray(sensors) ? sensors : []).forEach(s => list.push({
      id: `device-sensor-${s.id}-${s.type}`,
      name: s.name || `Sensor ${s.id}`,
      type: String(s.type || "").toLowerCase(),
      source: "sensor", uHeight: 1,
      desc: s.puerto || "—",
      rawSensor: s,
    }));
    return list;
  }, [snmpDevices, sensors]);

  const placedDevices = useMemo(() =>
    allDevices.filter(d => placements[d.id]).map(d => ({ ...d, placement: placements[d.id] })),
    [allDevices, placements]
  );

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="space-y-5 pb-6">

      {/* HEADER */}
      <div className="flex items-center gap-2.5">
        <LiveDot />
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>Gabinete</h1>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{
          backgroundColor: cabinetData.status === "OK" ? "color-mix(in srgb,#10b981 15%,transparent)" : "color-mix(in srgb,#ef4444 15%,transparent)",
          color: cabinetData.status === "OK" ? "#10b981" : "#ef4444",
        }}>{cabinetData.status}</span>
      </div>

      {/* LAYOUT PRINCIPAL: izquierda (info+LED+equipos) | derecha (3D) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">

        {/* ---- COLUMNA IZQUIERDA ---- */}
        <div className="space-y-4">

          {/* Info editable horizontal */}
          <div className="rounded-2xl border p-4" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
            {!editingInfo ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] opacity-40 mb-0.5">Nombre</p>
                  <p className="text-sm font-semibold truncate">{cabinetData.name}</p>
                </div>
                <div className="w-px h-8 self-center" style={{ backgroundColor: "var(--color-border)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] opacity-40 mb-0.5">Ubicación</p>
                  <p className="text-sm font-semibold truncate">{cabinetData.location || "—"}</p>
                </div>
                <button onClick={startEdit} className="shrink-0 p-1.5 rounded-lg opacity-40 hover:opacity-100 transition" style={{ border: "1px solid var(--color-border)" }} title="Editar">
                  <FiEdit2 size={13} />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[11px] opacity-40 mb-1 block">Nombre</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg"
                      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] opacity-40 mb-1 block">Ubicación</label>
                    <input value={editLocation} onChange={e => setEditLocation(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-sm rounded-lg"
                      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }} />
                  </div>
                </div>
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => setEditingInfo(false)} className="p-1.5 rounded-lg opacity-40 hover:opacity-100 transition" style={{ border: "1px solid var(--color-border)" }}><FiX size={13} /></button>
                  <button onClick={saveEdit} className="p-1.5 rounded-lg text-white" style={{ backgroundColor: "var(--color-primary)" }}><FiCheck size={13} /></button>
                </div>
              </div>
            )}
          </div>

          {/* Control LED */}
          <div className="rounded-2xl border overflow-hidden" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
            {/* Toggle row */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{
                  backgroundColor: ledEnabled ? fixedColor : "#4b5563",
                  boxShadow: ledEnabled ? `0 0 6px ${fixedColor}` : "none",
                  transition: "background-color 0.3s, box-shadow 0.3s",
                }} />
                <span className="text-sm font-medium">Tira LED</span>
              </div>
              <ToggleSwitch enabled={ledEnabled} onChange={handleToggle} />
            </div>

            {/* Config (visible cuando hay tira seleccionada) */}
            {selectedStrip && (
              <div className="border-t px-4 pb-4 pt-3 space-y-4" style={{ borderColor: "var(--color-border)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold opacity-50">
                    Tira {selectedStrip === "left" ? "izquierda" : "derecha"}
                  </span>
                  <button onClick={() => setSelectedStrip(null)} className="opacity-40 hover:opacity-100 transition"><FiX size={13} /></button>
                </div>

                {/* Color fijo */}
                <div>
                  <p className="text-xs opacity-40 mb-1.5">Color fijo</p>
                  <div className="flex items-center gap-2">
                    <input type="color" value={fixedColor} onChange={e => setFixedColor(e.target.value)} disabled={!ledEnabled}
                      className="w-10 h-8 rounded cursor-pointer p-0.5" style={{ border: "none", background: "none" }} />
                    <span className="font-mono text-xs opacity-40 flex-1">{fixedColor.toUpperCase()}</span>
                    <button disabled={!ledEnabled} onClick={() => sendLedCommand("fixed", { rgb: hexToRgb(fixedColor) })}
                      className="px-3 py-1 text-xs rounded-lg text-white disabled:opacity-40" style={{ backgroundColor: "var(--color-primary)" }}>
                      Aplicar
                    </button>
                  </div>
                </div>

                {/* Color alerta */}
                <div>
                  <p className="text-xs opacity-40 mb-1.5">Color de alerta</p>
                  <div className="flex items-center gap-2">
                    <input type="color" value={alertColor} onChange={e => setAlertColor(e.target.value)} disabled={!ledEnabled}
                      className="w-10 h-8 rounded cursor-pointer p-0.5" style={{ border: "none", background: "none" }} />
                    <span className="font-mono text-xs opacity-40 flex-1">{alertColor.toUpperCase()}</span>
                    <button disabled={!ledEnabled} onClick={() => sendLedCommand("set_alert_color", { rgb: hexToRgb(alertColor) })}
                      className="px-3 py-1 text-xs rounded-lg text-white disabled:opacity-40"
                      style={{ backgroundColor: "color-mix(in srgb,#ef4444 70%,#000)" }}>
                      Guardar
                    </button>
                  </div>
                </div>

                {/* Modos (switches) */}
                <div className="space-y-3 pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">Auto por temperatura</span>
                    <ToggleSwitch small enabled={autoTemp} onChange={async (v) => {
                      if (!ledEnabled) return;
                      setAutoTemp(v);
                      await sendLedCommand(v ? "auto_temp" : "off", {
                        bands: [{ lt: 20, rgb: [0, 110, 255] }, { gte: 20, lt: 27, rgb: [0, 200, 120] }, { gte: 27, lt: 30, rgb: [255, 160, 0] }, { gte: 30, rgb: [255, 60, 60] }],
                      });
                    }} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs">Parpadear al abrir puerta</span>
                    <ToggleSwitch small enabled={doorFlash} onChange={async (v) => {
                      if (!ledEnabled) return;
                      setDoorFlash(v);
                      await sendLedCommand(v ? "door_flash" : "off", { flash: { rgb: hexToRgb(alertColor), period_ms: 500 } });
                    }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Lista de equipos y sensores */}
          <div className="rounded-2xl border" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Equipos y sensores</h2>
            </div>
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {allDevices.map(device => {
                const placed = !!placements[device.id];
                const pos    = placements[device.id];
                const color  = getColor(device.type);
                return (
                  <div key={device.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)] transition-colors">
                    <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${color}20`, color }}>
                      <DeviceIcon type={device.type} size={14} color={color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{device.name}</p>
                      <p className="text-[11px] opacity-35 truncate">
                        {placed ? `U${pos.u}` : "Sin ubicar"} · {device.desc}
                      </p>
                    </div>
                    <button
                      onClick={() => setPlacingDevice(device)}
                      title={placed ? `Reposicionar (U${pos?.u})` : "Colocar en rack"}
                      className="shrink-0 p-1.5 rounded-lg transition"
                      style={{
                        backgroundColor: placed ? `${color}18` : "color-mix(in srgb,var(--color-primary) 10%,transparent)",
                        color: placed ? color : "var(--color-primary)",
                        border: `1px solid ${placed ? `${color}35` : "var(--color-border)"}`,
                      }}>
                      <FiMapPin size={12} />
                    </button>
                  </div>
                );
              })}
              {allDevices.length === 0 && (
                <p className="text-center py-6 text-xs opacity-30">Sin equipos registrados</p>
              )}
            </div>
          </div>
        </div>

        {/* ---- COLUMNA DERECHA: Gabinete 3D ---- */}
        <div className="lg:col-span-2 rounded-2xl border" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
          <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--color-border)" }}>
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Vista 3D</h2>
            <p className="text-xs mt-0.5 opacity-35">Clic en las tiras laterales para configurar LED</p>
          </div>
          <div className="p-5 flex justify-center overflow-x-auto">
            <Rack3D
              uCount={U_COUNT}
              ledEnabled={ledEnabled}
              fixedColor={fixedColor}
              selectedStrip={selectedStrip}
              onSelectStrip={(side) => setSelectedStrip(p => p === side ? null : side)}
              placedDevices={placedDevices}
            />
          </div>
        </div>
      </div>

      {/* SNMP */}
      <div className="rounded-2xl border" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: "var(--color-border)" }}>
          <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Dispositivos SNMP</h2>
          <div className="flex items-center gap-2">
            <button onClick={loadSnmpDevices} className="p-2 rounded-lg border hover:opacity-80 transition" style={{ borderColor: "var(--color-border)" }} title="Recargar">
              <FiRefreshCcw size={13} />
            </button>
            <button onClick={() => setShowSnmpModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: "var(--color-primary)" }}>
              <FiPlus size={13} /> Agregar
            </button>
          </div>
        </div>
        <div className="p-5">
          {snmpLoading && <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-t-2 border-[var(--color-primary)]" /></div>}
          {!snmpLoading && snmpDevices.length === 0 && (
            <p className="text-center py-8 text-sm opacity-30">Sin dispositivos SNMP. Usa "Agregar" para añadir un UPS o PDU.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {snmpDevices.map(dev => (
              <SnmpDeviceCard key={dev.id} device={dev}
                querying={queryingId === dev.id} queryResult={queryResults[dev.id]}
                onQuery={() => handleQuerySnmp(dev.id)}
                onDelete={() => handleDeleteSnmp(dev.id)} />
            ))}
          </div>
        </div>
      </div>

      {/* Modal de posicionamiento */}
      {placingDevice && (
        <PlacementModal
          device={placingDevice}
          currentPlacement={placements[placingDevice.id] || null}
          allPlacements={placements}
          allDevices={allDevices}
          onSave={(pos) => savePlacement(placingDevice.id, pos)}
          onRemove={() => { removePlacement(placingDevice.id); setPlacingDevice(null); }}
          onClose={() => setPlacingDevice(null)}
        />
      )}

      {showSnmpModal && (
        <SnmpAddModal
          onClose={() => setShowSnmpModal(false)}
          onAdded={() => { setShowSnmpModal(false); loadSnmpDevices(); }}
          cabinetId={cabinetData.id}
        />
      )}
    </div>
  );
};

/* ============================================================
   RACK 3D MEJORADO
============================================================ */
function Rack3D({ uCount = 42, ledEnabled, fixedColor, selectedStrip, onSelectStrip, placedDevices = [] }) {
  const W = 230, H = 520, DEPTH = 65;
  const LED_W  = 10;
  const PANEL_L = LED_W + 3;
  const PANEL_R = LED_W + 3;
  const PANEL_W = W - PANEL_L - PANEL_R;

  const ledColor = ledEnabled ? fixedColor : "#2d3748";
  const ledGlow  = ledEnabled ? `0 0 10px ${fixedColor}, 0 0 22px ${fixedColor}66` : "none";

  return (
    <div style={{ perspective: "1100px", perspectiveOrigin: "50% 36%", paddingBottom: 24 }}>
      <div style={{ width: W, height: H, position: "relative", transformStyle: "preserve-3d", transform: "rotateX(10deg) rotateY(-22deg)" }}>

        {/* === CARA FRONTAL === */}
        <div style={{
          position: "absolute", width: W, height: H,
          backgroundColor: "#141c2b",
          border: "2.5px solid #2d3a4f",
          borderRadius: "5px",
          overflow: "hidden",
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
        }}>

          {/* Panel montaje (área central) */}
          <div style={{
            position: "absolute",
            left: PANEL_L, right: PANEL_R, top: 10, bottom: 10,
            backgroundColor: "#0d1520",
            borderRadius: "3px",
            border: "1px solid #1a2535",
          }}>
            {/* Grid U */}
            {Array.from({ length: Math.floor(uCount / 6) }).map((_, i) => {
              const uNum = (i + 1) * 6;
              const y = ((uNum) / uCount) * (H - 20);
              return (
                <div key={uNum} style={{ position: "absolute", top: y, left: 0, right: 0 }}>
                  <div style={{ height: 1, backgroundColor: "#1e2d42", opacity: 0.9 }} />
                  <span style={{ position: "absolute", right: 3, top: -7, fontSize: 6.5, color: "#374151", userSelect: "none" }}>U{uNum}</span>
                </div>
              );
            })}

            {/* Equipos colocados */}
            {placedDevices.map(dev => {
              const color = getColor(dev.type);
              const panelH = H - 20;
              const uHpx  = panelH / uCount;
              const isRack = isRackMount(dev.type);

              if (isRack) {
                const top    = ((dev.placement.u - 1) / uCount) * panelH + 1;
                const height = Math.max(((dev.uHeight || 1) / uCount) * panelH - 2, 7);
                return (
                  <div key={dev.id} style={{
                    position: "absolute", top, left: 2, right: 2, height,
                    backgroundColor: color, borderRadius: 3, opacity: 0.88,
                    display: "flex", alignItems: "center", paddingLeft: 5, paddingRight: 5,
                    overflow: "hidden", boxShadow: `0 0 8px ${color}50`,
                  }}>
                    <span style={{ fontSize: 7.5, color: "#fff", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: 0.3 }}>
                      {dev.name}
                    </span>
                    {/* Luces decorativas para 1RU */}
                    {dev.type === "appliance" && (
                      <div style={{ display: "flex", gap: 3, marginLeft: "auto", paddingRight: 2 }}>
                        <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "#10b981", boxShadow: "0 0 4px #10b981" }} />
                        <div style={{ width: 4, height: 4, borderRadius: "50%", backgroundColor: "#3b82f6", boxShadow: "0 0 4px #3b82f6" }} />
                      </div>
                    )}
                  </div>
                );
              }

              // Sensor: dot posicionado
              const yDot = ((dev.placement.u - 1) / uCount) * panelH + uHpx / 2;
              const xDot = dev.placement.x * (PANEL_W - 10) + 2;
              return (
                <div key={dev.id} title={`${dev.name} · U${dev.placement.u}`} style={{
                  position: "absolute",
                  top: yDot - 5, left: xDot,
                  width: 10, height: 10,
                  borderRadius: "50%",
                  backgroundColor: color,
                  boxShadow: `0 0 6px ${color}, 0 0 12px ${color}60`,
                  zIndex: 5,
                }} />
              );
            })}
          </div>

          {/* === TIRA LED IZQUIERDA === */}
          <div
            onClick={() => onSelectStrip("left")}
            title="Clic para configurar tira LED izquierda"
            style={{
              position: "absolute", left: 0, top: 0, width: LED_W, height: "100%",
              backgroundColor: ledColor,
              boxShadow: selectedStrip === "left"
                ? `${ledGlow}, inset 0 0 8px rgba(255,255,255,0.3)` : ledGlow,
              cursor: "pointer", zIndex: 20,
              opacity: ledEnabled ? 1 : 0.25,
              outline: selectedStrip === "left" ? "2px solid rgba(255,255,255,0.7)" : "none",
              outlineOffset: "-1px",
              transition: "opacity 0.25s, box-shadow 0.25s",
            }}
          />

          {/* === TIRA LED DERECHA === */}
          <div
            onClick={() => onSelectStrip("right")}
            title="Clic para configurar tira LED derecha"
            style={{
              position: "absolute", right: 0, top: 0, width: LED_W, height: "100%",
              backgroundColor: ledColor,
              boxShadow: selectedStrip === "right"
                ? `${ledGlow}, inset 0 0 8px rgba(255,255,255,0.3)` : ledGlow,
              cursor: "pointer", zIndex: 20,
              opacity: ledEnabled ? 1 : 0.25,
              outline: selectedStrip === "right" ? "2px solid rgba(255,255,255,0.7)" : "none",
              outlineOffset: "-1px",
              transition: "opacity 0.25s, box-shadow 0.25s",
            }}
          />

          {/* Tornillos decorativos (esquinas) */}
          {[[6, 6], [W - 10, 6], [6, H - 10], [W - 10, H - 10]].map(([cx, cy], i) => (
            <div key={i} style={{
              position: "absolute", left: cx - 3, top: cy - 3, width: 6, height: 6,
              borderRadius: "50%", backgroundColor: "#1f2d3d", border: "1px solid #374151",
            }} />
          ))}
        </div>

        {/* === CARA LATERAL DERECHA (pointerEvents none para no bloquear el LED) === */}
        <div style={{
          position: "absolute", width: DEPTH, height: H, left: W, top: 0,
          transform: `rotateY(90deg) translateZ(${DEPTH / 2}px) translateX(${-DEPTH / 2}px)`,
          transformOrigin: "left center",
          background: "linear-gradient(to right, #0d1520, #0a1018)",
          border: "1px solid #1a2535",
          pointerEvents: "none",
        }} />

        {/* === CARA SUPERIOR === */}
        <div style={{
          position: "absolute", width: W, height: DEPTH, top: -DEPTH,
          transform: `rotateX(90deg) translateZ(${-DEPTH / 2}px) translateY(${-DEPTH / 2}px)`,
          transformOrigin: "bottom center",
          background: "linear-gradient(to bottom, #0a0f18, #0d1520)",
          border: "1px solid #1a2535",
          pointerEvents: "none",
        }} />
      </div>

      <p style={{ textAlign: "center", marginTop: 36, fontSize: 11, opacity: 0.3, userSelect: "none" }}>
        Clic en las tiras laterales para configurar LED
      </p>
    </div>
  );
}

/* ============================================================
   MODAL DE POSICIONAMIENTO (2D interactivo)
============================================================ */
function PlacementModal({ device, currentPlacement, allPlacements, allDevices, onSave, onRemove, onClose }) {
  const [tempPos, setTempPos] = useState(currentPlacement || null);

  const handleSvgClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (RACK_W / rect.width);
    const svgY = (e.clientY - rect.top)  * (RACK_H / rect.height);
    const u = Math.max(1, Math.min(U_COUNT, Math.round(((svgY - RACK_MT) / (RACK_H - RACK_MT - RACK_MB)) * U_COUNT + 1)));
    const x = Math.max(0, Math.min(1, (svgX - 18) / (RACK_W - 36)));
    setTempPos({ u, x });
  };

  const others = allDevices
    .filter(d => d.id !== device.id && allPlacements[d.id])
    .map(d => ({ ...d, placement: allPlacements[d.id] }));

  const devColor = getColor(device.type);

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/60">
      <div className="w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden max-h-[95vh] flex flex-col"
        style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>

        {/* Header modal */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${devColor}20`, color: devColor }}>
              <DeviceIcon type={device.type} size={15} color={devColor} />
            </div>
            <div>
              <p className="text-sm font-semibold">{device.name}</p>
              <p className="text-xs opacity-35">Haz clic en el rack para seleccionar la posición</p>
            </div>
          </div>
          <button onClick={onClose} className="opacity-40 hover:opacity-100 transition"><FiX size={16} /></button>
        </div>

        {/* Cuerpo modal */}
        <div className="flex gap-5 p-5 overflow-y-auto">

          {/* SVG rack interactivo */}
          <div className="shrink-0 rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
            <svg
              width={RACK_W} height={RACK_H}
              viewBox={`0 0 ${RACK_W} ${RACK_H}`}
              style={{ cursor: "crosshair", display: "block", maxHeight: "66vh", width: "auto" }}
              onClick={handleSvgClick}
            >
              {/* Marco */}
              <rect x="5" y="5" width={RACK_W - 10} height={RACK_H - 10} rx="7" fill="var(--color-bg)" stroke="var(--color-border)" strokeWidth="3" />

              {/* U lines */}
              {Array.from({ length: U_COUNT }).map((_, i) => {
                const uNum = i + 1;
                const y    = uToY(uNum);
                const major = uNum % 6 === 0;
                return (
                  <g key={uNum}>
                    <line x1="12" x2={RACK_W - 12} y1={y} y2={y}
                      stroke="var(--color-border)" strokeWidth={major ? 1.4 : 0.7} opacity={major ? 0.7 : 0.3} />
                    {major && <text x="14" y={y - 3} fontSize="8" fill="var(--color-text)" opacity="0.45">U{uNum}</text>}
                  </g>
                );
              })}

              {/* Otros equipos ya colocados (semitransparentes) */}
              {others.map(d => {
                const color  = getColor(d.type);
                const isRack = isRackMount(d.type);
                if (isRack) {
                  const top = uToY(d.placement.u) - U_STEP / 2 + 1;
                  const h   = Math.max((d.uHeight || 1) * U_STEP - 2, 5);
                  return (
                    <g key={d.id} opacity={0.4}>
                      <rect x="14" y={top} width={RACK_W - 28} height={h} rx="2" fill={color} />
                      <text x={RACK_W / 2} y={top + h / 2 + 3.5} fontSize="8" fill="#fff" textAnchor="middle" opacity="0.9">{d.name}</text>
                    </g>
                  );
                }
                return (
                  <circle key={d.id} cx={xToSvgX(d.placement.x)} cy={uToY(d.placement.u)} r="7" fill={color} opacity={0.45} />
                );
              })}

              {/* Dispositivo actual (posición seleccionada) */}
              {tempPos && (() => {
                const isRack = isRackMount(device.type);
                if (isRack) {
                  const top = uToY(tempPos.u) - U_STEP / 2 + 1;
                  const h   = Math.max((device.uHeight || 1) * U_STEP - 2, 5);
                  return (
                    <g>
                      <rect x="14" y={top} width={RACK_W - 28} height={h} rx="3" fill={devColor} opacity={0.92} stroke={devColor} strokeWidth="1.5" />
                      <text x={RACK_W / 2} y={top + h / 2 + 3.5} fontSize="9" fill="#fff" textAnchor="middle" fontWeight="bold">
                        {device.name} · U{tempPos.u}
                      </text>
                    </g>
                  );
                }
                return (
                  <g>
                    <circle cx={xToSvgX(tempPos.x)} cy={uToY(tempPos.u)} r="11" fill={devColor} opacity={0.95} />
                    <circle cx={xToSvgX(tempPos.x)} cy={uToY(tempPos.u)} r="13" fill="none" stroke={devColor} strokeWidth="1.5" opacity={0.5} />
                    <text x={xToSvgX(tempPos.x)} y={uToY(tempPos.u) + 3.5} fontSize="8" fill="#fff" textAnchor="middle" fontWeight="bold">U{tempPos.u}</text>
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Panel lateral del modal */}
          <div className="flex-1 flex flex-col justify-between gap-4 min-w-0">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <DeviceIcon type={device.type} size={14} color={devColor} />
                <span className="text-sm capitalize opacity-70">{device.type}</span>
                {device.uHeight > 1 && <span className="text-xs opacity-40">{device.uHeight}U</span>}
              </div>

              {tempPos ? (
                <div className="p-3 rounded-xl space-y-1.5"
                  style={{ backgroundColor: `${devColor}12`, border: `1px solid ${devColor}30` }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: devColor }}>Posición seleccionada</p>
                  <p className="text-sm"><span className="opacity-40">Unidad: </span><strong>U{tempPos.u}</strong></p>
                  <p className="text-sm"><span className="opacity-40">Posición: </span><strong>{(tempPos.x * 100).toFixed(0)}% del ancho</strong></p>
                </div>
              ) : (
                <div className="p-4 rounded-xl text-center text-xs opacity-30" style={{ border: "1px dashed var(--color-border)" }}>
                  Haz clic en el rack para posicionar el equipo
                </div>
              )}

              {currentPlacement && (
                <button onClick={onRemove}
                  className="w-full py-2 text-xs rounded-xl border transition hover:bg-red-500/10"
                  style={{ borderColor: "#ef444440", color: "#ef4444" }}>
                  Quitar del rack
                </button>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="flex-1 py-2.5 text-sm rounded-xl border hover:opacity-80 transition" style={{ borderColor: "var(--color-border)" }}>
                Cancelar
              </button>
              <button onClick={() => tempPos && onSave(tempPos)} disabled={!tempPos}
                className="flex-1 py-2.5 text-sm rounded-xl font-semibold text-white disabled:opacity-35 hover:opacity-90 transition"
                style={{ backgroundColor: "var(--color-primary)" }}>
                Listo
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}

/* ============================================================
   SNMP DEVICE CARD
============================================================ */
function SnmpDeviceCard({ device, querying, queryResult, onQuery, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const typeInfo    = DEVICE_TYPES_SNMP[device.type] || { label: device.type };
  const statusColor = device.status === "ok" ? "#10b981" : device.status === "pending" ? "#f59e0b" : "#ef4444";
  const StatusIcon  = device.status === "ok" ? FiCheckCircle : FiAlertCircle;
  const values      = queryResult?.values || device.last_values || {};

  return (
    <div className="rounded-xl border p-4 space-y-3" style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 font-semibold text-sm">
            <DeviceIcon type={device.type} size={14} color={getColor(device.type)} />
            <span>{device.name}</span>
            <StatusIcon size={12} style={{ color: statusColor }} title={device.status} />
          </div>
          <p className="text-xs mt-0.5 opacity-40">{typeInfo.label} · {device.ip}:{device.port}</p>
        </div>
        <button onClick={onDelete} className="opacity-30 hover:opacity-100 hover:text-red-400 transition" title="Eliminar">
          <FiTrash2 size={14} />
        </button>
      </div>

      {Object.keys(values).length > 0 && (
        <div>
          <button onClick={() => setExpanded(v => !v)} className="text-xs hover:opacity-80 transition" style={{ color: "var(--color-primary)" }}>
            {expanded ? "Ocultar valores" : "Ver valores"}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1">
              {Object.entries(values).map(([k, v]) => (
                <div key={k} className="flex justify-between text-xs">
                  <span className="opacity-50">{v.label || k}</span>
                  <span className="font-mono font-medium">{v.value ?? "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button onClick={onQuery} disabled={querying}
        className="w-full flex items-center justify-center gap-2 py-1.5 text-xs rounded-lg font-medium text-white hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: "var(--color-primary)" }}>
        {querying ? <><div className="animate-spin rounded-full h-3 w-3 border-t border-white" /> Consultando…</> : <><FiRefreshCcw size={11} /> Consultar SNMP</>}
      </button>

      {device.status === "pending" && <p className="text-xs text-center opacity-30">Sin consultar aún</p>}
    </div>
  );
}

/* ============================================================
   SNMP ADD MODAL
============================================================ */
function SnmpAddModal({ onClose, onAdded, cabinetId }) {
  const [form, setForm] = useState({ name: "", type: "ups", ip: "", community: "public", version: "v2c", port: 161 });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.ip) { setErr("Completa el nombre y la IP."); return; }
    setSaving(true);
    try {
      const res  = await fetch(`${BACKEND_URL}/snmp/devices`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cabinet_id: cabinetId }) });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error al guardar");
      onAdded();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-2xl" style={{ backgroundColor: "var(--color-card)", color: "var(--color-text)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between mb-5">
          <h4 className="text-base font-semibold">Agregar dispositivo SNMP</h4>
          <button onClick={onClose} className="opacity-40 hover:opacity-100 transition"><FiX size={16} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4 text-sm">
          {err && <div className="bg-red-900/30 border border-red-600 text-red-200 p-3 rounded text-xs">{err}</div>}
          <MField label="Nombre" value={form.name} onChange={v => set("name", v)} placeholder="UPS Rack Principal" />
          <div>
            <label className="block text-xs mb-1.5 opacity-50">Tipo</label>
            <div className="flex gap-2">
              {Object.entries(DEVICE_TYPES_SNMP).map(([key, dt]) => (
                <button key={key} type="button" onClick={() => set("type", key)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border transition"
                  style={{ backgroundColor: form.type === key ? "var(--color-primary)" : "transparent", color: form.type === key ? "#fff" : "var(--color-text)", borderColor: form.type === key ? "var(--color-primary)" : "var(--color-border)" }}>
                  {dt.label}
                </button>
              ))}
            </div>
          </div>
          <MField label="Dirección IP" value={form.ip} onChange={v => set("ip", v)} placeholder="192.168.1.100" />
          <MField label="Comunidad SNMP" value={form.community} onChange={v => set("community", v)} placeholder="public" />
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs mb-1.5 opacity-50">Versión SNMP</label>
              <select value={form.version} onChange={e => set("version", e.target.value)} className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                <option value="v2c">SNMPv2c</option><option value="v3">SNMPv3</option>
              </select>
            </div>
            <div className="w-24">
              <label className="block text-xs mb-1.5 opacity-50">Puerto</label>
              <input type="number" value={form.port} onChange={e => set("port", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }} />
            </div>
          </div>
          <div className="pt-2 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2 border rounded-lg text-sm hover:opacity-80 transition" style={{ borderColor: "var(--color-border)" }}>Cancelar</button>
            <button type="submit" disabled={saving} className="px-6 py-2 text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: "var(--color-primary)" }}>
              {saving ? "Guardando…" : "Agregar"}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}

/* ---- Campo de modal ---- */
const MField = ({ label, value, onChange, placeholder }) => (
  <div>
    <label className="block text-xs mb-1.5 opacity-50">{label}</label>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full px-4 py-2 rounded-lg text-sm"
      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }} />
  </div>
);

export default CabinetManagement;
