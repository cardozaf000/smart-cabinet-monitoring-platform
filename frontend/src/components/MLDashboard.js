/**
 * MLDashboard.js
 * Overlay pantalla completa de análisis del modelo Isolation Forest.
 * Mismo patrón que SensorDashboard — abre desde MLPage con botón "Estadísticas".
 *
 * Gráficos incluidos:
 *   1. Tendencia del score (línea temporal)
 *   2. Histograma de distribución de scores
 *   3. Tasa de anomalías por hora
 *   4. Comparativa de features: anomalías vs normal
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Portal from './Portal';
import {
  ResponsiveContainer, ComposedChart, AreaChart, Area, BarChart, Bar,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, Legend,
} from 'recharts';
import {
  FiX, FiRefreshCcw, FiBarChart2, FiActivity, FiCpu,
  FiTrendingUp, FiAlertTriangle, FiCheckCircle, FiClock,
  FiInfo,
} from 'react-icons/fi';
import { BACKEND } from '../utils/api';

/* ────────────────────────────────────────────────────────────
   RANGOS DE TIEMPO
──────────────────────────────────────────────────────────── */
const RANGES = [
  { label: '6h',  horas: 6,   limit: 80  },
  { label: '24h', horas: 24,  limit: 288 },
  { label: '48h', horas: 48,  limit: 300 },
  { label: '7d',  horas: 168, limit: 500 },
];

/* ────────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────────── */
function parseFeatures(raw) {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return {}; }
}

/** Genera histograma de N buckets a partir de array de valores */
function buildHistogram(values, buckets = 20) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ range: min.toFixed(3), count: values.length, isAnomaly: min < 0 }];
  const step = (max - min) / buckets;
  const bins = Array.from({ length: buckets }, (_, i) => ({
    range: (min + i * step).toFixed(3),
    low:   min + i * step,
    high:  min + (i + 1) * step,
    count: 0,
    isAnomaly: (min + i * step + step / 2) < 0,
  }));
  for (const v of values) {
    const idx = Math.min(Math.floor((v - min) / step), buckets - 1);
    bins[idx].count++;
  }
  return bins;
}

/** Agrupa inferencias por hora para el gráfico de tasa */
function buildHourlyRate(historico) {
  const map = new Map();
  for (const row of historico) {
    const key = row.timestamp?.slice(0, 13) ?? ''; // 'YYYY-MM-DD HH'
    if (!key) continue;
    const entry = map.get(key) ?? { hora: key.slice(11, 13) + ':00', total: 0, anomalias: 0 };
    entry.total++;
    if (row.es_anomalia) entry.anomalias++;
    map.set(key, entry);
  }
  return Array.from(map.values());
}

/** Calcula promedio de features para anomalías vs normales */
function buildFeatureComparison(anomalias) {
  const keys = ['temperatura', 'humedad', 'luz', 'distancia', 'humo'];
  const labels = { temperatura: 'Temp °C', humedad: 'Humedad %', luz: 'Lux',
                   distancia: 'Dist mm', humo: 'Humo ppm' };

  const sums = { anormal: {}, normal: {} };
  const counts = { anormal: {}, normal: {} };
  for (const k of keys) { sums.anormal[k] = 0; sums.normal[k] = 0;
                           counts.anormal[k] = 0; counts.normal[k] = 0; }

  for (const a of anomalias) {
    const f    = parseFeatures(a.features_json);
    const side = a.es_anomalia ? 'anormal' : 'normal';
    for (const k of keys) {
      if (f[k] != null && !isNaN(Number(f[k]))) {
        sums[side][k] += Number(f[k]);
        counts[side][k]++;
      }
    }
  }

  return keys.map(k => ({
    feature:  labels[k],
    anomalia: counts.anormal[k] > 0 ? sums.anormal[k] / counts.anormal[k] : 0,
    normal:   counts.normal[k]  > 0 ? sums.normal[k]  / counts.normal[k]  : 0,
  }));
}

/* ────────────────────────────────────────────────────────────
   STAT CARD — igual al patrón de SensorDashboard
──────────────────────────────────────────────────────────── */
function StatCard({ label, value, unit, color, Icon, sub }) {
  return (
    <div className="flex flex-col p-4 rounded-2xl border"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={13} style={{ color, flexShrink: 0 }} />}
        <span className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: 'var(--color-text)', opacity: 0.5 }}>
          {label}
        </span>
      </div>
      <span className="text-3xl font-bold tabular-nums leading-none" style={{ color }}>
        {value ?? '—'}
      </span>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        {unit && <span className="text-xs" style={{ color: 'var(--color-text)', opacity: 0.4 }}>{unit}</span>}
        {sub  && <span className="text-[10px]" style={{ color: 'var(--color-text)', opacity: 0.3 }}>{sub}</span>}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   CHART CARD — contenedor visual para cada gráfico
