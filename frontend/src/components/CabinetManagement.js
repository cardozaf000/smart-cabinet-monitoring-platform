import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  FiPlus, FiTrash2, FiRefreshCcw, FiX,
  FiCheckCircle, FiAlertCircle, FiEdit2, FiCheck, FiMapPin,
} from "react-icons/fi";
import Portal from "./Portal";
import { BACKEND as BACKEND_URL } from '../utils/api';
import { authHeader } from '../utils/auth';

/* ============================================================
   CONSTANTES
============================================================ */
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
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
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
const DEFAULT_STRIP = { enabled: true, mode: 'fixed', fixedColor: '#00aaff', alertColor: '#ff0000' };

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

  /* ---- Strip count ---- */
  const [stripCount, setStripCount] = useState(() => parseInt(localStorage.getItem('rgb_strip_count') || '2', 10));

  /* ---- Strip position config ---- */
  // strip1Position: para 1 sola tira, su posición física
  const [strip1Position, setStrip1Position] = useState(() => localStorage.getItem('rgb_strip1_pos') || 'front-left');
  // strip2Face: para 2 tiras, en qué cara van (front o back)
  const [strip2Face, setStrip2Face] = useState(() => localStorage.getItem('rgb_strip2_face') || 'front');

  /* ---- Per-strip state ---- */
  const [strips, setStrips] = useState(() => {
    try {
      const s = localStorage.getItem('rgb_strips_v2');
      return s ? JSON.parse(s) : [DEFAULT_STRIP, DEFAULT_STRIP, DEFAULT_STRIP, DEFAULT_STRIP];
    } catch {
      return [DEFAULT_STRIP, DEFAULT_STRIP, DEFAULT_STRIP, DEFAULT_STRIP];
    }
  });
  useEffect(() => { localStorage.setItem('rgb_strips_v2', JSON.stringify(strips)); }, [strips]);

  const [selectedStripId, setSelectedStripId] = useState(0);
  const strip = strips[selectedStripId] || DEFAULT_STRIP;
  const setStrip = (patch) => setStrips(prev => prev.map((s, i) => i === selectedStripId ? { ...s, ...patch } : s));

  /* ---- Calcula qué tira va a cada lado de cada cara ---- */
  const getFaceStrips = useCallback((face) => {
    const DS = DEFAULT_STRIP;
    if (stripCount === 1) {
      const s0 = strips[0] || DS;
      if (face === 'front') return {
        leftStrip: strip1Position === 'front-left'  ? s0 : null, leftId: strip1Position === 'front-left'  ? 0 : null,
        rightStrip: strip1Position === 'front-right' ? s0 : null, rightId: strip1Position === 'front-right' ? 0 : null,
      };
      return {
        leftStrip: strip1Position === 'back-left'  ? s0 : null, leftId: strip1Position === 'back-left'  ? 0 : null,
        rightStrip: strip1Position === 'back-right' ? s0 : null, rightId: strip1Position === 'back-right' ? 0 : null,
      };
    }
    if (stripCount === 2) {
      const active = strip2Face === face;
      return {
        leftStrip: active ? (strips[0] || DS) : null, leftId: active ? 0 : null,
        rightStrip: active ? (strips[1] || DS) : null, rightId: active ? 1 : null,
      };
    }
    // 4 tiras
    if (face === 'front') return {
      leftStrip: strips[0] || DS, leftId: 0,
      rightStrip: strips[1] || DS, rightId: 1,
    };
    return {
      leftStrip: strips[2] || DS, leftId: 2,
      rightStrip: strips[3] || DS, rightId: 3,
    };
  }, [strips, stripCount, strip1Position, strip2Face]);

  const lastCmdRef = React.useRef(0);

  const getStripPosition = useCallback((id) => {
    if (stripCount === 1) return strip1Position;
    if (stripCount === 2) return `${strip2Face}-${id === 0 ? 'left' : 'right'}`;
    return ['front-left', 'front-right', 'back-left', 'back-right'][id] || 'front-left';
  }, [stripCount, strip1Position, strip2Face]);

  const sendLedCommand = useCallback(async (stripId, mode, extra = {}) => {
    const now = Date.now();
    if (now - lastCmdRef.current < 180) return;
    lastCmdRef.current = now;
    const st = strips[stripId] || DEFAULT_STRIP;
    const [r, g, b] = hexToRgb(st.fixedColor);
    try {
      await postJSON("/led_cmd", {
        type: "led_strip",
        mode: st.enabled ? mode : "off",
        strip_id: stripId,
        position: getStripPosition(stripId),
        gabinete_id: cabinetData.id || "cab-1",
        rgb: mode === 'off' ? [0, 0, 0] : [r, g, b],
        ...extra,
      });
    } catch { alert("No se pudo enviar el comando LED."); }
  }, [strips, cabinetData.id, getStripPosition]);

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

  /* ---- LED mode labels & descriptions ---- */
  const MODES = [
    { id: 'off',       label: 'Apagado',      desc: 'Tira apagada' },
    { id: 'fixed',     label: 'Fijo',         desc: 'Color constante' },
    { id: 'door_open', label: 'Puerta',       desc: 'Enciende al abrir' },
    { id: 'auto_temp', label: 'Temperatura',  desc: 'Color según °C' },
    { id: 'alert',     label: 'Alerta',       desc: 'Enciende en alertas' },
  ];

  const handleModeClick = (modeId) => {
    setStrip({ mode: modeId, enabled: modeId !== 'off' });
    if (modeId === 'off') {
      sendLedCommand(selectedStripId, 'off', { rgb: [0, 0, 0] });
    } else if (modeId === 'fixed') {
      sendLedCommand(selectedStripId, 'fixed', { rgb: hexToRgb(strip.fixedColor) });
    } else if (modeId === 'door_open') {
      sendLedCommand(selectedStripId, 'door_open', { rgb: hexToRgb(strip.fixedColor), flash: { period_ms: 500 } });
    } else if (modeId === 'auto_temp') {
      sendLedCommand(selectedStripId, 'auto_temp', {
        bands: [
          { lt: 20, rgb: [0, 110, 255] },
          { gte: 20, lt: 27, rgb: [0, 200, 120] },
          { gte: 27, lt: 30, rgb: [255, 160, 0] },
          { gte: 30, rgb: [255, 60, 60] },
        ],
      });
    } else if (modeId === 'alert') {
      sendLedCommand(selectedStripId, 'alert', { rgb: hexToRgb(strip.alertColor) });
    }
  };

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

            {/* Header: title + count selector */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
              <span className="text-sm font-semibold">Tiras LED</span>
              <select
                value={stripCount}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  setStripCount(v);
                  localStorage.setItem('rgb_strip_count', String(v));
                  if (selectedStripId >= v) setSelectedStripId(0);
                }}
                className="text-xs px-2 py-1 rounded-lg"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
              >
                <option value={1}>1 tira</option>
                <option value={2}>2 tiras</option>
                <option value={4}>4 tiras</option>
              </select>
            </div>

            {/* Posición (1 tira) */}
            {stripCount === 1 && (
              <div className="px-4 pt-3 pb-1">
                <p className="text-[11px] opacity-40 mb-1.5">Posición</p>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { id: 'front-left', label: 'Frente Izq' },
                    { id: 'front-right', label: 'Frente Der' },
                    { id: 'back-left', label: 'Trasera Izq' },
                    { id: 'back-right', label: 'Trasera Der' },
                  ].map(p => (
                    <button key={p.id}
                      onClick={() => { setStrip1Position(p.id); localStorage.setItem('rgb_strip1_pos', p.id); }}
                      className="px-2 py-1.5 rounded-lg text-xs font-medium border transition-all"
                      style={{
                        backgroundColor: strip1Position === p.id ? "color-mix(in srgb,var(--color-primary) 12%,transparent)" : "transparent",
                        borderColor: strip1Position === p.id ? "var(--color-primary)" : "var(--color-border)",
                        color: strip1Position === p.id ? "var(--color-primary)" : "var(--color-text)",
                      }}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Cara (2 tiras) */}
            {stripCount === 2 && (
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <span className="text-[11px] opacity-40">Panel:</span>
                {[{ id: 'front', label: 'Frente' }, { id: 'back', label: 'Trasera' }].map(f => (
                  <button key={f.id}
                    onClick={() => { setStrip2Face(f.id); localStorage.setItem('rgb_strip2_face', f.id); }}
                    className="px-3 py-1 rounded-lg text-xs font-medium border transition-all"
                    style={{
                      backgroundColor: strip2Face === f.id ? "color-mix(in srgb,var(--color-primary) 12%,transparent)" : "transparent",
                      borderColor: strip2Face === f.id ? "var(--color-primary)" : "var(--color-border)",
                      color: strip2Face === f.id ? "var(--color-primary)" : "var(--color-text)",
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {/* Selector de tira (2 o 4 tiras) */}
            {stripCount > 1 && (
              <div className="flex gap-1.5 px-4 pt-2 pb-1 flex-wrap">
                {Array.from({ length: stripCount }).map((_, i) => {
                  const st = strips[i] || DEFAULT_STRIP;
                  const dotColor = st.enabled ? st.fixedColor : "#4b5563";
                  const isSelected = selectedStripId === i;
                  const label = stripCount === 4
                    ? ['F-Izq', 'F-Der', 'T-Izq', 'T-Der'][i]
                    : ['Izq', 'Der'][i];
                  return (
                    <button key={i} onClick={() => setSelectedStripId(i)}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all"
                      style={{
                        backgroundColor: isSelected ? "color-mix(in srgb,var(--color-primary) 12%,transparent)" : "transparent",
                        borderColor: isSelected ? "var(--color-primary)" : "var(--color-border)",
                        color: isSelected ? "var(--color-primary)" : "var(--color-text)",
                      }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, backgroundColor: dotColor, boxShadow: st.enabled ? `0 0 5px ${dotColor}` : "none", display: "inline-block" }} />
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Config de la tira seleccionada */}
            <div className="px-4 pb-4 pt-2 space-y-3">
              <div className="flex items-center justify-between py-1">
                <span className="text-xs font-semibold opacity-60">
                  {stripCount === 1 ? 'Tira' : stripCount === 4 ? ['F-Izq','F-Der','T-Izq','T-Der'][selectedStripId] : (strip2Face === 'front' ? 'Frente ' : 'Trasera ') + ['Izq','Der'][selectedStripId]}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-40">{strip.enabled ? "Encendida" : "Apagada"}</span>
                  <ToggleSwitch small enabled={strip.enabled}
                    onChange={(v) => {
                      setStrip({ enabled: v, mode: v ? 'fixed' : 'off' });
                      sendLedCommand(selectedStripId, v ? 'fixed' : 'off', { rgb: v ? hexToRgb(strip.fixedColor) : [0, 0, 0] });
                    }} />
                </div>
              </div>

              {/* Modo */}
              <div>
                <p className="text-[11px] opacity-40 mb-1.5">Modo</p>
                <div className="flex flex-wrap gap-1">
                  {MODES.map(m => (
                    <button key={m.id} onClick={() => handleModeClick(m.id)} title={m.desc}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                      style={{
                        backgroundColor: strip.mode === m.id ? "var(--color-primary)" : "transparent",
                        color: strip.mode === m.id ? "#fff" : "var(--color-text)",
                        borderColor: strip.mode === m.id ? "var(--color-primary)" : "var(--color-border)",
                        opacity: (!strip.enabled && m.id !== 'off') ? 0.4 : 1,
                      }}>
                      {m.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] opacity-35 mt-1">{MODES.find(m => m.id === strip.mode)?.desc || ""}</p>
              </div>

              {strip.mode === 'fixed' && (
                <div>
                  <p className="text-xs opacity-40 mb-1.5">Color</p>
                  <div className="flex items-center gap-2">
                    <input type="color" value={strip.fixedColor} onChange={e => setStrip({ fixedColor: e.target.value })} disabled={!strip.enabled} className="w-10 h-8 rounded cursor-pointer p-0.5" style={{ border: "none", background: "none" }} />
                    <span className="font-mono text-xs opacity-40 flex-1">{strip.fixedColor.toUpperCase()}</span>
                    <button disabled={!strip.enabled} onClick={() => sendLedCommand(selectedStripId, 'fixed', { rgb: hexToRgb(strip.fixedColor) })} className="px-3 py-1 text-xs rounded-lg text-white disabled:opacity-40" style={{ backgroundColor: "var(--color-primary)" }}>Aplicar</button>
                  </div>
                </div>
              )}
              {strip.mode === 'door_open' && (
                <div className="space-y-2">
                  <p className="text-xs opacity-40 mb-1">Color apertura</p>
                  <div className="flex items-center gap-2">
                    <input type="color" value={strip.fixedColor} onChange={e => setStrip({ fixedColor: e.target.value })} disabled={!strip.enabled} className="w-10 h-8 rounded cursor-pointer p-0.5" style={{ border: "none", background: "none" }} />
                    <span className="font-mono text-xs opacity-40 flex-1">{strip.fixedColor.toUpperCase()}</span>
                  </div>
                  <p className="text-xs opacity-40">Solo encender al abrir puerta</p>
                </div>
              )}
              {strip.mode === 'auto_temp' && (
                <div>
                  <p className="text-xs opacity-40">Automático por temperatura</p>
                  <div className="mt-1.5 space-y-1">
                    {[{ label: "< 20°C", color: "#006eff" }, { label: "20–27°C", color: "#00c878" }, { label: "27–30°C", color: "#ffa000" }, { label: ">= 30°C", color: "#ff3c3c" }].map(b => (
                      <div key={b.label} className="flex items-center gap-2">
                        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: b.color, display: "inline-block", flexShrink: 0 }} />
                        <span className="text-xs opacity-50">{b.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {strip.mode === 'alert' && (
                <div className="space-y-2">
                  <p className="text-xs opacity-40 mb-1">Color alerta</p>
                  <div className="flex items-center gap-2">
                    <input type="color" value={strip.alertColor} onChange={e => setStrip({ alertColor: e.target.value })} disabled={!strip.enabled} className="w-10 h-8 rounded cursor-pointer p-0.5" style={{ border: "none", background: "none" }} />
                    <span className="font-mono text-xs opacity-40 flex-1">{strip.alertColor.toUpperCase()}</span>
                  </div>
                  <p className="text-xs opacity-40">Solo encender en alertas</p>
                </div>
              )}
            </div>
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
                        {placed ? `U${pos.u} · ${pos.face === 'back' ? 'Trasera' : 'Frente'}` : "Sin ubicar"} · {device.desc}
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

        {/* ---- COLUMNA DERECHA: Gabinete 3D (frontal + trasera) ---- */}
        <div className="lg:col-span-2 rounded-2xl border" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
          <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--color-border)" }}>
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Vista del Gabinete</h2>
            <p className="text-xs mt-0.5 opacity-35">Frontal y trasera simultáneas</p>
          </div>
          <div className="p-5 flex gap-4 justify-center overflow-x-auto">
            {(() => {
              const front = getFaceStrips('front');
              const back  = getFaceStrips('back');
              return (
                <>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-xs font-medium opacity-50 tracking-wide uppercase">Frontal</span>
                    <Rack3D
                      uCount={U_COUNT}
                      leftStrip={front.leftStrip}
                      rightStrip={front.rightStrip}
                      leftSelected={front.leftId === selectedStripId}
                      rightSelected={front.rightId === selectedStripId}
                      placedDevices={placedDevices.filter(d => (d.placement.face || 'front') === 'front')}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-xs font-medium opacity-50 tracking-wide uppercase">Trasera</span>
                    <Rack3DBack
                      uCount={U_COUNT}
                      leftStrip={back.leftStrip}
                      rightStrip={back.rightStrip}
                      leftSelected={back.leftId === selectedStripId}
                      rightSelected={back.rightId === selectedStripId}
                      placedDevices={placedDevices.filter(d => d.placement.face === 'back')}
                    />
                  </div>
                </>
              );
            })()}
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
   HELPERS COMPARTIDOS PARA RACKS
============================================================ */
function RackStrip({ strip, side, selected }) {
  if (!strip) return null;
  const c    = strip.enabled ? strip.fixedColor : "#2a3040";
  const glow = strip.enabled
    ? `0 0 6px ${strip.fixedColor}cc, 0 0 18px ${strip.fixedColor}55`
    : "none";
  return (
    <div style={{
      position: "absolute",
      [side === "left" ? "right" : "left"]: 0,
      top: "4%", bottom: "4%", width: selected ? 6 : 4,
      background: `linear-gradient(to bottom, ${c}00 0%, ${c} 8%, ${c} 92%, ${c}00 100%)`,
      boxShadow: selected ? `${glow}, 0 0 0 1px rgba(255,255,255,0.35)` : glow,
      opacity: strip.enabled ? 1 : 0.25,
      transition: "all 0.3s ease",
      borderRadius: 3,
    }} />
  );
}

function RackDevice({ dev, uCount, mountH, panelW, isBack = false }) {
  const color  = getColor(dev.type);
  const isRack = isRackMount(dev.type);
  const U_H    = mountH / uCount;

  if (isRack) {
    const top = ((dev.placement.u - 1) / uCount) * mountH;
    const h   = Math.max(((dev.uHeight || 1) / uCount) * mountH - 1, 7);
    return (
      <div style={{
        position: "absolute", top, left: 0, right: 0, height: h,
        background: `linear-gradient(90deg, ${color} 0px, ${color}cc 3px, ${color}15 100%)`,
        borderTop: `1px solid ${color}70`,
        borderBottom: `1px solid ${color}25`,
        display: "flex", alignItems: "center",
        paddingLeft: 6, paddingRight: 5, overflow: "hidden",
      }}>
        <span style={{ fontSize: 6.5, color: "#cdd8e8", fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", letterSpacing: 0.4 }}>
          {dev.name}
        </span>
        {!isBack && (
          <div style={{ display: "flex", gap: 2.5, flexShrink: 0 }}>
            <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 5px #22c55e99" }} />
            {dev.type === "appliance" && <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#60a5fa", boxShadow: "0 0 5px #60a5fa99" }} />}
          </div>
        )}
      </div>
    );
  }

  const yDot = ((dev.placement.u - 1) / uCount) * mountH + U_H / 2;
  const xDot = dev.placement.x * Math.max(panelW - 14, 20) + 4;
  return (
    <div title={`${dev.name} · U${dev.placement.u}`} style={{
      position: "absolute", top: yDot - 5, left: xDot,
      width: 10, height: 10, borderRadius: "50%",
      background: color,
      boxShadow: `0 0 6px ${color}ee, 0 0 14px ${color}66`,
      zIndex: 5,
    }} />
  );
}

function RackRail({ side, uCount, mountTop, uH, strip, selected }) {
  return (
    <div style={{
      position: "absolute",
      [side]: 0, top: 0, width: 22, height: "100%",
      background: side === "left"
        ? "linear-gradient(90deg, #1a2438 0%, #1f2d44 75%, #1b2840 100%)"
        : "linear-gradient(270deg, #1a2438 0%, #1f2d44 75%, #1b2840 100%)",
      [side === "left" ? "borderRight" : "borderLeft"]: "1px solid #263348",
      overflow: "hidden",
    }}>
      {Array.from({ length: uCount }).map((_, i) => (
        <div key={i} style={{
          position: "absolute",
          left: "50%", transform: "translateX(-50%)",
          top: mountTop + i * uH + uH * 0.28,
          width: 8, height: Math.max(uH * 0.44, 3),
          borderRadius: 2,
          background: "#0b1421",
          border: "1px solid #162030",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,0.7)",
        }} />
      ))}
      <RackStrip strip={strip} side={side} selected={selected} />
    </div>
  );
}

/* ============================================================
   RACK 3D (FRONTAL)
============================================================ */
function Rack3D({ uCount = 42, leftStrip = null, rightStrip = null, leftSelected = false, rightSelected = false, placedDevices = [] }) {
  const W = 230, H = 520, DEPTH = 68;
  const RAIL = 22;
  const MNT_T = 14, MNT_B = 14;
  const MNT_H = H - MNT_T - MNT_B;
  const MNT_W = W - RAIL * 2;
  const U_H   = MNT_H / uCount;

  return (
    <div style={{ perspective: "1100px", perspectiveOrigin: "50% 38%" }}>
      <div style={{ width: W, height: H, position: "relative", transformStyle: "preserve-3d", transform: "rotateX(8deg) rotateY(-20deg)" }}>

        {/* CARA FRONTAL */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, #1b2338 0%, #141b2c 55%, #0f1420 100%)",
          border: "2px solid #26334e",
          borderRadius: 5, overflow: "hidden",
          boxShadow: "inset 0 0 55px rgba(0,0,0,0.55), inset 0 2px 0 rgba(255,255,255,0.05)",
        }}>

          {/* Rails con tiras LED */}
          <RackRail side="left"  uCount={uCount} mountTop={MNT_T} uH={U_H} strip={leftStrip}  selected={leftSelected}  />
          <RackRail side="right" uCount={uCount} mountTop={MNT_T} uH={U_H} strip={rightStrip} selected={rightSelected} />

          {/* Panel de montaje */}
          <div style={{
            position: "absolute",
            left: RAIL, right: RAIL, top: MNT_T, bottom: MNT_B,
            background: "#08101a",
            border: "1px solid #162030",
            borderRadius: 2, overflow: "hidden",
          }}>
            {/* Líneas de U slots */}
            {Array.from({ length: uCount }).map((_, i) => (
              <div key={i} style={{
                position: "absolute", top: i * U_H, left: 0, right: 0, height: U_H,
                borderBottom: `1px solid ${(i + 1) % 6 === 0 ? "#1c2d42" : "#0c1724"}`,
                boxSizing: "border-box",
              }}>
                {(i + 1) % 6 === 0 && (
                  <span style={{ position: "absolute", right: 3, bottom: 1, fontSize: 5.5, color: "#243348", userSelect: "none", fontFamily: "monospace" }}>
                    U{i + 1}
                  </span>
                )}
              </div>
            ))}
            {/* Equipos y sensores */}
            {placedDevices.map(dev => (
              <RackDevice key={dev.id} dev={dev} uCount={uCount} mountH={MNT_H} panelW={MNT_W} />
            ))}
          </div>

          {/* Tornillos en esquinas */}
          {[[5,5],[W-9,5],[5,H-9],[W-9,H-9]].map(([cx,cy],i) => (
            <div key={i} style={{
              position: "absolute", left: cx-4, top: cy-4, width: 8, height: 8,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, #3a4e64 0%, #182538 70%)",
              border: "1px solid #263348",
            }}>
              <div style={{ position: "absolute", left: "50%", top: 1, bottom: 1, width: 1, transform: "translateX(-50%)", background: "#0b1521", borderRadius: 1 }} />
            </div>
          ))}

          {/* Etiqueta inferior */}
          <div style={{
            position: "absolute", bottom: 3, left: RAIL, right: RAIL,
            textAlign: "center", fontSize: 5.5, color: "#1e2d40",
            userSelect: "none", letterSpacing: 2.5, fontWeight: 700, fontFamily: "monospace",
          }}>
            {uCount}U RACK · FRONT
          </div>
        </div>

        {/* Cara lateral derecha */}
        <div style={{
          position: "absolute", width: DEPTH, height: H, left: W, top: 0,
          transform: `rotateY(90deg) translateZ(${DEPTH/2}px) translateX(${-DEPTH/2}px)`,
          transformOrigin: "left center",
          background: "linear-gradient(to right, #0d1825 0%, #111e30 45%, #091016 100%)",
          border: "1px solid #182030", pointerEvents: "none", overflow: "hidden",
        }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", top: 16 + i * (H - 32) / 7,
              left: 6, right: 6, height: 3,
              background: "#070e18", borderRadius: 1, border: "1px solid #121c28",
            }} />
          ))}
        </div>

        {/* Cara superior */}
        <div style={{
          position: "absolute", width: W, height: DEPTH, top: -DEPTH,
          transform: `rotateX(90deg) translateZ(${-DEPTH/2}px) translateY(${-DEPTH/2}px)`,
          transformOrigin: "bottom center",
          background: "linear-gradient(to bottom, #070c16 0%, #0e1826 100%)",
          border: "1px solid #182030", pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

/* ============================================================
   RACK 3D (TRASERA)
============================================================ */
function Rack3DBack({ uCount = 42, leftStrip = null, rightStrip = null, leftSelected = false, rightSelected = false, placedDevices = [] }) {
  const W = 230, H = 520, DEPTH = 68;
  const RAIL = 22;
  const MNT_T = 14, MNT_B = 14;
  const MNT_H = H - MNT_T - MNT_B;
  const MNT_W = W - RAIL * 2;
  const U_H   = MNT_H / uCount;

  return (
    <div style={{ perspective: "1100px", perspectiveOrigin: "50% 38%" }}>
      <div style={{ width: W, height: H, position: "relative", transformStyle: "preserve-3d", transform: "rotateX(8deg) rotateY(160deg)" }}>

        {/* CARA TRASERA */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, #141c2e 0%, #0f1520 55%, #0b1018 100%)",
          border: "2px solid #20303f",
          borderRadius: 5, overflow: "hidden",
          boxShadow: "inset 0 0 55px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.04)",
        }}>

          {/* Rails con tiras LED */}
          <RackRail side="left"  uCount={uCount} mountTop={MNT_T} uH={U_H} strip={leftStrip}  selected={leftSelected}  />
          <RackRail side="right" uCount={uCount} mountTop={MNT_T} uH={U_H} strip={rightStrip} selected={rightSelected} />

          {/* Panel trasero: gestión de cables + equipos */}
          <div style={{
            position: "absolute",
            left: RAIL, right: RAIL, top: MNT_T, bottom: MNT_B,
            background: "#060d16",
            border: "1px solid #141e2c",
            borderRadius: 2, overflow: "hidden",
          }}>
            {/* Guías de cable horizontales */}
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{
                position: "absolute",
                top: `${6 + i * 88 / 10}%`,
                left: 8, right: 8, height: 5,
                background: "linear-gradient(90deg, #0c1520, #111e2e, #0c1520)",
                borderRadius: 3, border: "1px solid #162030",
                boxShadow: "0 1px 3px rgba(0,0,0,0.7)",
              }} />
            ))}
            {/* Canales verticales */}
            {[0.24, 0.5, 0.76].map((f, i) => (
              <div key={i} style={{
                position: "absolute", top: 8, bottom: 8,
                left: `${f * 100}%`, width: 4,
                background: "#0a1420", border: "1px solid #162030", borderRadius: 2,
              }} />
            ))}

            {/* Equipos en cara trasera */}
            {placedDevices.map(dev => (
              <RackDevice key={dev.id} dev={dev} uCount={uCount} mountH={MNT_H} panelW={MNT_W} isBack />
            ))}

            {/* Etiqueta cable management */}
            <div style={{
              position: "absolute", bottom: 8, left: 0, right: 0,
              textAlign: "center", fontSize: 5.5, color: "#182030",
              userSelect: "none", letterSpacing: 2.5, fontWeight: 700, fontFamily: "monospace",
            }}>
              CABLE MANAGEMENT
            </div>
          </div>

          {/* Tornillos */}
          {[[5,5],[W-9,5],[5,H-9],[W-9,H-9]].map(([cx,cy],i) => (
            <div key={i} style={{
              position: "absolute", left: cx-4, top: cy-4, width: 8, height: 8,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, #2e4058 0%, #121e2e 70%)",
              border: "1px solid #1e2e3e",
            }}>
              <div style={{ position: "absolute", left: "50%", top: 1, bottom: 1, width: 1, transform: "translateX(-50%)", background: "#07101a", borderRadius: 1 }} />
            </div>
          ))}

          {/* Etiqueta inferior */}
          <div style={{
            position: "absolute", bottom: 3, left: RAIL, right: RAIL,
            textAlign: "center", fontSize: 5.5, color: "#172030",
            userSelect: "none", letterSpacing: 2.5, fontWeight: 700, fontFamily: "monospace",
          }}>
            {uCount}U RACK · REAR
          </div>
        </div>

        {/* Cara lateral derecha */}
        <div style={{
          position: "absolute", width: DEPTH, height: H, left: W, top: 0,
          transform: `rotateY(90deg) translateZ(${DEPTH/2}px) translateX(${-DEPTH/2}px)`,
          transformOrigin: "left center",
          background: "linear-gradient(to right, #0a1520 0%, #0e1a28 45%, #08100e 100%)",
          border: "1px solid #141e2c", pointerEvents: "none", overflow: "hidden",
        }}>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} style={{
              position: "absolute", top: 16 + i * (H - 32) / 7,
              left: 6, right: 6, height: 3,
              background: "#060c14", borderRadius: 1, border: "1px solid #101820",
            }} />
          ))}
        </div>

        {/* Cara superior */}
        <div style={{
          position: "absolute", width: W, height: DEPTH, top: -DEPTH,
          transform: `rotateX(90deg) translateZ(${-DEPTH/2}px) translateY(${-DEPTH/2}px)`,
          transformOrigin: "bottom center",
          background: "linear-gradient(to bottom, #060b14 0%, #0c1622 100%)",
          border: "1px solid #141e2c", pointerEvents: "none",
        }} />
      </div>
    </div>
  );
}

/* ============================================================
   MODAL DE POSICIONAMIENTO (2D interactivo)
============================================================ */
function PlacementModal({ device, currentPlacement, allPlacements, allDevices, onSave, onRemove, onClose }) {
  const [tempPos, setTempPos] = useState(currentPlacement ? { u: currentPlacement.u, x: currentPlacement.x } : null);
  const [face, setFace] = useState(currentPlacement?.face || 'front');

  const handleSvgClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const svgX = (e.clientX - rect.left) * (RACK_W / rect.width);
    const svgY = (e.clientY - rect.top)  * (RACK_H / rect.height);
    const u = Math.max(1, Math.min(U_COUNT, Math.round(((svgY - RACK_MT) / (RACK_H - RACK_MT - RACK_MB)) * U_COUNT + 1)));
    const x = Math.max(0, Math.min(1, (svgX - 18) / (RACK_W - 36)));
    setTempPos({ u, x });
  };

  // Mostrar otros equipos solo de la misma cara
  const others = allDevices
    .filter(d => d.id !== device.id && allPlacements[d.id] && (allPlacements[d.id].face || 'front') === face)
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
              <p className="text-xs opacity-35">Selecciona la cara y haz clic en el rack</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Selector Frente / Trasera */}
            <div className="flex gap-1">
              {[{ id: 'front', label: 'Frente' }, { id: 'back', label: 'Trasera' }].map(f => (
                <button key={f.id} onClick={() => setFace(f.id)}
                  className="px-3 py-1 text-xs font-medium rounded-lg border transition-all"
                  style={{
                    backgroundColor: face === f.id ? "var(--color-primary)" : "transparent",
                    color: face === f.id ? "#fff" : "var(--color-text)",
                    borderColor: face === f.id ? "var(--color-primary)" : "var(--color-border)",
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
            <button onClick={onClose} className="opacity-40 hover:opacity-100 transition"><FiX size={16} /></button>
          </div>
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
                  <p className="text-sm"><span className="opacity-40">Cara: </span><strong>{face === 'back' ? 'Trasera' : 'Frontal'}</strong></p>
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
              <button onClick={() => tempPos && onSave({ ...tempPos, face })} disabled={!tempPos}
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
