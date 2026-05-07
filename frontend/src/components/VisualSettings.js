import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { themes as builtinThemes } from "../theme/themes";
import {
  FiUpload, FiImage, FiCheck, FiX, FiMonitor, FiSliders,
  FiSun, FiMoon, FiTrash2, FiPlus, FiChevronDown, FiChevronRight,
  FiRefreshCcw, FiDisc,
} from "react-icons/fi";
import { BACKEND, resolveLogoUrl } from "../utils/api";
import { authHeader } from "../utils/auth";

// ============================================================
// Helpers
// ============================================================
function shadeColor(hex, pct) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.max(0, Math.round(((num >> 16) * (100 + pct)) / 100)));
  const g = Math.min(255, Math.max(0, Math.round((((num >> 8) & 0xff) * (100 + pct)) / 100)));
  const b = Math.min(255, Math.max(0, Math.round(((num & 0xff) * (100 + pct)) / 100)));
  return "#" + [r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("");
}

function toAccent(hex) {
  // Genera un acento complementario rotando el matiz ~30° más luminoso
  return shadeColor(hex, 35);
}

// ============================================================
// Pantallas físicas — helpers y componentes
// ============================================================
function _polarToCart(cx, cy, r, deg) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function _arcPath(cx, cy, r, a1, a2) {
  const [sx, sy] = _polarToCart(cx, cy, r, a1);
  const [ex, ey] = _polarToCart(cx, cy, r, a2);
  const large = (a2 - a1 > 180) ? 1 : 0;
  return `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`;
}

const TFT_MODES = [
  { id: 'cpu_gauge',   label: 'CPU Gauge',      desc: 'Gauge de temperatura del procesador + reloj' },
  { id: 'sensor_data', label: 'Datos Sensores', desc: 'Temperatura y humedad de sensores IoT' },
  { id: 'clock',       label: 'Reloj',          desc: 'Hora y fecha en pantalla completa' },
  { id: 'door_status', label: 'Puerta',         desc: 'Estado de puerta + hora' },
  { id: 'custom',      label: 'Personalizado',  desc: 'Texto configurable en pantalla' },
];

const LCD_MODES = [
  { id: 'sensors_time', label: 'Sensores + Hora', desc: 'Alterna entre T/H y reloj' },
  { id: 'sensors_only', label: 'Solo Sensores',   desc: 'Temperatura y humedad continua' },
  { id: 'time_only',    label: 'Solo Reloj',      desc: 'Hora y fecha continua' },
  { id: 'custom',       label: 'Personalizado',   desc: 'Dos líneas de texto fijas' },
];