──────────────────────────────────────────────────────────── */
function ChartCard({ title, subtitle, height = '240px', children }) {
  return (
    <div className="rounded-2xl border overflow-hidden flex flex-col"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>
      <div className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: 'var(--color-border)' }}>
        <FiBarChart2 size={13} style={{ color: 'var(--color-primary)' }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{title}</p>
          {subtitle && (
            <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text)', opacity: 0.35 }}>{subtitle}</p>
          )}
        </div>
      </div>
      <div style={{ height, padding: '4px 4px 4px 0' }}>
        {children}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   TOOLTIP personalizado para gráficos
──────────────────────────────────────────────────────────── */
function ScoreTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const score = Number(d?.score ?? 0);
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-xl"
      style={{ backgroundColor: 'var(--color-card)', borderColor: d?.es_anomalia ? '#ef444450' : '#10b98150' }}>
      <p className="font-mono opacity-50 mb-1">{label}</p>
      <p className="font-bold" style={{ color: d?.es_anomalia ? '#f87171' : '#34d399' }}>
        {d?.es_anomalia ? 'Anomalía' : 'Normal'}
      </p>
      <p className="font-mono opacity-60 mt-0.5">Score: {score.toFixed(5)}</p>
    </div>
  );
}

function HistTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border px-3 py-2 text-xs shadow-xl"
      style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
      <p className="font-mono opacity-50 mb-1">Score ≈ {label}</p>
      <p className="font-semibold" style={{ color: 'var(--color-text)' }}>
        {payload[0]?.value} inferencia(s)
      </p>
    </div>
  );
}

