import React, { useEffect, useState } from 'react';
import { FiSend, FiEdit, FiX, FiMail, FiCheck } from 'react-icons/fi';
import { BACKEND } from '../../utils/api';
import Portal from '../Portal';

// Presets de proveedor — host/puerto/TLS se aplican internamente
const PROVIDERS = {
  google: {
    label: 'Google (Gmail)',
    host: 'smtp.gmail.com',
    port: 587,
    tls_mode: 'starttls',
    hint: 'Usa una App Password de Google. No admite la contraseña normal de la cuenta.',
  },
  microsoft: {
    label: 'Microsoft (Outlook / Hotmail)',
    host: 'smtp.office365.com',
    port: 587,
    tls_mode: 'starttls',
    hint: 'Usa tu cuenta de Microsoft 365 u Outlook.com con la contraseña normal.',
  },
  custom: {
    label: 'Personalizado',
    host: '',
    port: 587,
    tls_mode: 'starttls',
    hint: 'Introduce manualmente el servidor SMTP.',
  },
};

function getEmptyProfile() {
  return { name: '', provider: 'google', username: '', password: '', custom_host: '' };
}

function detectProvider(profile) {
  if (!profile) return 'google';
  if (profile.host === 'smtp.gmail.com') return 'google';
  if (profile.host === 'smtp.office365.com') return 'microsoft';
  return 'custom';
}

export default function ProfileModal({ open, onClose, onCreated, initialData = null }) {
  const [form, setForm] = useState(getEmptyProfile());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      if (initialData) {
        const provider = detectProvider(initialData);
        setForm({
          name: initialData.name || '',
          provider,
          username: initialData.username || '',
          password: '',           // nunca pre-rellenar contraseña
          custom_host: provider === 'custom' ? (initialData.host || '') : '',
        });
      } else {
        setForm(getEmptyProfile());
      }
      setErr('');
      setSaving(false);
    }
  }, [open, initialData]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');

    if (!form.name.trim()) { setErr('Ingresa un nombre para el perfil.'); return; }
    if (!form.username.trim()) { setErr('Ingresa el correo electrónico / usuario SMTP.'); return; }
    if (form.provider === 'custom' && !form.custom_host.trim()) {
      setErr('Ingresa el host SMTP para el proveedor personalizado.'); return;
    }
    if (!initialData && !form.password) {
      setErr('Ingresa la contraseña o App Password.'); return;
    }

    const preset = PROVIDERS[form.provider] || PROVIDERS.custom;
    const payload = {
      name: form.name.trim(),
      host: form.provider === 'custom' ? form.custom_host.trim() : preset.host,
      port: preset.port,
      tls_mode: preset.tls_mode,
      username: form.username.trim(),
      from_email: form.username.trim(),
      from_name: form.name.trim(),
    };
    // Solo incluir password si se ingresó algo (no sobreescribir con vacío al editar)
    if (form.password) payload.password = form.password;

    try {
      setSaving(true);
      const method = initialData?.id ? 'PUT' : 'POST';
      const url = initialData?.id
        ? `${BACKEND}/alerts/email_profiles/${initialData.id}`
        : `${BACKEND}/alerts/email_profiles`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const js = await res.json();
      if (!res.ok || js.error) throw new Error(js.error || 'No se pudo guardar el perfil');
      onCreated?.();
      onClose?.();
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const preset = PROVIDERS[form.provider] || PROVIDERS.custom;

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50">
      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border p-6 shadow-2xl"
        style={{
          backgroundColor: 'var(--color-card)',
          color: 'var(--color-text)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Encabezado */}
        <div
          className="flex items-center justify-between border-b pb-4 mb-5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <h4 className="text-lg font-semibold flex items-center gap-2 text-[var(--color-primary)]">
            {initialData ? <><FiEdit /> Editar perfil SMTP</> : <><FiMail /> Nuevo perfil SMTP</>}
          </h4>
          <button onClick={onClose} className="text-xl hover:text-red-400">
            <FiX />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {err && (
            <div className="bg-red-900/30 border border-red-600 text-red-200 p-3 rounded text-sm">
              {err}
            </div>
          )}

          {/* Nombre del perfil */}
          <div>
            <label className="block text-sm mb-1 font-medium">Nombre del perfil</label>
            <input
              required
              value={form.name}
              onChange={e => set('name', e.target.value)}
              className="w-full px-4 py-2 rounded-md"
              style={inputStyle}
              placeholder="Ej. Alertas Datacenter"
            />
          </div>

          {/* Selector de proveedor */}
          <div>
            <label className="block text-sm mb-2 font-medium">Proveedor de correo</label>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(PROVIDERS).map(([key, p]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set('provider', key)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all border"
                  style={{
                    backgroundColor: form.provider === key ? 'var(--color-primary)' : 'transparent',
                    color: form.provider === key ? '#fff' : 'var(--color-text)',
                    borderColor: form.provider === key ? 'var(--color-primary)' : 'var(--color-border)',
                  }}
                >
                  {form.provider === key && <FiCheck size={12} />}
                  {p.label}
                </button>
              ))}
            </div>

            {/* Info del servidor (solo lectura si no es custom) */}
            {form.provider !== 'custom' ? (
              <p
                className="mt-1.5 text-xs px-3 py-1.5 rounded"
                style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-muted,#aaa)' }}
              >
                {preset.host} · Puerto {preset.port} · {preset.tls_mode.toUpperCase()}
              </p>
            ) : (
              <div className="mt-2">
                <input
                  value={form.custom_host}
                  onChange={e => set('custom_host', e.target.value)}
                  className="w-full px-4 py-2 rounded-md"
                  style={inputStyle}
                  placeholder="smtp.ejemplo.com"
                />
              </div>
            )}

            {preset.hint && (
              <p className="mt-1 text-xs text-amber-400">{preset.hint}</p>
            )}
          </div>

          {/* Usuario / email */}
          <div>
            <label className="block text-sm mb-1 font-medium">Correo electrónico (usuario SMTP)</label>
            <input
              required
              type="email"
              value={form.username}
              onChange={e => set('username', e.target.value)}
              className="w-full px-4 py-2 rounded-md"
              style={inputStyle}
              placeholder="tu@gmail.com"
            />
          </div>

          {/* Contraseña */}
          <div>
            <label className="block text-sm mb-1 font-medium">
              {initialData ? 'Contraseña (dejar en blanco para no cambiar)' : 'Contraseña / App Password'}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              className="w-full px-4 py-2 rounded-md"
              style={inputStyle}
              placeholder={initialData ? '••••••••' : 'Contraseña o App Password'}
            />
          </div>

          {/* Acciones */}
          <div className="pt-3 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 border rounded-md text-sm transition hover:opacity-80"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 text-white rounded-md flex items-center gap-2 transition"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              {saving
                ? 'Guardando…'
                : initialData
                  ? <><FiEdit /> Actualizar</>
                  : <><FiSend /> Crear perfil</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}

const inputStyle = {
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border)',
};