function TFTPreview({ mode, rotationCw, fineDeg, customLines }) {
  const S = 180, cx = 90, cy = 90;
  const rot = (rotationCw || 0) + (fineDeg || 0);

  const cpuGauge = (
    <>
      <path d={_arcPath(cx,cy,66,150,390)} stroke="#1a2440" strokeWidth="11" fill="none" strokeLinecap="round"/>
      <path d={_arcPath(cx,cy,66,150,270)} stroke="#00c8dc" strokeWidth="11" fill="none" strokeLinecap="round"/>
      <text x={cx} y={cy-28} textAnchor="middle" fill="#4a5580" fontSize="9" fontWeight="bold">CPU TEMP</text>
      <text x={cx} y={cy+8}  textAnchor="middle" fill="#00c8dc" fontSize="28" fontWeight="bold">52.3°C</text>
      <line x1={cx-46} y1={cy+20} x2={cx+46} y2={cy+20} stroke="#263348" strokeWidth="1"/>
      <text x={cx} y={cy+38} textAnchor="middle" fill="#00afd7" fontSize="18" fontWeight="bold">12:34:56</text>
      <text x={cx} y={cy+53} textAnchor="middle" fill="#2c3a5a" fontSize="10">24/04/2026</text>
    </>
  );

  const sensorData = (
    <>
      <text x={cx} y={20}  textAnchor="middle" fill="#3a4870" fontSize="8">MONITOREO IoT</text>
      <text x={cx} y={34}  textAnchor="middle" fill="#4a5580" fontSize="8">TEMP. MÁX</text>
      <text x={cx} y={62}  textAnchor="middle" fill="#ef4444" fontSize="24" fontWeight="bold">27.1°C</text>
      <rect x={32} y={70} width={116} height={5} rx="2" fill="#111b2e"/>
      <rect x={32} y={70} width={56}  height={5} rx="2" fill="#ef4444"/>
      <line x1={42} y1={84} x2={138} y2={84} stroke="#263348" strokeWidth="1"/>
      <text x={cx} y={97}  textAnchor="middle" fill="#4a5580" fontSize="8">HUMEDAD PROM.</text>
      <text x={cx} y={125} textAnchor="middle" fill="#3b82f6" fontSize="24" fontWeight="bold">66.5%</text>
      <rect x={32} y={132} width={116} height={5} rx="2" fill="#111b2e"/>
      <rect x={32} y={132} width={77}  height={5} rx="2" fill="#3b82f6"/>
      <circle cx={cx-22} cy={150} r={3} fill="#22c55e"/>
      <text x={cx-14} y={153} fill="#22c55e" fontSize="9" fontWeight="bold">NORMAL</text>
      <text x={cx} y={167} textAnchor="middle" fill="#2c3a5a" fontSize="8">1 sensor · ahora</text>
    </>
  );

  const clockMode = (
    <>
      <text x={cx} y={cy-16} textAnchor="middle" fill="#00afd7" fontSize="24" fontWeight="bold">12:34:56</text>
      <line x1={42} y1={cy-4} x2={138} y2={cy-4} stroke="#263348" strokeWidth="1"/>
      <text x={cx} y={cy+18} textAnchor="middle" fill="#6b7a9e" fontSize="13">Viernes</text>
      <text x={cx} y={cy+36} textAnchor="middle" fill="#4a5580" fontSize="15" fontWeight="bold">24/04/2026</text>
    </>
  );

  const doorStatus = (
    <>
      <text x={cx} y={38}  textAnchor="middle" fill="#00afd7" fontSize="22" fontWeight="bold">12:34:56</text>
      <text x={cx} y={54}  textAnchor="middle" fill="#3a4870" fontSize="10">24/04/2026</text>
      <line x1={42} y1={64} x2={138} y2={64} stroke="#263348" strokeWidth="1"/>
      <text x={cx} y={82}  textAnchor="middle" fill="#4a5580" fontSize="11">PUERTA</text>
      <text x={cx} y={108} textAnchor="middle" fill="#22c55e" fontSize="20" fontWeight="bold">Cerrada</text>
      <circle cx={cx} cy={146} r={22} fill="#22c55e"/>
      <text x={cx} y={150} textAnchor="middle" fill="#000" fontSize="13" fontWeight="bold">OK</text>
    </>
  );

  const customMode = (
    <>
      <text x={cx} y={cy-12} textAnchor="middle" fill="#e2e8f0" fontSize="13" fontWeight="bold">
        {(customLines && customLines[0]) || 'Línea 1 aquí'}
      </text>
      <text x={cx} y={cy+14} textAnchor="middle" fill="#94a3b8" fontSize="11">
        {(customLines && customLines[1]) || 'Línea 2 aquí'}
      </text>
      {customLines && customLines[2] && (
        <text x={cx} y={cy+34} textAnchor="middle" fill="#64748b" fontSize="10">{customLines[2]}</text>
      )}
      <text x={cx} y={S-12} textAnchor="middle" fill="#2c3a5a" fontSize="8">Personalizado</text>
    </>
  );

  const modeMap = { cpu_gauge: cpuGauge, sensor_data: sensorData, clock: clockMode, door_status: doorStatus, custom: customMode };

  return (
    <div style={{
      width: S, height: S, borderRadius: '50%', overflow: 'hidden',
      backgroundColor: '#000', flexShrink: 0, position: 'relative',
      boxShadow: '0 0 0 3px #1e2d45, 0 0 0 5px #0f1724, 0 8px 30px rgba(0,0,0,0.6)',
      transform: `rotate(${rot}deg)`, transition: 'transform 0.35s ease',
    }}>
      <svg width={S} height={S} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="tftBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#101828"/>
            <stop offset="100%" stopColor="#060c14"/>
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={S/2} fill="url(#tftBg)"/>
        {modeMap[mode] || clockMode}
      </svg>
    </div>
  );
}

function LCDPreview({ mode, customLine1, customLine2 }) {
  const green = '#4ade80';
  const rows = (() => {
    switch (mode) {
      case 'sensors_only': return ['T:27.1C  H:66.5%', '  2 sensores    '];
      case 'time_only':    return ['    12:34:56    ', '   24/04/2026   '];
      case 'custom':       return [
        (customLine1 || '').padEnd(16).slice(0, 16),
        (customLine2 || '').padEnd(16).slice(0, 16),
      ];
      default:             return ['T:27.1C  H:66.5%', '    NORMAL      '];
    }
  })();
  return (
    <div style={{
      backgroundColor: '#0a1f10', borderRadius: 8, padding: '10px 14px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5), inset 0 1px 3px rgba(255,255,255,0.04)',
      border: '2px solid #1a3020', flexShrink: 0,
    }}>
      <div style={{ fontFamily: "'Courier New',monospace", fontSize: 14, lineHeight: 2, letterSpacing: 2 }}>
        <div style={{ color: green, textShadow: `0 0 6px ${green}` }}>{rows[0]}</div>
        <div style={{ color: green, textShadow: `0 0 6px ${green}` }}>{rows[1]}</div>
      </div>
      <div style={{ fontSize: 9, color: '#2a5030', textAlign: 'center', marginTop: 5, letterSpacing: 1 }}>
        16×2 · I2C · PCF8574 · 0x27
      </div>
    </div>
  );
}