/* ── Dot coloreado por anomalía ── */
function ScoreDot({ cx, cy, payload }) {
  if (cx == null || cy == null) return null;
  return <circle cx={cx} cy={cy} r={3} fill={payload?.es_anomalia ? '#ef4444' : '#10b981'} strokeWidth={0} />;
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE PRINCIPAL
──────────────────────────────────────────────────────────── */
export default function MLDashboard({ onClose }) {
  const [rangeIdx,    setRangeIdx]    = useState(1); // 24h por defecto
  const [historico,   setHistorico]   = useState([]);
  const [anomalias,   setAnomalias]   = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [err,         setErr]         = useState('');

  /* ── Carga de datos ── */
  const fetchData = useCallback(async () => {
    const r = RANGES[rangeIdx];
    setLoading(true); setErr('');
    try {
      const [hRes, aRes] = await Promise.all([
        fetch(`${BACKEND}/api/anomalias/historico?horas=${r.horas}&limit=${r.limit}`),
        fetch(`${BACKEND}/api/anomalias?limit=200`),
      ]);
      if (!hRes.ok) throw new Error(`Historico ${hRes.status}`);
      if (!aRes.ok) throw new Error(`Anomalias ${aRes.status}`);
      const [hData, aData] = await Promise.all([hRes.json(), aRes.json()]);
      setHistorico(Array.isArray(hData) ? hData : []);
      setAnomalias(Array.isArray(aData) ? aData : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [rangeIdx]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Escape para cerrar ── */
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  /* ── Bloquear scroll del fondo ── */
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  /* ── Datos derivados ── */
  const scores       = historico.map(r => r.score);
  const nAnomalias   = historico.filter(r => r.es_anomalia).length;
  const tasa         = historico.length > 0 ? ((nAnomalias / historico.length) * 100).toFixed(1) : '—';
  const avgScore     = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(4) : '—';
  const minScore     = scores.length > 0 ? Math.min(...scores).toFixed(4) : '—';

  const histData     = useMemo(() => buildHistogram(scores, 18), [scores]);
  const hourlyData   = useMemo(() => buildHourlyRate(historico), [historico]);
  const featureComp  = useMemo(() => buildFeatureComparison(anomalias), [anomalias]);

  /* ── RENDER ── */
  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex flex-col"
        style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)' }}>

        {/* ══ BARRA SUPERIOR ══ */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}>

          {/* Título */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'color-mix(in srgb,var(--color-primary) 15%,transparent)',
                       color: 'var(--color-primary)' }}>
              <FiCpu size={18} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Estadísticas del Modelo ML</h1>
              <p className="text-[11px] opacity-40 mt-0.5">
                Isolation Forest · Gabinete gab-01 · {historico.length} inferencias en ventana
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Selector de rango */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-xl border"
              style={{ borderColor: 'var(--color-border)' }}>
              {RANGES.map((r, i) => (
                <button key={r.label}
                  onClick={() => setRangeIdx(i)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition"
                  style={{
                    backgroundColor: rangeIdx === i ? 'var(--color-primary)' : 'transparent',
                    color: rangeIdx === i ? '#fff' : 'var(--color-text)',
                    opacity: rangeIdx === i ? 1 : 0.55,
                  }}>
                  {r.label}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button onClick={fetchData} disabled={loading}
              className="p-2 rounded-lg border hover:opacity-80 transition disabled:opacity-40"
              style={{ borderColor: 'var(--color-border)' }} title="Actualizar">
              <FiRefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
            </button>

            {/* Cerrar */}
            <button onClick={onClose}
              className="p-2 rounded-lg border hover:opacity-80 transition"
              style={{ borderColor: 'var(--color-border)' }} title="Cerrar (Esc)">
              <FiX size={16} />
            </button>
          </div>
        </div>

        {/* ══ CONTENIDO SCROLLABLE ══ */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

            {/* Error */}
            {err && (
              <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
                style={{ backgroundColor: 'color-mix(in srgb,#ef4444 12%,transparent)',
                         border: '1px solid #ef444430', color: '#f87171' }}>
                <FiAlertTriangle size={14} /> {err}
              </div>
            )}

            {/* Loading overlay */}
            {loading && (
              <div className="flex items-center justify-center py-12 opacity-40">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2"
                  style={{ borderColor: 'var(--color-primary)' }} />
              </div>
            )}

            {!loading && (
              <>
                {/* ── FILA DE STATS ── */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Inferencias"
                    value={historico.length}
                    unit={`en las últimas ${RANGES[rangeIdx].horas}h`}
                    color="var(--color-primary)"
                    Icon={FiActivity}
                  />
                  <StatCard
                    label="Anomalías detectadas"
                    value={nAnomalias}
                    unit={`tasa: ${tasa} %`}
                    sub="normal < 5 %"
                    color={Number(tasa) > 10 ? '#ef4444' : Number(tasa) > 5 ? '#f59e0b' : '#10b981'}
                    Icon={FiAlertTriangle}
                  />
                  <StatCard
                    label="Score promedio"
                    value={avgScore}
                    unit="positivo = normal"
                    sub="umbral en 0"
                    color={Number(avgScore) < 0 ? '#ef4444' : '#10b981'}
                    Icon={FiTrendingUp}
                  />
                  <StatCard
                    label="Peor anomalía"
                    value={minScore}
                    unit="score mínimo registrado"
                    sub="cuanto más negativo, más inusual"
                    color="#f59e0b"
                    Icon={FiClock}
                  />
                </div>

                {/* ── GRÁFICO 1: TENDENCIA DEL SCORE ── */}
                <ChartCard
                  title="Tendencia del Score de Anomalía"
                  subtitle={`Serie temporal · ${RANGES[rangeIdx].label} · Puntos rojos = anomalía · Línea roja = umbral 0`}
                  height="260px">
                  {historico.length === 0 ? (
                    <div className="h-full flex items-center justify-center opacity-30 text-sm">
                      Sin datos en esta ventana de tiempo
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={historico} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                        <defs>
                          <linearGradient id="mlScoreGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%"   stopColor="#6b7280" stopOpacity={0.2} />
                            <stop offset="100%" stopColor="#6b7280" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} />
                        <XAxis dataKey="timestamp" tick={{ fontSize: 10, fill: 'var(--color-text)', opacity: 0.4 }}
                          interval="preserveStartEnd" tickLine={false} axisLine={false} />
                        <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: 'var(--color-text)', opacity: 0.4 }}
                          tickLine={false} axisLine={false} tickFormatter={v => v.toFixed(2)} />
                        <Tooltip content={<ScoreTooltip />} />
                        <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 3" strokeOpacity={0.7}
                          label={{ value: 'Umbral anomalía', position: 'insideTopRight', fontSize: 10,
                                   fill: '#ef4444', opacity: 0.7 }} />
                        <Area type="monotone" dataKey="score" fill="url(#mlScoreGrad)" stroke="transparent" />
                        <Line type="monotone" dataKey="score"
                          stroke="var(--color-primary)" strokeWidth={1.5}
                          dot={<ScoreDot />} activeDot={{ r: 5 }} isAnimationActive={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                {/* ── FILA: HISTOGRAMA + TASA HORARIA ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  {/* Histograma de distribución de scores */}
                  <ChartCard
                    title="Distribución de Scores"
                    subtitle="Histograma · barras rojas = zona anómala (score < 0)"
                    height="240px">
                    {histData.length === 0 ? (
                      <div className="h-full flex items-center justify-center opacity-30 text-sm">Sin datos</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={histData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} />
                          <XAxis dataKey="range" tick={{ fontSize: 9, fill: 'var(--color-text)', opacity: 0.4 }}
                            interval="preserveStartEnd" tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: 'var(--color-text)', opacity: 0.4 }}
                            tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip content={<HistTooltip />} />
                          <ReferenceLine x="0.000" stroke="#ef4444" strokeDasharray="4 2" strokeOpacity={0.5} />
                          <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={28}>
                            {histData.map((entry, i) => (
                              <Cell key={i}
                                fill={entry.isAnomaly ? '#ef4444' : '#10b981'}
                                fillOpacity={0.75} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>

                  {/* Tasa de anomalías por hora */}
                  <ChartCard
                    title="Anomalías por Hora"
                    subtitle="Total de inferencias (gris) vs anomalías detectadas (rojo)"
                    height="240px">
                    {hourlyData.length === 0 ? (
                      <div className="h-full flex items-center justify-center opacity-30 text-sm">Sin datos</div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hourlyData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} />
                          <XAxis dataKey="hora" tick={{ fontSize: 10, fill: 'var(--color-text)', opacity: 0.4 }}
                            tickLine={false} axisLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: 'var(--color-text)', opacity: 0.4 }}
                            tickLine={false} axisLine={false} allowDecimals={false} />
                          <Tooltip
                            formatter={(v, name) => [v, name === 'total' ? 'Total' : 'Anomalías']}
                            contentStyle={{ backgroundColor: 'var(--color-card)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 8, fontSize: 12 }} />
                          <Legend formatter={v => v === 'total' ? 'Total inferencias' : 'Anomalías'}
                            wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="total"     fill="#6b7280" fillOpacity={0.35} radius={[2, 2, 0, 0]} maxBarSize={20} />
                          <Bar dataKey="anomalias" fill="#ef4444" fillOpacity={0.75} radius={[2, 2, 0, 0]} maxBarSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </ChartCard>
                </div>

                {/* ── GRÁFICO 4: COMPARATIVA DE FEATURES ── */}
                <ChartCard
                  title="Comparativa de Sensores: Anomalías vs Normal"
                  subtitle="Promedio de cada feature — azul = lecturas anómalas · verde = lecturas normales"
                  height="260px">
                  {featureComp.every(f => f.anomalia === 0 && f.normal === 0) ? (
                    <div className="h-full flex items-center justify-center opacity-30 text-sm">
                      Sin suficientes datos para comparar (necesita anomalías y normales)
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={featureComp} layout="vertical"
                        margin={{ top: 8, right: 24, left: 60, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.4} horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--color-text)', opacity: 0.4 }}
                          tickLine={false} axisLine={false} />
                        <YAxis type="category" dataKey="feature"
                          tick={{ fontSize: 11, fill: 'var(--color-text)', opacity: 0.7 }}
                          tickLine={false} axisLine={false} width={58} />
                        <Tooltip
                          formatter={(v, name) => [v.toFixed(2), name === 'anomalia' ? 'Anomalías (prom)' : 'Normal (prom)']}
                          contentStyle={{ backgroundColor: 'var(--color-card)',
                                          border: '1px solid var(--color-border)',
                                          borderRadius: 8, fontSize: 12 }} />
                        <Legend formatter={v => v === 'anomalia' ? 'Promedio en anomalías' : 'Promedio en normales'}
                          wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="anomalia" fill="#ef4444" fillOpacity={0.7} radius={[0, 3, 3, 0]} maxBarSize={16} />
                        <Bar dataKey="normal"   fill="#10b981" fillOpacity={0.7} radius={[0, 3, 3, 0]} maxBarSize={16} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </ChartCard>

                {/* ── NOTA INFORMATIVA ── */}
                <div className="rounded-xl border px-5 py-4 flex items-start gap-3"
                  style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                  <FiInfo size={15} className="shrink-0 mt-0.5 opacity-40" />
                  <div className="text-xs opacity-50 space-y-1.5">
                    <p>
                      <strong className="opacity-80">Distribución de scores:</strong> Un modelo
                      bien calibrado tiene la mayoría de scores positivos (zona verde) con pocas
                      detecciones en la zona negativa (roja). Si hay muchas barras rojas, considera
                      ajustar el parámetro <code className="opacity-80">contamination</code> en el entrenamiento.
                    </p>
                    <p>
                      <strong className="opacity-80">Comparativa de features:</strong> Si el promedio
                      de un sensor es significativamente diferente entre anomalías y normales, ese
                      sensor contribuye más a las detecciones. Esto ayuda a entender qué está causando
                      las alertas.
                    </p>
                    <p>
                      <strong className="opacity-80">Re-entrenamiento:</strong> Con 2-4 semanas de datos
                      reales del ESP32, re-ejecuta <code className="opacity-80">entrenar_modelo.py</code> y
                      reemplaza los <code className="opacity-80">.pkl</code> en la Raspberry Pi.
                    </p>
                  </div>
                </div>

              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
