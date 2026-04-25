import React, { useState, useMemo } from 'react';
import { FiArrowRight, FiArrowLeft, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import Portal from './Portal';

/* -------------------------------------------------------
   Sugerencias de gráfico por tipo de variable
------------------------------------------------------- */
const CHART_SUGGESTIONS = {
  temperatura:  ['line', 'gauge', 'stat-spark', 'heatmap'],
  humedad:      ['line', 'gauge', 'stat-spark', 'heatmap'],
  cpu:          ['area', 'line', 'gauge'],
  memoria:      ['area', 'bar', 'gauge'],
  presion:      ['line', 'area', 'gauge'],
  corriente:    ['line', 'area', 'scatter'],
  voltaje:      ['line', 'area', 'scatter'],
  puerta:       ['stat', 'stat-bar', 'barH'],
  movimiento:   ['stat', 'stat-bar', 'barH'],
  luz:          ['line', 'area', 'heatmap'],
  lux:          ['line', 'area', 'heatmap'],
  smoke:        ['stat-bg', 'stat-bar', 'line'],
  mq:           ['stat-bg', 'stat-bar', 'line'],
};

const CHART_TYPES = [
  { value: 'line',       label: 'Línea',        desc: 'Tendencia continua' },
  { value: 'area',       label: 'Área',         desc: 'Volumen / acumulación' },
  { value: 'bar',        label: 'Barras',       desc: 'Comparación por periodo' },
  { value: 'barH',       label: 'Barras H',     desc: 'Comparación horizontal' },
  { value: 'scatter',    label: 'Dispersión',   desc: 'Distribución de lecturas' },
  { value: 'gauge',      label: 'Gauge',        desc: 'Valor en escala circular' },
  { value: 'heatmap',    label: 'Mapa de calor', desc: 'Patrones horarios' },
  { value: 'stat',       label: 'Número',       desc: 'Valor actual grande' },
  { value: 'stat-spark', label: 'Núm. + línea', desc: 'Número con sparkline' },
  { value: 'stat-bg',    label: 'Núm. + fondo', desc: 'Número con color de fondo' },
  { value: 'stat-bar',   label: 'Núm. + barra', desc: 'Número con barra de progreso' },
];

const QUICK_RANGES = [
  { label: '5m',  kind: 'lastN', unit: 'minutes', value: 5 },
  { label: '15m', kind: 'lastN', unit: 'minutes', value: 15 },
  { label: '30m', kind: 'lastN', unit: 'minutes', value: 30 },
  { label: '1h',  kind: 'lastN', unit: 'hours',   value: 1 },
  { label: '3h',  kind: 'lastN', unit: 'hours',   value: 3 },
  { label: '6h',  kind: 'lastN', unit: 'hours',   value: 6 },
  { label: '12h', kind: 'lastN', unit: 'hours',   value: 12 },
  { label: '24h', kind: 'lastN', unit: 'hours',   value: 24 },
  { label: '7d',  kind: 'lastN', unit: 'days',    value: 7 },
  { label: '30d', kind: 'lastN', unit: 'days',    value: 30 },
];

/* -------------------------------------------------------
   Mini-previews SVG de cada tipo de gráfico
------------------------------------------------------- */
function ChartPreviewSVG({ type, color, active }) {
  const c  = active ? '#fff' : color;
  const ca = active ? 'rgba(255,255,255,0.25)' : `${color}40`;
  const track = active ? 'rgba(255,255,255,0.15)' : '#33333388';

  switch (type) {
    case 'line':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          <polyline
            points="3,34 13,19 23,27 35,9 45,17 57,6"
            fill="none" stroke={c} strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round"
          />
          {[[3,34],[13,19],[23,27],[35,9],[45,17],[57,6]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r="2.5" fill={c}/>
          ))}
        </svg>
      );
    case 'area':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          <polygon
            points="3,40 3,34 13,19 23,27 35,9 45,17 57,6 57,40"
            fill={ca}
          />
          <polyline
            points="3,34 13,19 23,27 35,9 45,17 57,6"
            fill="none" stroke={c} strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round"
          />
        </svg>
      );
    case 'bar':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          {[[5,22,10,18],[18,12,10,28],[31,17,10,23],[44,5,10,35]].map(([x,y,w,h],i) => (
            <rect key={i} x={x} y={y} width={w} height={h}
              fill={c} rx="2" opacity={0.65 + i * 0.1}/>
          ))}
        </svg>
      );
    case 'gauge':
      return (
        <svg viewBox="0 0 60 44" className="w-full h-full">
          <path d="M6,38 A24,24 0 0,1 54,38"
            fill="none" stroke={track} strokeWidth="5" strokeLinecap="round"/>
          <path d="M6,38 A24,24 0 0,1 41,14"
            fill="none" stroke={c} strokeWidth="5" strokeLinecap="round"/>
          <line x1="30" y1="38" x2="41" y2="14" stroke={c} strokeWidth="2" strokeLinecap="round"/>
          <circle cx="30" cy="38" r="3.5" fill={c}/>
        </svg>
      );
    case 'barH':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          {[[4,5,38],[4,15,28],[4,25,44],[4,35,20]].map(([y, top, w], i) => (
            <rect key={i} x={4} y={top} width={w} height={7}
              fill={c} rx="2" opacity={0.55 + i * 0.12} />
          ))}
        </svg>
      );
    case 'scatter':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          {[[8,32],[14,18],[22,28],[28,10],[34,22],[40,14],[48,8],[54,20],[18,36],[42,30]].map(([x,y],i) => (
            <circle key={i} cx={x} cy={y} r="2.5" fill={c} opacity={0.7 + (i % 3) * 0.1} />
          ))}
        </svg>
      );
    case 'stat':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          <text x="30" y="20" textAnchor="middle" dominantBaseline="middle"
            fontSize="22" fontWeight="bold" fill={c}>42</text>
          <text x="30" y="33" textAnchor="middle"
            fontSize="8" fill={c} opacity="0.7">°C</text>
        </svg>
      );
    case 'stat-spark':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          <text x="30" y="14" textAnchor="middle" fontSize="14" fontWeight="bold" fill={c}>42</text>
          <text x="30" y="23" textAnchor="middle" fontSize="6" fill={c} opacity="0.65">°C</text>
          <polygon points="6,40 6,34 14,30 22,32 30,26 38,28 46,23 54,25 54,40" fill={ca}/>
          <polyline points="6,34 14,30 22,32 30,26 38,28 46,23 54,25"
            fill="none" stroke={c} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
        </svg>
      );
    case 'stat-bg':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          <rect x="0" y="0" width="60" height="40" rx="5" fill={ca}/>
          <text x="30" y="19" textAnchor="middle" dominantBaseline="middle"
            fontSize="18" fontWeight="bold" fill={c}>42</text>
          <text x="30" y="32" textAnchor="middle" fontSize="7" fill={c} opacity="0.85">°C</text>
        </svg>
      );
    case 'stat-bar':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          <text x="30" y="16" textAnchor="middle" fontSize="13" fontWeight="bold" fill={c}>42</text>
          <text x="30" y="25" textAnchor="middle" fontSize="6" fill={c} opacity="0.65">°C</text>
          <rect x="5" y="30" width="50" height="6" rx="3" fill={ca}/>
          <rect x="5" y="30" width="32" height="6" rx="3" fill={c}/>
        </svg>
      );
    case 'heatmap':
      return (
        <svg viewBox="0 0 60 40" className="w-full h-full">
          {[
            [2,2],[12,2],[22,2],[32,2],[42,2],[52,2],
            [2,12],[12,12],[22,12],[32,12],[42,12],[52,12],
            [2,22],[12,22],[22,22],[32,22],[42,22],[52,22],
            [2,32],[12,32],[22,32],[32,32],[42,32],[52,32],
          ].map(([x, y], i) => {
            const opacity = 0.1 + ((i * 37 + 13) % 7) * 0.13;
            return <rect key={i} x={x} y={y} width={8} height={8} fill={c} opacity={opacity} rx="1" />;
          })}
        </svg>
      );
    default: return null;
  }
}