// ============================================================
// ThemeCard
// ============================================================
function ThemeCard({ t, isActive, onApply, onDelete, deleteConfirm, onAskDelete, onCancelDelete }) {

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col transition-all"
      style={{
        border: isActive
          ? "2px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg)",
      }}
    >
      {/* Barra de colores preview */}
      <div className="h-2 flex">
        <div className="flex-1" style={{ backgroundColor: t.primaryColor }} />
        <div className="flex-1" style={{ backgroundColor: t.accentColor }} />
        <div className="w-8" style={{ backgroundColor: shadeColor(t.primaryColor, -50) }} />
      </div>

      {/* Cuerpo */}
      <div className="p-4 flex items-center gap-3 flex-1">
        {t.logo ? (
          <img
            src={resolveLogoUrl(t.logo)}
            alt={t.name}
            className="w-9 h-9 object-contain rounded"
            style={{ background: "color-mix(in srgb, var(--color-primary) 12%, white)" }}
          />
        ) : (
          <div
            className="w-9 h-9 rounded flex items-center justify-center text-sm font-bold text-white shrink-0"
            style={{ backgroundColor: t.primaryColor }}
          >
            {(t.name || "T")[0].toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm leading-tight truncate">{t.name}</p>
          <p className="text-[11px] mt-0.5 font-mono truncate" style={{ color: "var(--color-text-muted, #888)" }}>
            {t.primaryColor}
          </p>
        </div>
        {isActive && (
          <span
            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            Activo
          </span>
        )}
      </div>

      {/* Acciones */}
      <div
        className="px-4 pb-4 pt-1 flex items-center gap-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <button
          onClick={() => onApply(t.key)}
          disabled={isActive}
          className="flex-1 py-1.5 rounded-md text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          {isActive ? "Tema activo" : "Aplicar"}
        </button>

        {t.key !== "default" && (
          deleteConfirm === t.key ? (
            <div className="flex gap-1">
              <button
                onClick={() => onDelete(t.key)}
                className="p-1.5 rounded transition hover:bg-red-600/20 text-red-400"
                title="Confirmar eliminación"
              >
                <FiCheck size={13} />
              </button>
              <button
                onClick={onCancelDelete}
                className="p-1.5 rounded transition hover:bg-white/10 text-gray-400"
                title="Cancelar"
              >
                <FiX size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onAskDelete(t.key)}
              className="p-1.5 rounded transition hover:bg-red-600/20 text-red-400"
              title="Eliminar tema"
            >
              <FiTrash2 size={13} />
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ============================================================
// LogoSlot
// ============================================================
function LogoSlot({ label, description, value, onChange }) {
  const fileRef = useRef();
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${BACKEND}/upload_logo`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Error al subir");
      onChange(data.url);
    } catch (err) {
      alert("Error al subir imagen: " + err.message);
    } finally {
      setUploading(false);
      fileRef.current.value = "";
    }
  };

  return (
    <div
      className="rounded-xl border p-4 flex flex-col gap-3"
      style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}
    >
      <div>
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted, #888)" }}>
          {description}
        </p>
      </div>

      {/* Preview */}
      <div
        className="h-20 flex items-center justify-center rounded-lg border"
        style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}
      >
        {value ? (
          <img src={resolveLogoUrl(value)} alt="logo preview" className="max-h-16 max-w-full object-contain" />
        ) : (
          <FiImage size={28} className="opacity-20" />
        )}
      </div>

      {/* URL input */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="URL del logo…"
        className="w-full px-3 py-1.5 text-xs rounded-md"
        style={{
          backgroundColor: "var(--color-card)",
          color: "var(--color-text)",
          border: "1px solid var(--color-border)",
        }}
      />

      {/* Botón subir */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="flex items-center justify-center gap-2 px-3 py-1.5 text-xs rounded-md text-white transition hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: "var(--color-primary)" }}
      >
        {uploading ? "Subiendo…" : <><FiUpload size={11} /> Subir imagen</>}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/svg+xml,image/png,image/webp,image/jpeg,image/jpg"
        onChange={handleFile}
        className="hidden"
      />
      <p className="text-[10px] leading-relaxed" style={{ color: "var(--color-text-muted, #888)" }}>
        <strong>Recomendado:</strong> SVG (vectorial, escala sin pixelarse) o PNG con fondo transparente.<br/>
        Dimensiones: <strong>200 × 200 px</strong> como mínimo · ratio 1:1 para sidebar · 4:1 para login.
      </p>

      {value && (
        <button
          onClick={() => onChange("")}
          className="text-xs text-center hover:underline"
          style={{ color: "var(--color-text-muted, #888)" }}
        >
          Quitar (usar predeterminado)
        </button>
      )}
    </div>
  );
}

// ============================================================
// Componente principal
// ============================================================
export default function VisualSettings() {
  const { themeKey, themeMode, setThemeKey, setCustomTheme, toggleThemeMode } = useTheme();

  const [activeTab, setActiveTab] = useState("apariencia");

  // Branding
  const [branding, setBranding]         = useState({ login_logo: "", sidebar_logo: "", web_logo: "", app_name: "" });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [brandingMsg,    setBrandingMsg]    = useState(null);

  // Temas del servidor
  const [dbThemes,   setDbThemes]   = useState({});
  const [loadingT,   setLoadingT]   = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Creador de tema
  const [createOpen,   setCreateOpen]   = useState(false);
  const [newName,      setNewName]      = useState("");
  const [primaryColor, setPrimaryColor] = useState("#3b82f6");
  const [accentColor,  setAccentColor]  = useState("#10b981");
  const [logoURL,      setLogoURL]      = useState("");
  const [logoFile,     setLogoFile]     = useState(null);
  const [creating,     setCreating]     = useState(false);

  // ---- carga inicial ----
  const loadAll = async () => {
    try {
      setLoadingT(true);
      const [bRes, tRes] = await Promise.all([
        fetch(`${BACKEND}/branding`),
        fetch(`${BACKEND}/themes`),
      ]);
      const bData = await bRes.json();
      const tData = await tRes.json();
      setBranding((prev) => ({ ...prev, ...bData }));
      const map = {};
      tData.forEach((t) => {
        map[t.key_name] = {
          key:          t.key_name,
          name:         t.name,
          logo:         t.logo,
          primaryColor: t.primary_color,
          bgColor:      t.bg_color,
          accentColor:  t.accent_color,
        };
      });
      setDbThemes(map);
    } catch {
      // silencioso — puede no tener conexión todavía
    } finally {
      setLoadingT(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  // ---- todos los temas = builtin + DB ----
  const allThemes = { ...builtinThemes, ...dbThemes };

  // ---- aplicar tema ----
  const handleApply = (key) => {
    setThemeKey(key);
    if (dbThemes[key]) setCustomTheme(dbThemes[key]);
  };

  // ---- eliminar tema ----
  const handleDelete = async (key) => {
    await fetch(`${BACKEND}/themes/${key}`, { method: "DELETE", headers: authHeader() });
    const updated = { ...dbThemes };
    delete updated[key];
    setDbThemes(updated);
    setDeleteConfirm(null);
    if (themeKey === key) setThemeKey("default");
  };

  // ---- crear tema ----
  const handleCreate = async () => {
    if (!newName.trim()) return;
    const key = "custom_" + newName.trim().toLowerCase().replace(/\s+/g, "_");
    let logo = logoURL.trim();

    setCreating(true);
    try {
      if (logoFile) {
        const fd = new FormData();
        fd.append("file", logoFile);
        const res = await fetch(`${BACKEND}/upload_logo`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok || !data.url) throw new Error("Error al subir logo");
        logo = data.url;
      }

      await fetch(`${BACKEND}/themes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          key_name:     key,
          name:         newName.trim(),
          logo,
          primaryColor,
          bgColor:      shadeColor(primaryColor, -50),
          accentColor,
        }),
      });

      const newT = { key, name: newName.trim(), logo, primaryColor, bgColor: shadeColor(primaryColor, -50), accentColor };
      setDbThemes((prev) => ({ ...prev, [key]: newT }));
      setCustomTheme(newT);
      setThemeKey(key);

      // Reset form
      setNewName(""); setPrimaryColor("#3b82f6"); setAccentColor("#10b981");
      setLogoURL(""); setLogoFile(null); setCreateOpen(false);
    } catch (err) {
      alert("Error al crear tema: " + err.message);
    } finally {
      setCreating(false);
    }
  };

  // ---- guardar branding ----
  const saveBranding = async () => {
    setBrandingSaving(true);
    setBrandingMsg(null);
    try {
      const res = await fetch(`${BACKEND}/branding`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(branding),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error al guardar");
      setBranding((prev) => ({ ...prev, ...data }));
      setBrandingMsg({ ok: true, text: "Identidad de marca guardada correctamente." });
    } catch (e) {
      setBrandingMsg({ ok: false, text: e.message });
    } finally {
      setBrandingSaving(false);
    }
  };

  const inputStyle = {
    backgroundColor: "var(--color-bg)",
    color:           "var(--color-text)",
    border:          "1px solid var(--color-border)",
  };

  // ── Display config (pantallas físicas) ──────────────────────
  const [displayConfig, setDisplayConfig] = useState({
    tft: { enabled: true, mode: 'sensor_data', rotation_cw: 90, rotation_fine: 0, custom_lines: ['', '', ''] },
    lcd: { enabled: true, mode: 'sensors_time', custom_line1: '', custom_line2: '', cycle_sensors_s: 5, cycle_time_s: 3 },
  });
  const [displaySaving, setDisplaySaving] = useState(false);
  const [displayMsg,    setDisplayMsg]    = useState(null);

  useEffect(() => {
    if (activeTab !== 'pantallas') return;
    fetch(`${BACKEND}/display/config`, { headers: authHeader() })
      .then(r => r.json())
      .then(cfg => { if (cfg && !cfg.error) setDisplayConfig(cfg); })
      .catch(() => {});
  }, [activeTab]);

  const saveDisplayConfig = async () => {
    setDisplaySaving(true);
    try {
      const res = await fetch(`${BACKEND}/display/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(displayConfig),
      });
      const d = await res.json();
      setDisplayMsg({ ok: !!d.ok, text: d.ok ? 'Configuración guardada en la Pi' : (d.error || 'Error al guardar') });
    } catch {
      setDisplayMsg({ ok: false, text: 'Error de conexión con el backend' });
    } finally {
      setDisplaySaving(false);
      setTimeout(() => setDisplayMsg(null), 3000);
    }
  };

  // ============================================================
  return (
    <div
      className="p-6 rounded-xl shadow-lg border space-y-5"
      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", borderColor: "var(--color-border)" }}
    >
      {/* Título */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-[var(--color-primary)] flex items-center gap-2">
          <FiSliders size={22} /> Configuración Visual
        </h2>
        <button
          onClick={loadAll}
          disabled={loadingT}
          className="p-2 rounded-md border transition hover:opacity-80"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          title="Recargar"
        >
          <FiRefreshCcw size={15} className={loadingT ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b" style={{ borderColor: "var(--color-border)" }}>
        {[
          { key: "apariencia", label: "Apariencia",          icon: <FiMonitor size={14} /> },
          { key: "branding",   label: "Identidad de marca",  icon: <FiImage   size={14} /> },
          { key: "pantallas",  label: "Pantallas físicas",   icon: <FiDisc    size={14} /> },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition -mb-px"
            style={{
              borderColor: activeTab === tab.key ? "var(--color-primary)" : "transparent",
              color:        activeTab === tab.key ? "var(--color-primary)" : "var(--color-text-muted, #aaa)",
            }}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ============================================================
          TAB: Apariencia
      ============================================================ */}
      {activeTab === "apariencia" && (
        <div className="space-y-6">

          {/* --- Modo oscuro / claro --- */}
          <div
            className="rounded-xl border p-5 flex items-center justify-between flex-wrap gap-4"
            style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}
          >
            <div>
              <p className="font-semibold text-sm">Modo de visualización</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted, #888)" }}>
                Cambia entre interfaz oscura y clara. Se guarda automáticamente.
              </p>
            </div>

            {/* Toggle dark / light */}
            <div
              className="flex items-center rounded-full p-1 gap-1"
              style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}
            >
              {[
                { mode: "dark",  Icon: FiMoon, label: "Oscuro" },
                { mode: "light", Icon: FiSun,  label: "Claro"  },
              ].map(({ mode, Icon, label }) => {
                const active = themeMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => { if (!active) toggleThemeMode(); }}
                    className="flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-all"
                    style={{
                      backgroundColor: active ? "var(--color-primary)" : "transparent",
                      color:            active ? "#fff" : "var(--color-text-muted, #888)",
                    }}
                  >
                    <Icon size={13} /> {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- Grid de temas --- */}
          <div>
            <p className="text-sm font-semibold mb-3">Tema de color activo</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(allThemes).map(([key, t]) => (
                <ThemeCard
                  key={key}
                  t={t}
                  isActive={themeKey === key}
                  onApply={handleApply}
                  onDelete={handleDelete}
                  deleteConfirm={deleteConfirm}
                  onAskDelete={setDeleteConfirm}
                  onCancelDelete={() => setDeleteConfirm(null)}
                />
              ))}
            </div>
          </div>

          {/* --- Crear tema personalizado (colapsable) --- */}
          <div
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: "var(--color-border)" }}
          >
            <button
              type="button"
              onClick={() => setCreateOpen((o) => !o)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold transition hover:opacity-80"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-primary) 8%, transparent)",
                color: "var(--color-primary)",
              }}
            >
              <span className="flex items-center gap-2">
                <FiPlus size={14} /> Crear tema personalizado
              </span>
              {createOpen ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
            </button>

            {createOpen && (
              <div
                className="p-5 space-y-4"
                style={{ borderTop: "1px solid var(--color-border)", backgroundColor: "var(--color-card)" }}
              >
                {/* Preview en tiempo real */}
                <div
                  className="rounded-lg p-4 flex items-center gap-3 text-sm"
                  style={{ backgroundColor: shadeColor(primaryColor, -60), border: `1px solid ${primaryColor}55` }}
                >
                  <div className="w-6 h-6 rounded-full" style={{ backgroundColor: primaryColor }} />
                  <span style={{ color: primaryColor }}>{newName || "Nombre del tema"}</span>
                  <div className="ml-auto flex gap-2">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: primaryColor }} title="Principal" />
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: accentColor }} title="Acento" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Nombre */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-xs font-medium" style={{ color: "var(--color-text-muted, #888)" }}>
                      Nombre del tema
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Ej. Azul corporativo"
                      className="w-full px-3 py-2 rounded-md text-sm"
                      style={inputStyle}
                    />
                  </div>

                  {/* Color principal */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium" style={{ color: "var(--color-text-muted, #888)" }}>
                      Color principal
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={primaryColor}
                        onChange={(e) => {
                          setPrimaryColor(e.target.value);
                          setAccentColor(toAccent(e.target.value));
                        }}
                        className="w-10 h-10 rounded cursor-pointer border-0"
                      />
                      <input
                        type="text"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-md text-sm font-mono"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Color acento */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium" style={{ color: "var(--color-text-muted, #888)" }}>
                      Color de acento
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="w-10 h-10 rounded cursor-pointer border-0"
                      />
                      <input
                        type="text"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-md text-sm font-mono"
                        style={inputStyle}
                      />
                    </div>
                  </div>

                  {/* Logo URL */}
                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-xs font-medium" style={{ color: "var(--color-text-muted, #888)" }}>
                      Logo del tema (opcional)
                    </label>
                    <input
                      type="text"
                      value={logoURL}
                      onChange={(e) => setLogoURL(e.target.value)}
                      placeholder="https://… o subir archivo abajo"
                      className="w-full px-3 py-2 rounded-md text-sm"
                      style={inputStyle}
                    />
                    <div className="flex items-center gap-3 pt-1">
                      <label
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md cursor-pointer transition hover:opacity-80"
                        style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 15%, transparent)", color: "var(--color-primary)" }}
                      >
                        <FiUpload size={11} />
                        {logoFile ? logoFile.name : "Subir archivo"}
                        <input
                          type="file"
                          accept="image/svg+xml,image/png,image/webp,image/jpeg,image/jpg"
                          className="hidden"
                          onChange={(e) => setLogoFile(e.target.files[0])}
                        />
                      </label>
                      {logoFile && (
                        <button
                          onClick={() => setLogoFile(null)}
                          className="text-xs hover:underline"
                          style={{ color: "var(--color-text-muted, #888)" }}
                        >
                          Quitar
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-1">
                  <button
                    onClick={() => setCreateOpen(false)}
                    className="px-4 py-2 rounded-md border text-sm transition hover:opacity-80"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim() || creating}
                    className="px-6 py-2 rounded-md font-semibold text-sm text-white transition hover:opacity-90 disabled:opacity-40"
                    style={{ backgroundColor: "var(--color-primary)" }}
                  >
                    {creating ? "Creando…" : "Crear y aplicar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================
          TAB: Identidad de marca
      ============================================================ */}
      {activeTab === "branding" && (
        <div className="space-y-6">
          <p className="text-sm" style={{ color: "var(--color-text-muted, #aaa)" }}>
            Personaliza el nombre y los logos de la plataforma. Se aplican en login, sidebar y pestaña del navegador.
          </p>

          {/* Nombre de la app */}
          <div
            className="rounded-xl border p-5 space-y-3"
            style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}
          >
            <p className="font-semibold text-sm">Nombre de la aplicación</p>
            <input
              type="text"
              value={branding.app_name}
              onChange={(e) => setBranding((b) => ({ ...b, app_name: e.target.value }))}
              className="w-full max-w-sm px-4 py-2 rounded-md text-sm"
              style={inputStyle}
              placeholder="Sistema de Monitoreo"
            />
          </div>

          {/* Logos */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <LogoSlot
              label="Logo de login"
              description="Pantalla de inicio de sesión."
              value={branding.login_logo}
              onChange={(url) => setBranding((b) => ({ ...b, login_logo: url }))}
            />
            <LogoSlot
              label="Logo del sidebar"
              description="Esquina superior izquierda."
              value={branding.sidebar_logo}
              onChange={(url) => setBranding((b) => ({ ...b, sidebar_logo: url }))}
            />
            <LogoSlot
              label="Favicon / logo web"
              description="Pestaña del navegador."
              value={branding.web_logo}
              onChange={(url) => setBranding((b) => ({ ...b, web_logo: url }))}
            />
          </div>

          {/* Mensaje de estado */}
          {brandingMsg && (
            <div
              className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
                brandingMsg.ok
                  ? "bg-green-900/30 border border-green-600/50 text-green-300"
                  : "bg-red-900/30 border border-red-600/50 text-red-300"
              }`}
            >
              {brandingMsg.ok ? <FiCheck size={14} /> : <FiX size={14} />}
              {brandingMsg.text}
            </div>
          )}

          <button
            onClick={saveBranding}
            disabled={brandingSaving}
            className="flex items-center gap-2 px-6 py-2 rounded-md font-semibold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            {brandingSaving ? (
              <><FiRefreshCcw size={13} className="animate-spin" /> Guardando…</>
            ) : (
              <><FiCheck size={13} /> Guardar identidad de marca</>
            )}
          </button>
        </div>
      )}

      {/* ============================================================
          TAB: Pantallas físicas
      ============================================================ */}
      {activeTab === 'pantallas' && (
        <div className="space-y-6">
          <p className="text-sm" style={{ color: 'var(--color-text-muted, #aaa)' }}>
            Configura la pantalla TFT circular (GC9A01 240×240) y el LCD 16×2 (I2C PCF8574).
            Los cambios se guardan en la Raspberry Pi y son leídos por los scripts Python al reiniciarse.
          </p>

          {/* ── TFT Circular ─────────────────────────────────── */}
          <div className="rounded-xl border p-5 space-y-5"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-semibold text-sm flex items-center gap-2">
                  <FiDisc size={15} style={{ color: 'var(--color-primary)' }}/> Pantalla TFT circular
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted, #888)' }}>
                  GC9A01 · 240×240 px · SPI · DC=GPIO24 · RST=GPIO25
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <span style={{ color: 'var(--color-text-muted, #aaa)' }}>Habilitada</span>
                <div
                  onClick={() => setDisplayConfig(c => ({ ...c, tft: { ...c.tft, enabled: !c.tft.enabled }}))}
                  className="relative w-10 h-6 rounded-full transition-colors"
                  style={{ backgroundColor: displayConfig.tft.enabled ? 'var(--color-primary)' : 'var(--color-border)' }}
                >
                  <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform"
                    style={{ transform: displayConfig.tft.enabled ? 'translateX(16px)' : 'translateX(0)' }}/>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap gap-8 items-start">
              {/* Preview TFT */}
              <div className="flex flex-col items-center gap-3">
                <TFTPreview
                  mode={displayConfig.tft.mode}
                  rotationCw={displayConfig.tft.rotation_cw}
                  fineDeg={displayConfig.tft.rotation_fine}
                  customLines={displayConfig.tft.custom_lines}
                />
                <p className="text-xs" style={{ color: 'var(--color-text-muted, #888)' }}>
                  Rotación: {displayConfig.tft.rotation_cw + displayConfig.tft.rotation_fine}°
                </p>
                {/* Botones de rotación */}
                <div className="flex gap-1">
                  {[0, 90, 180, 270].map(deg => (
                    <button key={deg}
                      onClick={() => setDisplayConfig(c => ({ ...c, tft: { ...c.tft, rotation_cw: deg, rotation_fine: 0 }}))}
                      className="px-2.5 py-1 text-xs rounded-md font-mono transition"
                      style={{
                        backgroundColor: displayConfig.tft.rotation_cw === deg ? 'var(--color-primary)' : 'var(--color-bg)',
                        color: displayConfig.tft.rotation_cw === deg ? '#fff' : 'var(--color-text-muted, #aaa)',
                        border: '1px solid var(--color-border)',
                      }}>{deg}°</button>
                  ))}
                </div>
                {/* Fine-tune */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDisplayConfig(c => ({ ...c, tft: { ...c.tft, rotation_fine: (c.tft.rotation_fine || 0) - 1 }}))}
                    className="px-2 py-0.5 text-sm rounded border transition hover:opacity-80"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>−1°</button>
                  <span className="text-xs w-12 text-center" style={{ color: 'var(--color-text-muted, #aaa)' }}>
                    {displayConfig.tft.rotation_fine > 0 ? '+' : ''}{displayConfig.tft.rotation_fine}°
                  </span>
                  <button
                    onClick={() => setDisplayConfig(c => ({ ...c, tft: { ...c.tft, rotation_fine: (c.tft.rotation_fine || 0) + 1 }}))}
                    className="px-2 py-0.5 text-sm rounded border transition hover:opacity-80"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>+1°</button>
                </div>
              </div>

              {/* Opciones TFT */}
              <div className="flex-1 min-w-[220px] space-y-4">
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted, #888)' }}>Modo de pantalla</p>
                  <div className="space-y-1.5">
                    {TFT_MODES.map(m => (
                      <label key={m.id} className="flex items-start gap-2.5 cursor-pointer group">
                        <div
                          onClick={() => setDisplayConfig(c => ({ ...c, tft: { ...c.tft, mode: m.id }}))}
                          className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: displayConfig.tft.mode === m.id ? 'var(--color-primary)' : 'var(--color-border)' }}
                        >
                          {displayConfig.tft.mode === m.id && (
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }}/>
                          )}
                        </div>
                        <div onClick={() => setDisplayConfig(c => ({ ...c, tft: { ...c.tft, mode: m.id }}))}>
                          <p className="text-sm font-medium leading-tight">{m.label}</p>
                          <p className="text-xs" style={{ color: 'var(--color-text-muted, #888)' }}>{m.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Líneas personalizadas TFT */}
                {displayConfig.tft.mode === 'custom' && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted, #888)' }}>Líneas personalizadas</p>
                    {[0, 1, 2].map(i => (
                      <input key={i}
                        type="text"
                        maxLength={28}
                        placeholder={`Línea ${i + 1}`}
                        value={displayConfig.tft.custom_lines?.[i] || ''}
                        onChange={e => setDisplayConfig(c => {
                          const lines = [...(c.tft.custom_lines || ['', '', ''])];
                          lines[i] = e.target.value;
                          return { ...c, tft: { ...c.tft, custom_lines: lines }};
                        })}
                        className="w-full px-3 py-1.5 text-xs rounded-md"
                        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── LCD 16×2 ─────────────────────────────────────── */}
          <div className="rounded-xl border p-5 space-y-5"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <p className="font-semibold text-sm flex items-center gap-2">
                  <FiMonitor size={15} style={{ color: 'var(--color-primary)' }}/> Pantalla LCD 16×2
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted, #888)' }}>
                  PCF8574 · I2C · Dirección 0x27 · 2 filas × 16 caracteres
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <span style={{ color: 'var(--color-text-muted, #aaa)' }}>Habilitada</span>
                <div
                  onClick={() => setDisplayConfig(c => ({ ...c, lcd: { ...c.lcd, enabled: !c.lcd.enabled }}))}
                  className="relative w-10 h-6 rounded-full transition-colors"
                  style={{ backgroundColor: displayConfig.lcd.enabled ? 'var(--color-primary)' : 'var(--color-border)' }}
                >
                  <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform"
                    style={{ transform: displayConfig.lcd.enabled ? 'translateX(16px)' : 'translateX(0)' }}/>
                </div>
              </label>
            </div>

            <div className="flex flex-wrap gap-8 items-start">
              {/* Preview LCD */}
              <div className="flex flex-col items-center gap-3">
                <LCDPreview
                  mode={displayConfig.lcd.mode}
                  customLine1={displayConfig.lcd.custom_line1}
                  customLine2={displayConfig.lcd.custom_line2}
                />
              </div>

              {/* Opciones LCD */}
              <div className="flex-1 min-w-[220px] space-y-4">
                <div>
                  <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-muted, #888)' }}>Modo de pantalla</p>
                  <div className="space-y-1.5">
                    {LCD_MODES.map(m => (
                      <label key={m.id} className="flex items-start gap-2.5 cursor-pointer group">
                        <div
                          onClick={() => setDisplayConfig(c => ({ ...c, lcd: { ...c.lcd, mode: m.id }}))}
                          className="mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                          style={{ borderColor: displayConfig.lcd.mode === m.id ? 'var(--color-primary)' : 'var(--color-border)' }}
                        >
                          {displayConfig.lcd.mode === m.id && (
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-primary)' }}/>
                          )}
                        </div>
                        <div onClick={() => setDisplayConfig(c => ({ ...c, lcd: { ...c.lcd, mode: m.id }}))}>
                          <p className="text-sm font-medium leading-tight">{m.label}</p>
                          <p className="text-xs" style={{ color: 'var(--color-text-muted, #888)' }}>{m.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Tiempos de ciclo */}
                {displayConfig.lcd.mode === 'sensors_time' && (
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted, #888)' }}>
                        Sensores (seg)
                      </label>
                      <input type="number" min={2} max={60}
                        value={displayConfig.lcd.cycle_sensors_s}
                        onChange={e => setDisplayConfig(c => ({ ...c, lcd: { ...c.lcd, cycle_sensors_s: +e.target.value }}))}
                        className="w-full px-3 py-1.5 text-sm rounded-md"
                        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium" style={{ color: 'var(--color-text-muted, #888)' }}>
                        Reloj (seg)
                      </label>
                      <input type="number" min={1} max={60}
                        value={displayConfig.lcd.cycle_time_s}
                        onChange={e => setDisplayConfig(c => ({ ...c, lcd: { ...c.lcd, cycle_time_s: +e.target.value }}))}
                        className="w-full px-3 py-1.5 text-sm rounded-md"
                        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                      />
                    </div>
                  </div>
                )}

                {/* Líneas personalizadas LCD */}
                {displayConfig.lcd.mode === 'custom' && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted, #888)' }}>Líneas (máx 16 caracteres)</p>
                    <input type="text" maxLength={16}
                      placeholder="Línea 1 (16 chars)"
                      value={displayConfig.lcd.custom_line1}
                      onChange={e => setDisplayConfig(c => ({ ...c, lcd: { ...c.lcd, custom_line1: e.target.value }}))}
                      className="w-full px-3 py-1.5 text-xs rounded-md font-mono"
                      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    />
                    <input type="text" maxLength={16}
                      placeholder="Línea 2 (16 chars)"
                      value={displayConfig.lcd.custom_line2}
                      onChange={e => setDisplayConfig(c => ({ ...c, lcd: { ...c.lcd, custom_line2: e.target.value }}))}
                      className="w-full px-3 py-1.5 text-xs rounded-md font-mono"
                      style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Info hot-reload ──────────────────────────────── */}
          <div className="rounded-lg border p-3 flex gap-2 text-xs"
            style={{ borderColor: '#1e3a5f55', backgroundColor: '#0c1f3311' }}>
            <span style={{ color: '#38bdf8' }}>ℹ</span>
            <span style={{ color: 'var(--color-text-muted, #aaa)' }}>
              Los cambios se aplican automáticamente en la pantalla física en menos de 5 segundos,
              sin necesidad de reiniciar ningún servicio.
            </span>
          </div>

          {/* ── Mensaje de estado ─────────────────────────────── */}
          {displayMsg && (
            <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
              displayMsg.ok
                ? 'bg-green-900/30 border border-green-600/50 text-green-300'
                : 'bg-red-900/30 border border-red-600/50 text-red-300'
            }`}>
              {displayMsg.ok ? <FiCheck size={14}/> : <FiX size={14}/>}
              {displayMsg.text}
            </div>
          )}

          {/* ── Guardar ───────────────────────────────────────── */}
          <button
            onClick={saveDisplayConfig}
            disabled={displaySaving}
            className="flex items-center gap-2 px-6 py-2 rounded-md font-semibold text-sm text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            {displaySaving
              ? <><FiRefreshCcw size={13} className="animate-spin"/> Guardando…</>
              : <><FiCheck size={13}/> Guardar configuración de pantallas</>}
          </button>
        </div>
      )}
    </div>
  );
}
