import React, { useState, useEffect, useCallback } from "react";
import {
  FiCheckCircle, FiAlertCircle, FiRefreshCcw,
  FiWifi, FiServer, FiLock, FiEye, FiEyeOff,
} from "react-icons/fi";
import { BACKEND } from "../utils/api";
import { getUser } from "../utils/auth";

/* ──────────────────────────────────────
   Helpers
────────────────────────────────────── */
function prefixToMask(prefix) {
  const p = parseInt(prefix, 10);
  if (isNaN(p) || p < 0 || p > 32) return "—";
  const mask = (0xFFFFFFFF << (32 - p)) >>> 0;
  return [24, 16, 8, 0].map(s => (mask >> s) & 0xFF).join(".");
}

function authHeader() {
  return { Authorization: `Bearer ${localStorage.getItem("auth_token")}` };
}

/* ──────────────────────────────────────
   Sub-componentes
────────────────────────────────────── */
function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
        style={{ backgroundColor: "#10b981" }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: "#10b981" }} />
    </span>
  );
}

function StatusBadge({ connected, label }) {
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{
        backgroundColor: connected
          ? "color-mix(in srgb, #10b981 15%, transparent)"
          : "color-mix(in srgb, #6b7280 15%, transparent)",
        color: connected ? "#10b981" : "#9ca3af",
      }}>
      {label}
    </span>
  );
}

