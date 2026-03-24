import React, { useState, useEffect, useRef } from "react";
import { useTheme } from "../theme/ThemeProvider";
import { themes as builtinThemes } from "../theme/themes";
import {
  FiUpload, FiImage, FiCheck, FiX, FiMonitor, FiSliders,
  FiSun, FiMoon, FiTrash2, FiPlus, FiChevronDown, FiChevronRight,
  FiRefreshCcw,
} from "react-icons/fi";
import { BACKEND } from "../utils/api";
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
// ThemeCard
// ============================================================
function ThemeCard({ t, isActive, onApply, onDelete, deleteConfirm, onAskDelete, onCancelDelete }) {
  const isBuiltin = Object.keys(builtinThemes).includes(t.key);

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
            src={t.logo}
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

        {!isBuiltin && (
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
      const url = data.url.startsWith("http") ? data.url : `${BACKEND}${data.url}`;
      onChange(url);
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
          <img src={value} alt="logo preview" className="max-h-16 max-w-full object-contain" />
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
        accept="image/png,image/jpeg,image/jpg"
        onChange={handleFile}
        className="hidden"
      />

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
    await fetch(`${BACKEND}/themes/${key}`, { method: "DELETE" });
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
        logo = data.url.startsWith("http") ? data.url : `${BACKEND}${data.url}`;
      }

      await fetch(`${BACKEND}/themes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
                          accept="image/png,image/jpeg,image/jpg"
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
    </div>
  );
}