/* -------------------------------------------------------
   Paso 1 — Selección de sensor
------------------------------------------------------- */
function StepSensor({ sensorOptions, selected, onSelect }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return sensorOptions.filter(s =>
      s.name.toLowerCase().includes(q) || s.type.toLowerCase().includes(q) || s.id.includes(q)
    );
  }, [sensorOptions, search]);

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>Elige el sensor que quieres visualizar:</p>
      <input
        className="field-input w-full text-sm"
        placeholder="Buscar por nombre o tipo…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        autoFocus
      />
      {sensorOptions.length === 0 && (
        <div className="text-center py-10 text-sm" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>No hay sensores activos</div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
        {filtered.map(s => {
          const active = selected?.id === s.id && selected?.type === s.type;
          return (
            <button
              key={`${s.id}-${s.type}`}
              onClick={() => onSelect(s)}
              className="text-left p-3 rounded-xl border transition-all hover:scale-[1.02] focus:outline-none"
              style={{
                backgroundColor: active
                  ? 'color-mix(in srgb, var(--color-primary) 15%, var(--color-card))'
                  : 'var(--color-bg)',
                borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                boxShadow: active ? '0 0 0 2px var(--color-primary)' : 'none',
              }}
            >
              <div className="font-semibold text-sm leading-tight">{s.name}</div>
              <div className="text-xs mt-0.5 capitalize" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>{s.type}</div>
              <div
                className="text-xs mt-1.5 font-mono font-bold"
                style={{ color: active ? 'var(--color-primary)' : undefined }}
              >
                {s.lectura}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Paso 2 — Selección de tipo de gráfico
------------------------------------------------------- */
function StepChart({ selectedSensor, selectedChart, onSelect, colorPrimary }) {
  const recommendations = useMemo(() => {
    if (!selectedSensor) return [];
    const key = Object.keys(CHART_SUGGESTIONS).find(k =>
      selectedSensor.type.toLowerCase().includes(k)
    );
    return key ? CHART_SUGGESTIONS[key] : [];
  }, [selectedSensor]);

  return (
    <div className="space-y-3">
      <p className="text-sm" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>
        Elige el tipo de gráfico para{' '}
        <strong style={{ color: 'var(--color-text)' }}>{selectedSensor?.name}</strong>{' '}
        <span>({selectedSensor?.type})</span>:
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {CHART_TYPES.map(ct => {
          const active       = selectedChart === ct.value;
          const recommended  = recommendations.includes(ct.value);
          return (
            <button
              key={ct.value}
              onClick={() => onSelect(ct.value)}
              className="relative flex flex-col items-center p-3 rounded-xl border transition-all hover:scale-[1.03] focus:outline-none"
              style={{
                backgroundColor: active ? 'var(--color-primary)' : 'var(--color-bg)',
                borderColor: active
                  ? 'var(--color-primary)'
                  : recommended
                  ? colorPrimary + '55'
                  : 'var(--color-border)',
                boxShadow: active ? '0 0 0 2px var(--color-primary)' : 'none',
                color: active ? 'white' : 'var(--color-text)',
              }}
            >
              {recommended && !active && (
                <span className="absolute -top-1.5 -right-1.5 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
                  ★
                </span>
              )}
              <div className="w-14 h-9 mb-2">
                <ChartPreviewSVG type={ct.value} color={colorPrimary} active={active} />
              </div>
              <span className="font-semibold text-xs">{ct.label}</span>
              <span className="text-[10px] mt-0.5 text-center leading-tight" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>{ct.desc}</span>
            </button>
          );
        })}
      </div>
      {recommendations.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>★ Recomendado para "{selectedSensor?.type}"</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------
   Paso 3 — Configuración básica + avanzado
------------------------------------------------------- */
function StepConfig({ title, setTitle, timeRange, setTimeRange, advanced, setAdvanced }) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const isQuickActive = (qr) =>
    timeRange.kind === qr.kind &&
    timeRange.unit === qr.unit &&
    Number(timeRange.value) === qr.value;

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium block mb-1">Título del gráfico</label>
        <input
          className="field-input w-full"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Ej: Temperatura — Sensor 1"
        />
      </div>

      <div>
        <label className="text-sm font-medium block mb-1.5">Rango de tiempo</label>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_RANGES.map(qr => (
            <button
              key={qr.label}
              type="button"
              onClick={() => setTimeRange({ kind: qr.kind, unit: qr.unit, value: qr.value })}
              className="px-2.5 py-1 rounded text-xs font-medium border transition"
              style={{
                backgroundColor: isQuickActive(qr) ? 'var(--color-primary)' : 'transparent',
                color: isQuickActive(qr) ? '#fff' : 'var(--color-text)',
                borderColor: isQuickActive(qr) ? 'var(--color-primary)' : 'var(--color-border)',
              }}
            >
              {qr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Opciones avanzadas colapsables */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold transition mb-2 hover:opacity-90"
          style={{ color: 'var(--color-text-muted, #9ca3af)' }}
        >
          {showAdvanced ? <FiChevronUp size={13}/> : <FiChevronDown size={13}/>}
          Opciones avanzadas (opcional)
        </button>

        {showAdvanced && (
          <div
            className="grid grid-cols-2 gap-3 p-3 rounded-xl"
            style={{ backgroundColor: 'var(--color-bg)', border: '1px solid var(--color-border)' }}
          >
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>Ancho del panel</label>
              <select
                className="field-input text-xs w-full"
                value={advanced.colSpan}
                onChange={e => setAdvanced(a => ({ ...a, colSpan: Number(e.target.value) }))}
              >
                <option value={1}>Pequeño (1/3)</option>
                <option value={2}>Mediano (2/3)</option>
                <option value={3}>Grande (completo)</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>Agregación</label>
              <select
                className="field-input text-xs w-full"
                value={advanced.agg}
                onChange={e => setAdvanced(a => ({ ...a, agg: e.target.value }))}
              >
                <option value="none">Ninguna</option>
                <option value="avg">Promedio</option>
                <option value="min">Mínimo</option>
                <option value="max">Máximo</option>
                <option value="last">Último</option>
              </select>
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>Decimales</label>
              <input
                type="number" min={0} max={6}
                className="field-input text-xs w-full"
                value={advanced.decimals}
                onChange={e => setAdvanced(a => ({ ...a, decimals: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>Unidad (override)</label>
              <input
                className="field-input text-xs w-full"
                value={advanced.unitOverride}
                onChange={e => setAdvanced(a => ({ ...a, unitOverride: e.target.value }))}
                placeholder="°C, %, lx…"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Wizard principal
------------------------------------------------------- */
export default function AddChartWizard({ sensors, lecturasNormalizadas, onAdd, onCancel }) {
  const [step, setStep]                   = useState(1);
  const [selectedSensor, setSelectedSensor] = useState(null);
  const [selectedChart, setSelectedChart]   = useState(null);
  const [title, setTitle]                   = useState('');
  const [timeRange, setTimeRange]           = useState({ kind: 'lastN', unit: 'hours', value: 2 });
  const [advanced, setAdvanced]             = useState({ colSpan: 1, agg: 'none', decimals: 2, unitOverride: '' });

  const colorPrimary = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-primary').trim() || '#4f8ef7';

  /* Construir opciones de sensor */
  const sensorOptions = useMemo(() => {
    return sensors.map(s => {
      const l = lecturasNormalizadas.find(
        r => r.sensorId === String(s.id) && r.tipo === (s.type || '')
      );
      return {
        id:      String(s.id),
        type:    s.type || 'sensor',
        name:    s.name || String(s.id),
        lectura: l ? `${l.valor}${l.unidad ? ' ' + l.unidad : ''}` : '—',
      };
    });
  }, [sensors, lecturasNormalizadas]);

  const handleSelectSensor = (s) => {
    setSelectedSensor(s);
    setTitle(`${s.name} — ${s.type}`);
    // Auto-seleccionar gráfico recomendado
    const key = Object.keys(CHART_SUGGESTIONS).find(k => s.type.toLowerCase().includes(k));
    const recs = key ? CHART_SUGGESTIONS[key] : [];
    setSelectedChart(recs[0] || 'line');
  };

  const handleCreate = () => {
    if (!selectedSensor || !selectedChart) return;
    onAdd({
      id:          `sensor-${Date.now()}`,
      type:        'sensor',
      title:       title || `${selectedSensor.name} — ${selectedSensor.type}`,
      sensorName:  selectedSensor.name,
      sensorPort:  '—',
      chartType:   selectedChart,
      measure:     selectedSensor.type,
      sensorScope: 'bySensor',
      sensorId:    selectedSensor.id,
      agg:         advanced.agg,
      timeRange,
      maxPoints:   200,
      decimals:    advanced.decimals,
      unitOverride: advanced.unitOverride,
      pinned:      true,
      colSpan:     advanced.colSpan,
    });
  };

  const STEP_LABELS = ['Sensor', 'Tipo de gráfico', 'Configuración'];

  return (
    <Portal>
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className="rounded-2xl shadow-2xl w-[95vw] max-w-xl max-h-[90vh] flex flex-col"
        style={{
          backgroundColor: 'var(--color-card)',
          color: 'var(--color-text)',
          border: '1px solid var(--color-border)',
        }}
      >
        {/* Header con steps */}
        <div
          className="px-6 pt-5 pb-4 border-b flex items-start justify-between flex-shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div>
            <h3 className="text-lg font-bold text-[var(--color-primary)] mb-2">Añadir gráfico</h3>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(n => (
                <React.Fragment key={n}>
                  <div
                    className="w-6 h-6 rounded-full text-xs flex items-center justify-center font-bold transition-all"
                    style={{
                      backgroundColor:
                        step === n ? 'var(--color-primary)'
                        : step > n ? '#16a34a'
                        : 'transparent',
                      color: step >= n ? '#fff' : 'var(--color-text)',
                      border: step < n ? '1px solid var(--color-border)' : 'none',
                      opacity: step < n ? 0.45 : 1,
                    }}
                  >
                    {step > n ? '✓' : n}
                  </div>
                  {n < 3 && (
                    <div
                      className="h-px w-6 transition-colors"
                      style={{ backgroundColor: step > n ? '#16a34a' : 'var(--color-border)' }}
                    />
                  )}
                </React.Fragment>
              ))}
              <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted, #9ca3af)' }}>{STEP_LABELS[step - 1]}</span>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="text-2xl leading-none hover:text-red-400 transition-colors px-1 mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Contenido del paso */}
        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 && (
            <StepSensor
              sensorOptions={sensorOptions}
              selected={selectedSensor}
              onSelect={handleSelectSensor}
            />
          )}
          {step === 2 && (
            <StepChart
              selectedSensor={selectedSensor}
              selectedChart={selectedChart}
              onSelect={setSelectedChart}
              colorPrimary={colorPrimary}
            />
          )}
          {step === 3 && (
            <StepConfig
              title={title}
              setTitle={setTitle}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              advanced={advanced}
              setAdvanced={setAdvanced}
            />
          )}
        </div>

        {/* Footer de navegación */}
        <div
          className="px-6 py-4 border-t flex justify-between flex-shrink-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border hover:opacity-80 transition"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <FiArrowLeft size={14}/> Atrás
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm border hover:opacity-80 transition"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Cancelar
            </button>
          )}

          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={step === 1 ? !selectedSensor : !selectedChart}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white text-sm disabled:opacity-35 transition hover:opacity-90 shadow"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              Siguiente <FiArrowRight size={14}/>
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white text-sm transition hover:opacity-90 shadow"
              style={{ backgroundColor: 'var(--color-primary)' }}
            >
              ✓ Crear gráfico
            </button>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
