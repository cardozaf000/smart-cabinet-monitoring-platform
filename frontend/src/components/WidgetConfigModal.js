import React, { useMemo, useState, useRef, useEffect } from 'react';
import { FiSearch, FiChevronDown, FiChevronUp, FiClock } from 'react-icons/fi';
import Portal from './Portal';

/* -------------------------------------------------------
   Rangos rápidos estilo Grafana
------------------------------------------------------- */
const QUICK_RANGES = [
  { label: "5m",  kind: "lastN", unit: "minutes", value: 5 },
  { label: "15m", kind: "lastN", unit: "minutes", value: 15 },
  { label: "30m", kind: "lastN", unit: "minutes", value: 30 },
  { label: "1h",  kind: "lastN", unit: "hours",   value: 1 },
  { label: "3h",  kind: "lastN", unit: "hours",   value: 3 },
  { label: "6h",  kind: "lastN", unit: "hours",   value: 6 },
  { label: "12h", kind: "lastN", unit: "hours",   value: 12 },
  { label: "24h", kind: "lastN", unit: "hours",   value: 24 },
  { label: "7d",  kind: "lastN", unit: "days",    value: 7 },
  { label: "30d", kind: "lastN", unit: "days",    value: 30 },
];

/* Sugerencias de tipo de gráfico según tipo de variable */
const CHART_SUGGESTIONS = {
  temperatura:  ["line", "gauge", "area"],
  humedad:      ["line", "gauge", "area"],
  cpu:          ["area", "line", "gauge"],
  memoria:      ["area", "bar",  "gauge"],
  presion:      ["line", "area", "gauge"],
  corriente:    ["line", "area"],
  voltaje:      ["line", "area"],
  puerta:       ["stat"],
  movimiento:   ["stat"],
  luz:          ["line", "area"],
  lux:          ["line", "area"],
};

function suggestCharts(measure) {
  if (!measure) return [];
  const key = Object.keys(CHART_SUGGESTIONS).find(k => measure.toLowerCase().includes(k));
  return key ? CHART_SUGGESTIONS[key] : [];
}

const CHART_TYPES = [
  { value: "line",  label: "Línea" },
  { value: "area",  label: "Área" },
  { value: "bar",   label: "Barras" },
  { value: "gauge", label: "Gauge" },
  { value: "stat",  label: "Valor único" },
];

const WIDTH_OPTIONS = [
  { value: 1, label: "Pequeño (1/3)" },
  { value: 2, label: "Mediano (1/2)" },
  { value: 3, label: "Grande (ancho completo)" },
];

