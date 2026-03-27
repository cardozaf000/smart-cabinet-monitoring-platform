import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { saveSession } from "../utils/auth";
import {
  FiUser, FiLock, FiEye, FiEyeOff, FiActivity,
  FiCpu, FiBell, FiShield, FiServer, FiGrid,
  FiSun, FiMoon,
} from "react-icons/fi";
import { BACKEND, resolveLogoUrl } from "../utils/api";
import { useTheme } from "../theme/ThemeProvider";

// ============================================================
// Features del panel izquierdo
// ============================================================
const FEATURES = [
  { Icon: FiCpu,    text: "Monitoreo en tiempo real de sensores ambientales" },
  { Icon: FiBell,   text: "Alertas automáticas y notificaciones por correo"  },
  { Icon: FiGrid,   text: "Control visual de gabinetes y rack 3D interactivo" },
  { Icon: FiServer, text: "Integración con MQTT, HTTP y SNMP"                },
  { Icon: FiShield, text: "Gestión de usuarios con roles y permisos"          },
];

// ============================================================
// LoginPage
// ============================================================
export default function LoginPage({ onLogin }) {
  const navigate = useNavigate();
  const { themeMode, toggleThemeMode, theme } = useTheme();

  const [username,    setUsername]    = useState("");
  const [password,    setPassword]    = useState("");
  const [showPwd,     setShowPwd]     = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [branding,    setBranding]    = useState({ login_logo: "", app_name: "" });

  // Cargar branding
  useEffect(() => {
    fetch(`${BACKEND}/branding`)
      .then((r) => r.json())
      .then((d) => setBranding((prev) => ({ ...prev, ...d })))
      .catch(() => {});
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError("");
    setLoading(true);
    try {
      const res  = await fetch(`${BACKEND}/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (res.ok) {
        saveSession(data.token, data.user);
        if (onLogin) onLogin(data.user);
        navigate("/");
      } else {
        setError(data.error || "Credenciales incorrectas.");
      }
    } catch {
      setError("No se pudo conectar con el servidor. Verifica tu red.");
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: "100%",
    backgroundColor: "var(--color-bg)",
    color:           "var(--color-text)",
    border:          "1px solid var(--color-border)",
    borderRadius:    8,
    padding:         "10px 12px 10px 38px",
    fontSize:        14,
    outline:         "none",
    transition:      "border-color 0.2s",
  };

  return (
    <div
      className="min-h-screen relative flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}
    >
      {/* ── Orbes decorativos que respetan el tema ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div style={{
          position: "absolute", top: "-10%", right: "-8%",
          width: 560, height: 560, borderRadius: "50%",
          background: "var(--color-primary)", opacity: 0.07, filter: "blur(90px)",
        }} />
        <div style={{
          position: "absolute", bottom: "-12%", left: "-6%",
          width: 460, height: 460, borderRadius: "50%",
          background: "var(--color-accent)", opacity: 0.06, filter: "blur(80px)",
        }} />
        <div style={{
          position: "absolute", top: "40%", left: "35%",
          width: 300, height: 300, borderRadius: "50%",
          background: "var(--color-primary)", opacity: 0.035, filter: "blur(60px)",
        }} />
      </div>

      {/* ── Botón modo claro/oscuro ── */}
      <button
        onClick={toggleThemeMode}
        className="fixed top-4 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full border transition-colors"
        style={{
          backgroundColor: "var(--color-card)",
          borderColor:     "var(--color-border)",
          color:           "var(--color-text-muted, #9ca3af)",
        }}
        title={themeMode === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      >
        {themeMode === "dark" ? <FiSun size={15} /> : <FiMoon size={15} />}
      </button>

      {/* ── Layout principal ── */}
      <div className="relative z-10 w-full max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-10 px-5 py-10 items-center">

        {/* ════════════════════════════════════════
            Panel izquierdo — información
        ════════════════════════════════════════ */}
        <div className="hidden md:flex flex-col justify-center pr-6">
          {/* Logo branding */}
          {branding.login_logo ? (
            <img
              src={resolveLogoUrl(branding.login_logo)}
              alt="Logo"
              className="h-14 object-contain mb-8 self-start"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-8"
              style={{
                backgroundColor: "color-mix(in srgb, var(--color-primary) 15%, transparent)",
                border:          "1px solid color-mix(in srgb, var(--color-primary) 25%, transparent)",
              }}
            >
              <FiActivity size={24} style={{ color: "var(--color-primary)" }} />
            </div>
          )}

          {/* Título */}
          <h1 className="text-3xl font-bold leading-tight mb-3">
            <span style={{ color: "var(--color-text)" }}>
              {branding.app_name || "Sistema de Monitoreo Inteligente"}
            </span>
          </h1>

          {/* Línea decorativa */}
          <div
            className="h-0.5 w-12 rounded-full mb-5"
            style={{ backgroundColor: "var(--color-primary)" }}
          />

          <p className="text-sm leading-relaxed mb-8" style={{ color: "var(--color-text-muted, #9ca3af)" }}>
            Plataforma integrada para supervisión de variables ambientales en centros de datos.
            Detección temprana de incidentes y control centralizado de sensores y dispositivos IoT.
          </p>

          {/* Features */}
          <div className="space-y-3">
            {FEATURES.map(({ Icon, text }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--color-primary) 14%, transparent)",
                    color:           "var(--color-primary)",
                  }}
                >
                  <Icon size={13} />
                </div>
                <span className="text-sm leading-snug" style={{ color: "var(--color-text-muted, #9ca3af)" }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ════════════════════════════════════════
            Panel derecho — formulario
        ════════════════════════════════════════ */}
        <div
          className="rounded-2xl p-8 shadow-2xl"
          style={{
            backgroundColor: "var(--color-card)",
            border:          "1px solid var(--color-border)",
            boxShadow:       `0 24px 64px color-mix(in srgb, var(--color-primary) 12%, rgba(0,0,0,0.35))`,
          }}
        >
          {/* Header del formulario */}
          <div className="mb-7">
            {/* Logo en móvil */}
            <div className="flex md:hidden mb-5">
              {branding.login_logo ? (
                <img src={branding.login_logo} alt="Logo" className="h-10 object-contain"
                  onError={(e) => { e.currentTarget.style.display = "none"; }} />
              ) : (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 15%, transparent)" }}>
                  <FiActivity size={18} style={{ color: "var(--color-primary)" }} />
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold" style={{ color: "var(--color-text)" }}>
              Bienvenido
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--color-text-muted, #9ca3af)" }}>
              Ingresa tus credenciales para continuar
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg text-sm mb-5"
              style={{
                backgroundColor: "color-mix(in srgb, #ef4444 12%, transparent)",
                border:          "1px solid color-mix(in srgb, #ef4444 35%, transparent)",
                color:           "#f87171",
              }}
            >
              <span className="shrink-0 mt-0.5">⚠</span>
              {error}
            </div>
          )}

          {/* Formulario */}
          <form onSubmit={handleLogin} className="space-y-4">
            {/* Usuario */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-text-muted, #9ca3af)" }}>
                Usuario
              </label>
              <div className="relative">
                <FiUser
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--color-text-muted, #9ca3af)" }}
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nombre de usuario"
                  autoComplete="username"
                  autoFocus
                  required
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                />
              </div>
            </div>

            {/* Contraseña */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-text-muted, #9ca3af)" }}>
                Contraseña
              </label>
              <div className="relative">
                <FiLock
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--color-text-muted, #9ca3af)" }}
                />
                <input
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  style={{ ...inputStyle, paddingRight: 40 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--color-primary)"; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--color-text-muted, #9ca3af)" }}
                  tabIndex={-1}
                >
                  {showPwd ? <FiEyeOff size={15} /> : <FiEye size={15} />}
                </button>
              </div>
            </div>

            {/* Botón submit */}
            <button
              type="submit"
              disabled={loading || !username.trim() || !password}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white transition-all mt-2 relative overflow-hidden disabled:opacity-60"
              style={{
                background:  loading
                  ? "var(--color-primary)"
                  : `linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 70%, var(--color-accent)))`,
                boxShadow:   loading ? "none" : "0 4px 16px color-mix(in srgb, var(--color-primary) 40%, transparent)",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Verificando…
                </span>
              ) : (
                "Iniciar sesión"
              )}
            </button>
          </form>

          {/* Footer del card */}
          <div
            className="mt-7 pt-5 text-center space-y-1"
            style={{ borderTop: "1px solid var(--color-border)" }}
          >
            <p className="text-[11px]" style={{ color: "var(--color-text-muted, #6b7280)" }}>
              API:{" "}
              <span className="font-mono" style={{ color: "var(--color-primary)" }}>
                {BACKEND}
              </span>
            </p>
            <p className="text-[11px]" style={{ color: "var(--color-text-muted, #6b7280)" }}>
              © {new Date().getFullYear()} Sistema de Monitoreo — Proyecto de Tesis
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