function ResultBanner({ result }) {
  if (!result) return null;
  return (
    <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl`}
      style={{
        color: result.ok ? "#86efac" : "#fca5a5",
        backgroundColor: result.ok
          ? "color-mix(in srgb,#10b981 12%,transparent)"
          : "color-mix(in srgb,#ef4444 12%,transparent)",
        border: `1px solid ${result.ok ? "#10b98130" : "#ef444430"}`,
      }}>
      {result.ok ? <FiCheckCircle size={14} /> : <FiAlertCircle size={14} />}
      {result.message}
    </div>
  );
}

const inputSt = {
  backgroundColor: "var(--color-bg)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
};

function NetField({ label, value, onChange, placeholder, mono, readOnly }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 opacity-60">{label}</label>
      <input
        value={value}
        onChange={e => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full px-3 py-2 rounded-lg text-sm ${mono ? "font-mono" : ""} ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
        style={inputSt}
      />
    </div>
  );
}

function MaskField({ mask, setMask, readOnly }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 opacity-60">Máscara (prefijo CIDR)</label>
      <div className="flex items-center gap-3">
        <input
          type="number" min={8} max={30} value={mask}
          onChange={e => setMask && setMask(e.target.value)}
          readOnly={readOnly}
          className={`w-20 px-3 py-2 rounded-lg text-sm font-mono ${readOnly ? "opacity-50 cursor-not-allowed" : ""}`}
          style={inputSt}
        />
        <span className="text-xs opacity-40 font-mono">/ {mask} = {prefixToMask(mask)}</span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────
   Panel de IP (DHCP / Estática)
   Reutilizable para eth0 y wlan0
────────────────────────────────────── */
function IpPanel({ iface, cfg, onChange, saving, onSave, result, readOnly }) {
  const { mode, ip, mask, gateway, dns } = cfg;

  return (
    <div className="space-y-4">
      {/* Selector DHCP / Estática */}
      <div className="flex gap-2">
        {[
          { value: "dhcp",   label: "DHCP — automático" },
          { value: "static", label: "IP estática" },
        ].map(opt => (
          <button key={opt.value} type="button"
            disabled={readOnly}
            onClick={() => !readOnly && onChange({ ...cfg, mode: opt.value })}
            className="px-4 py-2 rounded-lg text-sm font-medium border transition disabled:opacity-50"
            style={{
              backgroundColor: mode === opt.value ? "var(--color-primary)" : "transparent",
              color:       mode === opt.value ? "#fff" : "var(--color-text)",
              borderColor: mode === opt.value ? "var(--color-primary)" : "var(--color-border)",
            }}>
            {opt.label}
          </button>
        ))}
      </div>

      {mode === "dhcp" && (
        <p className="text-xs px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: "color-mix(in srgb, #10b981 10%, transparent)", color: "#10b981" }}>
          La interfaz <span className="font-mono">{iface}</span> obtendrá su IP del router automáticamente.
        </p>
      )}

      {mode === "static" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl border"
          style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}>
          <NetField label="Dirección IP" value={ip}
            onChange={v => onChange({ ...cfg, ip: v })} placeholder="192.168.0.25" mono readOnly={readOnly} />
          <MaskField mask={mask} setMask={v => onChange({ ...cfg, mask: v })} readOnly={readOnly} />
          <NetField label="Gateway" value={gateway}
            onChange={v => onChange({ ...cfg, gateway: v })} placeholder="192.168.0.1" mono readOnly={readOnly} />
          <NetField label="DNS primario" value={dns}
            onChange={v => onChange({ ...cfg, dns: v })} placeholder="8.8.8.8" mono readOnly={readOnly} />
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-50 hover:opacity-90"
            style={{ backgroundColor: "var(--color-primary)" }}>
            {saving
              ? <><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white" /> Aplicando…</>
              : "Guardar configuración"}
          </button>
          <ResultBanner result={result} />
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────
   Panel WiFi: Selección de red
   (solo superadmin)
────────────────────────────────────── */
function WifiSsidPanel({ wlanStatus }) {
  const [scanning,   setScanning]   = useState(false);
  const [networks,   setNetworks]   = useState([]);
  const [selected,   setSelected]   = useState("");
  const [password,   setPassword]   = useState("");
  const [showPass,   setShowPass]   = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [result,     setResult]     = useState(null);

  const handleScan = async () => {
    setScanning(true);
    setNetworks([]);
    try {
      const res = await fetch(`${BACKEND}/network/wifi_scan`, { headers: authHeader() });
      const data = await res.json();
      if (data.ok) setNetworks(data.networks || []);
      else setResult({ ok: false, message: data.error || "Error al escanear" });
    } catch {
      setResult({ ok: false, message: "Error de conexión al escanear." });
    } finally {
      setScanning(false);
    }
  };

  const handleConnect = async () => {
    if (!selected) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`${BACKEND}/network/wifi_ssid`, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ ssid: selected, password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error");
      setResult({ ok: true, message: data.message });
      setPassword("");
    } catch (e) {
      setResult({ ok: false, message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const signalBars = (signal) => {
    if (!signal) return "?";
    if (signal >= -50) return "▂▄▆█";
    if (signal >= -60) return "▂▄▆·";
    if (signal >= -70) return "▂▄··";
    if (signal >= -80) return "▂···";
    return "····";
  };

  return (
    <div className="space-y-4">
      {/* Estado actual */}
      {wlanStatus?.ssid_connected && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-xl"
          style={{ backgroundColor: "color-mix(in srgb, #10b981 10%, transparent)", color: "#10b981" }}>
          <FiWifi size={12}/> Conectado a <strong>{wlanStatus.ssid_connected}</strong>
          {wlanStatus.ip_live && <span className="font-mono ml-1">({wlanStatus.ip_live})</span>}
        </div>
      )}
      {wlanStatus?.ssid_configured && wlanStatus.ssid_configured !== wlanStatus.ssid_connected && (
        <p className="text-xs opacity-50">
          Red configurada: <span className="font-mono">{wlanStatus.ssid_configured}</span> (puede que aún no esté conectado)
        </p>
      )}

      {/* Escanear */}
      <div className="flex items-center gap-3">
        <button onClick={handleScan} disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border disabled:opacity-50"
          style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
          {scanning
            ? <><div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2" style={{ borderColor: "var(--color-primary)" }}/> Escaneando…</>
            : <><FiRefreshCcw size={13}/> Escanear redes</>}
        </button>
        {networks.length > 0 && (
          <span className="text-xs opacity-40">{networks.length} redes encontradas</span>
        )}
      </div>

      {/* Lista de redes */}
      {networks.length > 0 && (
        <div className="rounded-xl border overflow-hidden"
          style={{ borderColor: "var(--color-border)" }}>
          {networks.map((n, i) => (
            <button key={n.ssid} type="button"
              onClick={() => setSelected(n.ssid)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:opacity-80 transition"
              style={{
                backgroundColor: selected === n.ssid
                  ? "color-mix(in srgb, var(--color-primary) 15%, var(--color-card))"
                  : i % 2 === 0 ? "var(--color-card)" : "color-mix(in srgb, var(--color-bg) 40%, var(--color-card))",
                borderBottom: i < networks.length - 1 ? "1px solid var(--color-border)" : "none",
                color: "var(--color-text)",
              }}>
              <div className="flex items-center gap-2">
                <FiWifi size={13} style={{ color: selected === n.ssid ? "var(--color-primary)" : undefined }}/>
                <span className="font-medium">{n.ssid}</span>
                {n.security && (
                  <FiLock size={10} className="opacity-40" title={n.security}/>
                )}
              </div>
              <span className="font-mono text-[11px] opacity-50" title={`${n.signal ?? "?"} dBm`}>
                {signalBars(n.signal)}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Contraseña + conectar */}
      {selected && (
        <div className="space-y-3 p-4 rounded-xl border"
          style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}>
          <p className="text-xs font-medium opacity-60">
            Red seleccionada: <span className="font-mono" style={{ color: "var(--color-primary)" }}>{selected}</span>
          </p>
          <div>
            <label className="block text-xs font-medium mb-1.5 opacity-60">Contraseña WiFi</label>
            <div className="relative">
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3 py-2 rounded-lg text-sm pr-10"
                style={inputSt}
              />
              <button type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70">
                {showPass ? <FiEyeOff size={14}/> : <FiEye size={14}/>}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={handleConnect} disabled={saving || !password}
              className="flex items-center gap-2 px-5 py-2 rounded-xl font-semibold text-sm text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--color-primary)" }}>
              {saving
                ? <><div className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"/> Conectando…</>
                : <><FiWifi size={13}/> Conectar a {selected}</>}
            </button>
            <button onClick={() => { setSelected(""); setPassword(""); }}
              className="text-xs opacity-40 hover:opacity-70 px-2">
              Cancelar
            </button>
          </div>
          <ResultBanner result={result} />
        </div>
      )}

      {!selected && <ResultBanner result={result} />}
    </div>
  );
}

/* ══════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════ */
export default function NetworkConfig() {
  const user       = getUser();
  const isSuperadmin = user?.rol === "superadmin";

  const [activeTab, setActiveTab] = useState("eth0");
  const [loading,   setLoading]   = useState(true);

  // Config editable
  const [eth0Cfg,  setEth0Cfg]  = useState({ mode: "dhcp", ip: "", mask: "24", gateway: "", dns: "8.8.8.8" });
  const [wlan0Cfg, setWlan0Cfg] = useState({ mode: "dhcp", ip: "", mask: "24", gateway: "", dns: "8.8.8.8" });

  // Estado en vivo (de la Pi)
  const [eth0Status,  setEth0Status]  = useState(null);
  const [wlan0Status, setWlan0Status] = useState(null);

  // Feedback de guardado
  const [savingEth0,  setSavingEth0]  = useState(false);
  const [savingWlan0, setSavingWlan0] = useState(false);
  const [resultEth0,  setResultEth0]  = useState(null);
  const [resultWlan0, setResultWlan0] = useState(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/network/rpi_config`, { headers: authHeader() });
      const data = await res.json();

      if (data.eth0) {
        setEth0Status(data.eth0);
        setEth0Cfg({
          mode:    data.eth0.mode    || "dhcp",
          ip:      data.eth0.ip      || data.eth0.ip_live || "",
          mask:    data.eth0.mask    || data.eth0.mask_live || "24",
          gateway: data.eth0.gateway || "",
          dns:     data.eth0.dns     || "8.8.8.8",
        });
      }
      if (data.wlan0) {
        setWlan0Status(data.wlan0);
        setWlan0Cfg({
          mode:    data.wlan0.mode    || "dhcp",
          ip:      data.wlan0.ip      || data.wlan0.ip_live || "",
          mask:    data.wlan0.mask    || data.wlan0.mask_live || "24",
          gateway: data.wlan0.gateway || "",
          dns:     data.wlan0.dns     || "8.8.8.8",
        });
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveIface = async (iface, cfg, setSaving, setResult) => {
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`${BACKEND}/network/rpi_config`, {
        method: "POST",
        headers: { ...authHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ iface, ...cfg }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error al guardar");
      setResult({ ok: true, message: data.message });
    } catch (e) {
      setResult({ ok: false, message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "eth0",  label: "Ethernet",  icon: <FiServer size={14}/> },
    ...(isSuperadmin ? [{ id: "wlan0", label: "WiFi", icon: <FiWifi size={14}/> }] : []),
  ];

  return (
    <div className="space-y-5 pb-6">

      {/* HEADER */}
      <div className="flex items-center gap-2.5">
        <LiveDot />
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
          Configuración de Red
        </h1>
        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-t-2 ml-1"
            style={{ borderColor: "var(--color-primary)" }} />
        )}
        <button onClick={fetchConfig} title="Actualizar"
          className="ml-auto opacity-40 hover:opacity-80 transition">
          <FiRefreshCcw size={15}/>
        </button>
      </div>

      {/* INFO DISPOSITIVO */}
      <div className="rounded-2xl border p-4"
        style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, transparent)" }}>
            <FiServer size={18} style={{ color: "var(--color-primary)" }}/>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Gateway IoT — Raspberry Pi</p>
            <p className="text-xs opacity-40 mt-0.5">
              {isSuperadmin ? "Acceso superadmin · Ethernet + WiFi" : "Acceso admin · Ethernet"}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 items-end shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono opacity-40">eth0</span>
              <StatusBadge connected={eth0Status?.connected} label={eth0Status?.connected ? "Conectado" : "Sin cable"} />
              {eth0Status?.ip_live && (
                <span className="text-[11px] font-mono opacity-50">{eth0Status.ip_live}</span>
              )}
            </div>
            {isSuperadmin && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono opacity-40">wlan0</span>
                <StatusBadge connected={wlan0Status?.connected}
                  label={wlan0Status?.ssid_connected || (wlan0Status?.connected ? "Conectado" : "Desconectado")} />
                {wlan0Status?.ip_live && (
                  <span className="text-[11px] font-mono opacity-50">{wlan0Status.ip_live}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TABS */}
      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 rounded-xl"
          style={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className="flex items-center gap-2 flex-1 justify-center px-4 py-2 rounded-lg text-sm font-medium transition"
              style={{
                backgroundColor: activeTab === t.id ? "var(--color-primary)" : "transparent",
                color: activeTab === t.id ? "#fff" : "var(--color-text)",
              }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── TAB ETHERNET ── */}
      {activeTab === "eth0" && (
        <div className="rounded-2xl border" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
          <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--color-border)" }}>
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">
              Ethernet — <span className="font-mono">eth0</span>
            </h2>
            {eth0Status?.ip_live && (
              <p className="text-xs opacity-40 mt-0.5 font-mono">
                IP actual: {eth0Status.ip_live}/{eth0Status.mask_live}
              </p>
            )}
          </div>
          <div className="p-5">
            <IpPanel
              iface="eth0"
              cfg={eth0Cfg}
              onChange={setEth0Cfg}
              saving={savingEth0}
              result={resultEth0}
              onSave={() => saveIface("eth0", eth0Cfg, setSavingEth0, setResultEth0)}
            />
          </div>
        </div>
      )}

      {/* ── TAB WIFI (superadmin) ── */}
      {activeTab === "wlan0" && isSuperadmin && (
        <>
          {/* IP de wlan0 */}
          <div className="rounded-2xl border" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
            <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--color-border)" }}>
              <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">
                WiFi — <span className="font-mono">wlan0</span> · Asignación IP
              </h2>
              {wlan0Status?.ip_live && (
                <p className="text-xs opacity-40 mt-0.5 font-mono">
                  IP actual: {wlan0Status.ip_live}/{wlan0Status.mask_live}
                </p>
              )}
            </div>
            <div className="p-5">
              <IpPanel
                iface="wlan0"
                cfg={wlan0Cfg}
                onChange={setWlan0Cfg}
                saving={savingWlan0}
                result={resultWlan0}
                onSave={() => saveIface("wlan0", wlan0Cfg, setSavingWlan0, setResultWlan0)}
              />
            </div>
          </div>

          {/* Red WiFi (SSID) */}
          <div className="rounded-2xl border" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
            <div className="px-5 py-3.5 border-b" style={{ borderColor: "var(--color-border)" }}>
              <div className="flex items-center gap-2">
                <FiWifi size={14} style={{ color: "var(--color-primary)" }}/>
                <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Red WiFi</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                  style={{
                    backgroundColor: "color-mix(in srgb, #8b5cf6 15%, transparent)",
                    color: "#a78bfa",
                  }}>
                  Superadmin
                </span>
              </div>
              <p className="text-xs opacity-40 mt-0.5">Cambia la red WiFi a la que se conecta el Gateway IoT</p>
            </div>
            <div className="p-5">
              <WifiSsidPanel wlanStatus={wlan0Status} />
            </div>
          </div>
        </>
      )}

      {/* AVISO */}
      <div className="rounded-2xl border p-4 text-xs space-y-1"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-primary) 6%, var(--color-card))",
          borderColor: "color-mix(in srgb, var(--color-primary) 20%, transparent)",
          color: "var(--text-color-muted, #9ca3af)",
        }}>
        <p className="font-semibold" style={{ color: "var(--color-primary)", opacity: 0.8 }}>Aviso importante</p>
        <p>Los cambios se aplican via <span className="font-mono">dhcpcd</span>. Si cambias la IP activa perderás
          temporalmente la conexión — reconéctate usando la nueva IP.</p>
        {isSuperadmin && (
          <p>Al cambiar la red WiFi el dispositivo intentará conectarse en unos segundos.
            Si la contraseña es incorrecta seguirá usando la red anterior.</p>
        )}
      </div>
    </div>
  );
}
