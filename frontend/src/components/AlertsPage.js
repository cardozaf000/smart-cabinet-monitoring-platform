import React, { useEffect, useState } from 'react';
import ProfileModal    from './alerts/ProfileModal';
import RuleModal       from './alerts/RuleModal';
import TestEmailModal  from './alerts/TestEmailModal';
import { FiPlus, FiEdit2, FiTrash2, FiRefreshCcw, FiCheckCircle, FiAlertCircle, FiMail, FiAlertTriangle, FiCpu } from 'react-icons/fi';
import { BACKEND } from '../utils/api';

/* ---- LiveDot ---- */
function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: '#10b981' }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#10b981' }} />
    </span>
  );
}

/* ---- Severity badge ---- */
const SEVERITY_STYLE = {
  CRITICAL: { bg: '#ef444422', text: '#f87171', border: '#ef444440' },
  HIGH:     { bg: '#f9731622', text: '#fb923c', border: '#f9731640' },
  WARNING:  { bg: '#f59e0b22', text: '#fbbf24', border: '#f59e0b40' },
  INFO:     { bg: '#3b82f622', text: '#60a5fa', border: '#3b82f640' },
};

function SeverityBadge({ severity }) {
  const s = (severity || 'INFO').toUpperCase();
  const st = SEVERITY_STYLE[s] || SEVERITY_STYLE.INFO;
  return (
    <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
      style={{ backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}` }}>
      {s}
    </span>
  );
}

/* ---- TLS badge ---- */
function TlsBadge({ mode }) {
  const m = (mode || '').toUpperCase();
  const secured = m === 'TLS' || m === 'STARTTLS';
  return (
    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{
        backgroundColor: secured ? 'color-mix(in srgb,#10b981 15%,transparent)' : 'color-mix(in srgb,#6b7280 15%,transparent)',
        color: secured ? '#10b981' : '#9ca3af',
      }}>
      {m || 'NONE'}
    </span>
  );
}

/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */

/* ---- Parsear features_json de forma segura ---- */
function parseFeatures(raw) {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return {}; }
}

/* ---- ML anomalias recientes — banner mejorado ---- */
function MLAnomaliasBanner({ onNavigate }) {
  const [items,  setItems]  = useState([]);
  const [mlLoad, setMlLoad] = useState(false);

  useEffect(() => {
    setMlLoad(true);
    fetch(`${BACKEND}/api/anomalias?solo_anomalias=true&limit=5`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setMlLoad(false));
  }, []);

  if (mlLoad) return null;
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border" style={{ backgroundColor: 'var(--color-card)', borderColor: '#ef444440' }}>

      {/* Cabecera del banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b"
        style={{ borderColor: '#ef444430' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: '#ef444422', color: '#f87171' }}>
            <FiCpu size={14} />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase" style={{ color: '#f87171' }}>
              Anomalías ML sin revisar
            </h2>
            <p className="text-xs opacity-40 mt-0.5">
              {items.length} detección(es) reciente(s) · Isolation Forest
            </p>
          </div>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate('ml')}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition hover:opacity-80"
            style={{ backgroundColor: '#ef444420', color: '#f87171', border: '1px solid #ef444440' }}>
            Ver Detección ML →
          </button>
        )}
      </div>

      {/* Lista de anomalías con desglose de sensores */}
      <div className="divide-y" style={{ borderColor: '#ef444415' }}>
        {items.map(a => {
          const features = parseFeatures(a.features_json);
          const score    = Number(a.score_anomalia ?? 0);

          // Sensores con valor disponible para mostrar
          const sensorPills = [
            features.temperatura != null && { label: `${Number(features.temperatura).toFixed(1)} °C`, key: 'temp' },
            features.humedad     != null && { label: `${Number(features.humedad).toFixed(0)} %`,    key: 'hum'  },
            features.humo        != null && { label: `${Number(features.humo).toFixed(0)} ppm`,     key: 'humo' },
            features.luz         != null && { label: `${Number(features.luz).toFixed(0)} lux`,      key: 'luz'  },
            features.movimiento  != null && features.movimiento && { label: 'Movimiento',            key: 'pir'  },
            features.reed        != null && features.reed && { label: 'Puerta abierta',              key: 'reed' },
            features.mpu6050     != null && features.mpu6050 && { label: 'IMU anómalo',              key: 'mpu'  },
          ].filter(Boolean);

          return (
            <div key={a.id} className="px-5 py-3 flex flex-wrap items-center gap-3">

              {/* Icono + timestamp */}
              <div className="flex items-center gap-2 shrink-0">
                <FiAlertTriangle size={14} style={{ color: '#f87171' }} />
                <span className="text-xs font-mono opacity-50">{a.timestamp}</span>
              </div>

              {/* Score */}
              <span className="text-xs font-semibold font-mono px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: '#ef444422', color: '#f87171', border: '1px solid #ef444430' }}>
                score: {score.toFixed(4)}
              </span>

              {/* Pills de sensores */}
              <div className="flex flex-wrap gap-1.5">
                {sensorPills.map(p => (
                  <span key={p.key}
                    className="text-[11px] font-mono px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'color-mix(in srgb,var(--color-primary) 12%,transparent)',
                             color: 'var(--color-primary)', border: '1px solid color-mix(in srgb,var(--color-primary) 25%,transparent)' }}>
                    {p.label}
                  </span>
                ))}
              </div>

              {/* Badge sin revisar */}
              {!a.revisado && (
                <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: '#f59e0b22', color: '#fbbf24', border: '1px solid #f59e0b40' }}>
                  Sin revisar
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer con instrucción */}
      <div className="px-5 py-3 border-t flex items-center gap-2"
        style={{ borderColor: '#ef444420' }}>
        <FiAlertTriangle size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />
        <p className="text-[11px] opacity-40">
          Revisa estos eventos en <strong className="opacity-70">Detección ML</strong> para confirmarlos
          o descartarlos y retroalimentar el modelo.
        </p>
      </div>
    </div>
  );
}

export default function AlertsPage({ onNavigate }) {
  const [profiles,  setProfiles]  = useState([]);
  const [rules,     setRules]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState('');

  const [openProfile,    setOpenProfile]    = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);

  const [openRule,    setOpenRule]    = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const [testModalOpen,  setTestModalOpen]  = useState(false);
  const [profileToTest,  setProfileToTest]  = useState(null);

  const token = localStorage.getItem('auth_token');

  /* ---- Carga de datos ---- */
  const load = async () => {
    try {
      setLoading(true);
      setErr('');
      const [pRes, rRes] = await Promise.all([
        fetch(`${BACKEND}/alerts/email_profiles`),
        fetch(`${BACKEND}/alerts/rules`),
      ]);
      if (!pRes.ok) throw new Error('No se pudieron cargar los perfiles SMTP');
      if (!rRes.ok) throw new Error('No se pudieron cargar las reglas');
      const [pJson, rJson] = await Promise.all([pRes.json(), rRes.json()]);
      setProfiles(Array.isArray(pJson) ? pJson : []);
      setRules(Array.isArray(rJson) ? rJson : []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  /* ---- Handlers perfiles ---- */
  const handleNewProfile    = () => { setEditingProfile(null); setOpenProfile(true); };
  const handleEditProfile   = (p) => { setEditingProfile(p); setOpenProfile(true); };
  const handleTestProfile   = (p) => { setProfileToTest(p); setTestModalOpen(true); };
  const handleDeleteProfile = async (id) => {
    if (!window.confirm('¿Eliminar este perfil SMTP?')) return;
    try {
      const res = await fetch(`${BACKEND}/alerts/email_profiles/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const js  = await res.json();
      if (!res.ok || js.error) throw new Error(js.error || 'No se pudo eliminar');
      load();
    } catch (e) { alert('Error: ' + e.message); }
  };

  /* ---- Handlers reglas ---- */
  const handleNewRule    = () => { setEditingRule(null); setOpenRule(true); };
  const handleEditRule   = (r) => { setEditingRule(r); setOpenRule(true); };
  const handleDeleteRule = async (id) => {
    if (!window.confirm('¿Eliminar esta regla de alerta?')) return;
    try {
      const res = await fetch(`${BACKEND}/alerts/rules/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const js  = await res.json();
      if (!res.ok || js.error) throw new Error(js.error || 'No se pudo eliminar');
      load();
    } catch (e) { alert('Error: ' + e.message); }
  };

  /* ---- Helpers ---- */
  const getProfileName = (rule) => {
    try {
      const ch  = JSON.parse(rule.channels_json || '{}');
      const pid = ch?.email?.profile_id;
      return profiles.find(p => p.id === pid)?.name || (pid ? `ID ${pid}` : '—');
    } catch { return '—'; }
  };

  const getRecipients = (rule) => {
    try {
      const ch = JSON.parse(rule.channels_json || '{}');
      return (ch?.email?.to || []).join(', ') || '—';
    } catch { return '—'; }
  };

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="space-y-5 pb-6">

      {/* BANNER ML — solo aparece si hay anomalías recientes sin revisar */}
      <MLAnomaliasBanner onNavigate={onNavigate} />

      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <LiveDot />
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
            Alertas
          </h1>
          {loading && <div className="animate-spin rounded-full h-4 w-4 border-t-2 ml-1" style={{ borderColor: 'var(--color-primary)' }} />}
          {!loading && (
            <div className="flex items-center gap-1.5 ml-1">
              {rules.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'color-mix(in srgb,var(--color-primary) 15%,transparent)', color: 'var(--color-primary)' }}>
                  {rules.length} regla{rules.length !== 1 ? 's' : ''}
                </span>
              )}
              {profiles.length > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'color-mix(in srgb,#10b981 15%,transparent)', color: '#10b981' }}>
                  {profiles.length} perfil{profiles.length !== 1 ? 'es' : ''} SMTP
                </span>
              )}
            </div>
          )}
        </div>

        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg border hover:opacity-80 transition disabled:opacity-40"
          style={{ borderColor: 'var(--color-border)' }} title="Recargar">
          <FiRefreshCcw size={14} />
        </button>
      </div>

      {/* Error global */}
      {err && (
        <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
          style={{ backgroundColor: 'color-mix(in srgb,#ef4444 12%,transparent)', border: '1px solid #ef444430', color: '#f87171' }}>
          <FiAlertCircle size={14} />
          {err}
        </div>
      )}

      {/* ================================================
          SECCIÓN: Perfiles SMTP
      ================================================ */}
      <div className="rounded-2xl border" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Perfiles SMTP</h2>
            <p className="text-xs mt-0.5 opacity-40">{profiles.length} perfil(es) · correo de notificación</p>
          </div>
          <button onClick={handleNewProfile}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            <FiPlus size={13} /> Nuevo perfil
          </button>
        </div>

        {/* Grid de cards de perfiles */}
        <div className="p-4">
          {profiles.length === 0 ? (
            <p className="text-center py-8 text-sm opacity-30">
              Sin perfiles SMTP. Crea uno con "Nuevo perfil".
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {profiles.map(p => (
                <div key={p.id} className="rounded-xl border p-4 space-y-3"
                  style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}>
                  {/* Cabecera card */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ backgroundColor: 'color-mix(in srgb,var(--color-primary) 12%,transparent)', color: 'var(--color-primary)' }}>
                        <FiMail size={13} />
                      </div>
                      <p className="text-sm font-semibold truncate">{p.name}</p>
                    </div>
                    <TlsBadge mode={p.tls_mode} />
                  </div>

                  {/* Info */}
                  <div className="space-y-1">
                    <p className="text-xs opacity-40 font-mono truncate">{p.host}:{p.port}</p>
                    {p.username && <p className="text-xs opacity-50 truncate">{p.username}</p>}
                  </div>

                  {/* Acciones */}
                  <div className="flex items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--color-border)' }}>
                    <button onClick={() => handleTestProfile(p)}
                      className="flex-1 py-1.5 text-xs rounded-lg font-medium text-white hover:opacity-90 transition"
                      style={{ backgroundColor: 'var(--color-primary)' }}>
                      Probar
                    </button>
                    <button onClick={() => handleEditProfile(p)}
                      className="p-1.5 rounded-lg border opacity-50 hover:opacity-100 transition"
                      style={{ borderColor: 'var(--color-border)' }} title="Editar">
                      <FiEdit2 size={13} />
                    </button>
                    <button onClick={() => handleDeleteProfile(p.id)}
                      className="p-1.5 rounded-lg border opacity-40 hover:opacity-100 hover:text-red-400 hover:border-red-400/40 transition"
                      style={{ borderColor: 'var(--color-border)' }} title="Eliminar">
                      <FiTrash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ================================================
          SECCIÓN: Reglas de alerta
      ================================================ */}
      <div className="rounded-2xl border" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Reglas de alerta</h2>
            <p className="text-xs mt-0.5 opacity-40">{rules.length} regla(s) activa(s)</p>
          </div>
          <button onClick={handleNewRule}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            <FiPlus size={13} /> Nueva regla
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full" style={{ color: 'var(--color-text)' }}>
            <thead>
              <tr className="text-xs tracking-wider uppercase" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Nombre / Alcance</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Métrica</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Condición</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Gravedad</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Perfil</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Destinatarios</th>
                <th className="py-2.5 px-4 text-center font-semibold opacity-55">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-sm opacity-30">
                    Sin reglas. Crea una con "Nueva regla".
                  </td>
                </tr>
              )}
              {rules.map((r, i) => (
                <tr key={r.id}
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    backgroundColor: i % 2 !== 0
                      ? 'color-mix(in srgb,var(--color-bg) 30%,transparent)'
                      : 'transparent',
                  }}
                  className="hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)] transition-colors">

                  {/* Nombre + alcance */}
                  <td className="py-3 px-4">
                    <p className="text-sm font-medium">{r.name}</p>
                    <p className="text-xs mt-0.5 opacity-40 font-mono">{r.scope} → {r.selector}</p>
                  </td>

                  {/* Métrica */}
                  <td className="py-3 px-4">
                    <span className="text-xs font-mono font-medium">{r.metric}</span>
                  </td>

                  {/* Condición */}
                  <td className="py-3 px-4">
                    <span className="font-mono text-xs px-2 py-0.5 rounded"
                      style={{ backgroundColor: 'color-mix(in srgb,var(--color-primary) 10%,transparent)', color: 'var(--color-primary)' }}>
                      {r.op} {r.threshold}
                    </span>
                  </td>

                  {/* Gravedad */}
                  <td className="py-3 px-4">
                    <SeverityBadge severity={r.severity} />
                  </td>

                  {/* Perfil */}
                  <td className="py-3 px-4 text-xs opacity-60">{getProfileName(r)}</td>

                  {/* Destinatarios */}
                  <td className="py-3 px-4 max-w-[160px]">
                    <p className="text-xs opacity-50 truncate">{getRecipients(r)}</p>
                  </td>

                  {/* Acciones */}
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => handleEditRule(r)}
                        className="p-1.5 rounded-lg border opacity-50 hover:opacity-100 transition"
                        style={{ borderColor: 'var(--color-border)' }} title="Editar">
                        <FiEdit2 size={13} />
                      </button>
                      <button onClick={() => handleDeleteRule(r.id)}
                        className="p-1.5 rounded-lg border opacity-40 hover:opacity-100 hover:text-red-400 hover:border-red-400/40 transition"
                        style={{ borderColor: 'var(--color-border)' }} title="Eliminar">
                        <FiTrash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modales (sin cambios de lógica) */}
      <ProfileModal
        open={openProfile}
        onClose={() => { setOpenProfile(false); setEditingProfile(null); }}
        onCreated={load}
        initialData={editingProfile}
      />
      <RuleModal
        open={openRule}
        onClose={() => { setOpenRule(false); setEditingRule(null); }}
        onCreated={load}
        profiles={profiles}
        initialData={editingRule}
      />
      <TestEmailModal
        isOpen={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        smtpProfile={profileToTest}
        token={token}
      />
    </div>
  );
}