/* -------------------------------------------------------
   Modal principal
------------------------------------------------------- */
const WidgetConfigModal = ({ initial, data = [], onSave, onCancel }) => {
  const [cfg, setCfg] = useState({ colSpan: 1, ...initial });

  const tipos    = useMemo(() => Array.from(new Set(data.map(d => d.tipo))),     [data]);
  const sensores = useMemo(() => Array.from(new Set(data.map(d => d.sensorId))), [data]);

  // Mapa id → nombre para mostrar en el dropdown
  const sensorNames = useMemo(() => {
    const map = {};
    data.forEach(d => { if (!map[d.sensorId]) map[d.sensorId] = d.name || d.sensorId; });
    return map;
  }, [data]);

  const set = (key, value) => setCfg(prev => ({ ...prev, [key]: value }));

  // Buscador de sensor
  const [sensorSearch, setSensorSearch] = useState("");
  const [sensorDropdown, setSensorDropdown] = useState(false);
  const dropRef = useRef(null);

  useEffect(() => {
    const handler = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setSensorDropdown(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredSensors = useMemo(() => {
    const q = sensorSearch.toLowerCase();
    return sensores.filter(s =>
      s.toLowerCase().includes(q) || (sensorNames[s] || "").toLowerCase().includes(q)
    );
  }, [sensores, sensorNames, sensorSearch]);

  // Sugerencias de gráfico
  const suggestions = suggestCharts(cfg.measure);

  // Helper para rangos rápidos
  const isQuickActive = (qr) =>
    cfg.timeRange?.kind === qr.kind &&
    cfg.timeRange?.unit === qr.unit &&
    Number(cfg.timeRange?.value) === qr.value;

  const setQuickRange = (qr) =>
    set("timeRange", { kind: qr.kind, unit: qr.unit, value: qr.value });

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50 p-4">
      <div
        className="relative rounded-2xl shadow-xl p-6 w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--color-card)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
      >
        <button onClick={onCancel}
          className="absolute top-3 right-3 text-xl font-bold hover:text-red-400"
          title="Cerrar">×</button>

        <h3 className="text-xl font-bold mb-5 text-[var(--color-primary)]">Configurar Widget</h3>

        <div className="space-y-5">

          {/* === Título y Ancho === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Título">
              <input className="field-input" value={cfg.title} onChange={e => set('title', e.target.value)} />
            </Field>
            <Field label="Ancho del panel">
              <select className="field-input" value={cfg.colSpan || 1} onChange={e => set('colSpan', Number(e.target.value))}>
                {WIDTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          {/* === Medida y Tipo de gráfico === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Variable medida">
              <select className="field-input" value={cfg.measure}
                onChange={e => set('measure', e.target.value)}>
                {[...tipos, cfg.measure].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </Field>

            <Field label="Tipo de gráfico">
              <select className="field-input" value={cfg.chartType} onChange={e => set('chartType', e.target.value)}>
                {CHART_TYPES.map(ct => (
                  <option key={ct.value} value={ct.value}>
                    {ct.label}{suggestions.includes(ct.value) ? " ★" : ""}
                  </option>
                ))}
              </select>
              {suggestions.length > 0 && (
                <p className="text-xs mt-1 opacity-60">★ Recomendado para "{cfg.measure}"</p>
              )}
            </Field>
          </div>

          {/* === Ámbito + Sensor buscable === */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Ámbito">
              <select className="field-input" value={cfg.sensorScope}
                onChange={e => set('sensorScope', e.target.value)}>
                <option value="any">Cualquiera (agregado)</option>
                <option value="bySensor">Por sensor específico</option>
              </select>
            </Field>

            {cfg.sensorScope === 'bySensor' && (
              <Field label="Sensor">
                <div className="relative" ref={dropRef}>
                  <div
                    className="field-input flex items-center justify-between cursor-pointer"
                    onClick={() => setSensorDropdown(v => !v)}
                  >
                    <span className={cfg.sensorId ? "" : "opacity-50"}>
                      {cfg.sensorId
                        ? `${cfg.sensorId}${sensorNames[cfg.sensorId] ? ` — ${sensorNames[cfg.sensorId]}` : ""}`
                        : "-- seleccionar --"}
                    </span>
                    {sensorDropdown ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                  </div>
                  {sensorDropdown && (
                    <div className="absolute z-50 w-full mt-1 rounded-lg border shadow-xl overflow-hidden"
                      style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
                      <div className="p-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                        <div className="flex items-center gap-2 px-2 py-1 rounded"
                          style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                          <FiSearch size={12} />
                          <input autoFocus className="bg-transparent outline-none flex-1 text-sm"
                            placeholder="Buscar por ID o nombre…"
                            value={sensorSearch} onChange={e => setSensorSearch(e.target.value)} />
                        </div>
                      </div>
                      <div className="max-h-40 overflow-y-auto">
                        {filteredSensors.length === 0 && <div className="px-4 py-2 text-sm opacity-50">Sin resultados</div>}
                        {filteredSensors.map(s => (
                          <div key={s}
                            className="px-4 py-2 cursor-pointer text-sm hover:bg-[color-mix(in_srgb,var(--color-primary)_15%,transparent)]"
                            onClick={() => { set('sensorId', s); setSensorSearch(""); setSensorDropdown(false); }}>
                            <span className="font-medium">{s}</span>
                            {sensorNames[s] && <span className="ml-2 opacity-50 text-xs">— {sensorNames[s]}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Field>
            )}
          </div>

          {/* === Rango de tiempo estilo Grafana === */}
          <Field label={<span className="flex items-center gap-2"><FiClock size={13} /> Rango de tiempo</span>} full>
            <div className="space-y-3">
              {/* Rangos rápidos */}
              <div className="flex flex-wrap gap-1.5">
                {QUICK_RANGES.map(qr => (
                  <button key={qr.label} type="button"
                    onClick={() => setQuickRange(qr)}
                    className="px-2.5 py-1 rounded text-xs font-medium transition-all border"
                    style={{
                      backgroundColor: isQuickActive(qr) ? "var(--color-primary)" : "transparent",
                      color: isQuickActive(qr) ? "#fff" : "var(--color-text)",
                      borderColor: isQuickActive(qr) ? "var(--color-primary)" : "var(--color-border)",
                    }}
                  >
                    {qr.label}
                  </button>
                ))}
                <button type="button"
                  onClick={() => set('timeRange', { kind: 'absolute', from: '', to: '' })}
                  className="px-2.5 py-1 rounded text-xs font-medium transition-all border"
                  style={{
                    backgroundColor: cfg.timeRange?.kind === 'absolute' ? "var(--color-primary)" : "transparent",
                    color: cfg.timeRange?.kind === 'absolute' ? "#fff" : "var(--color-text)",
                    borderColor: cfg.timeRange?.kind === 'absolute' ? "var(--color-primary)" : "var(--color-border)",
                  }}
                >
                  Personalizado
                </button>
              </div>

              {/* Personalizado: rango relativo manual */}
              {cfg.timeRange?.kind === 'lastN' && !QUICK_RANGES.some(qr => isQuickActive(qr)) && (
                <div className="flex gap-2 flex-wrap items-center">
                  <span className="text-xs opacity-60">Últimos</span>
                  <input type="number" min={1} className="field-input w-20 text-sm"
                    value={cfg.timeRange?.value ?? 2}
                    onChange={e => set('timeRange', { ...cfg.timeRange, value: Number(e.target.value) })} />
                  <select className="field-input text-sm"
                    value={cfg.timeRange?.unit || 'hours'}
                    onChange={e => set('timeRange', { ...cfg.timeRange, unit: e.target.value })}>
                    <option value="minutes">minutos</option>
                    <option value="hours">horas</option>
                    <option value="days">días</option>
                  </select>
                </div>
              )}

              {/* Rango absoluto (fechas) */}
              {cfg.timeRange?.kind === 'absolute' && (
                <div className="flex gap-2 flex-wrap items-center text-sm">
                  <span className="text-xs opacity-60">Desde</span>
                  <input type="datetime-local" className="field-input text-sm"
                    value={cfg.timeRange?.from || ''}
                    onChange={e => set('timeRange', { ...cfg.timeRange, from: e.target.value })} />
                  <span className="text-xs opacity-60">hasta</span>
                  <input type="datetime-local" className="field-input text-sm"
                    value={cfg.timeRange?.to || ''}
                    onChange={e => set('timeRange', { ...cfg.timeRange, to: e.target.value })} />
                </div>
              )}
            </div>
          </Field>

          {/* === Opciones adicionales === */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Agregación">
              <select className="field-input" value={cfg.agg} onChange={e => set('agg', e.target.value)}>
                <option value="none">Ninguna</option>
                <option value="avg">Promedio</option>
                <option value="min">Mínimo</option>
                <option value="max">Máximo</option>
                <option value="last">Último</option>
              </select>
            </Field>
            <Field label="Decimales">
              <input type="number" min={0} max={6} className="field-input"
                value={cfg.decimals} onChange={e => set('decimals', Number(e.target.value || 0))} />
            </Field>
            <Field label="Unidad (opcional)">
              <input className="field-input" value={cfg.unitOverride}
                onChange={e => set('unitOverride', e.target.value)} placeholder="°C, %, lx…" />
            </Field>
          </div>

          {/* Destacado */}
          <div>
            <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="h-4 w-4"
                checked={!!cfg.pinned} onChange={e => set('pinned', !!e.target.checked)} />
              <span>Mostrar como destacado en Sensores</span>
            </label>
          </div>

          {/* Acciones */}
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onCancel} className="btn-danger">Cancelar</button>
            <button onClick={() => onSave(cfg)} className="btn-primary">Guardar</button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
};

const Field = ({ label, children, full = false }) => (
  <div className={full ? 'md:col-span-2' : ''}>
    <label className="block text-sm mb-1 font-medium">{label}</label>
    {children}
  </div>
);

export default WidgetConfigModal;
