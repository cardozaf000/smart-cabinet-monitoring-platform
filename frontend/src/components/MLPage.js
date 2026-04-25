/**
 * MLPage.js — Detección de Anomalías con Isolation Forest
 * Rediseño: estado claro, desglose de sensores, gráfico de tendencia, historial.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, ComposedChart, Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import {
  FiRefreshCcw, FiCheckCircle, FiAlertTriangle, FiCpu,
  FiActivity, FiClock, FiThermometer, FiDroplet, FiSun,
  FiWind, FiEye, FiLock, FiMaximize2, FiTrendingUp,
  FiChevronDown, FiChevronUp, FiXCircle, FiInfo, FiBarChart2,
} from 'react-icons/fi';
import { BACKEND } from '../utils/api';
import MLDashboard from './MLDashboard';

/* ────────────────────────────────────────────────────────────
   DEFINICION DE FEATURES PARA EL DESGLOSE VISUAL
   Cada feature sabe cómo mostrarse y cuándo marcarse como
   potencialmente anómala.
──────────────────────────────────────────────────────────── */
const FEATURE_DEFS = [
  {
    key: 'temperatura', label: 'Temperatura', icon: FiThermometer,
    fmt: (v) => `${Number(v).toFixed(1)} °C`,
    alert: (v) => v > 28 || v < 15,
    warn:  (v) => v > 25 || v < 18,
  },
  {
    key: 'humedad', label: 'Humedad', icon: FiDroplet,
    fmt: (v) => `${Number(v).toFixed(0)} %`,
    alert: (v) => v > 80 || v < 20,
    warn:  (v) => v > 70 || v < 30,
  },
  {
    key: 'luz', label: 'Luminosidad', icon: FiSun,
    fmt: (v) => `${Number(v).toFixed(0)} lux`,
    alert: () => false,
    warn:  () => false,
  },
  {
    key: 'distancia', label: 'Distancia', icon: FiMaximize2,
    fmt: (v) => `${Number(v).toFixed(0)} mm`,
    alert: () => false,
    warn:  () => false,
  },
  {
    key: 'humo', label: 'Humo / Gas', icon: FiWind,
    fmt: (v) => `${Number(v).toFixed(0)} ppm`,
    alert: (v) => v > 300,
    warn:  (v) => v > 100,
  },
  {
    key: 'movimiento', label: 'Movimiento', icon: FiEye,
    fmt: (v) => (v ? 'Detectado' : 'Sin movimiento'),
    alert: () => false,
    warn:  () => false,
    bool: true,
  },
  {
    key: 'reed', label: 'Puerta', icon: FiLock,
    fmt: (v) => (v ? 'Abierta' : 'Cerrada'),
    alert: () => false,
    warn:  () => false,
    bool: true,
  },
  {
    key: 'mpu6050', label: 'IMU / Posición', icon: FiActivity,
    fmt: (v) => (v ? 'Anomalía física' : 'Normal'),
    alert: (v) => !!v,
    warn:  () => false,
    bool: true,
  },
];

/* ────────────────────────────────────────────────────────────
   HELPERS
──────────────────────────────────────────────────────────── */
function parseFeatures(raw) {
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return {}; }
}

function timeAgo(tsStr) {
  if (!tsStr) return '—';
  const diff = Math.floor((Date.now() - new Date(tsStr).getTime()) / 1000);
  if (diff < 60)   return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  return `hace ${Math.floor(diff / 3600)}h`;
}

/* ────────────────────────────────────────────────────────────
   SUBCOMPONENTES
──────────────────────────────────────────────────────────── */

/* Dot animado verde */
function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
        style={{ backgroundColor: '#10b981' }} />
      <span className="relative inline-flex rounded-full h-2 w-2"
        style={{ backgroundColor: '#10b981' }} />
    </span>
  );
}

/* ---- Hero de estado actual ---- */
function StatusHero({ ultima, loading }) {
  if (loading && !ultima) {
    return (
      <div className="rounded-2xl border p-6 flex items-center gap-4 animate-pulse"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <div className="w-14 h-14 rounded-2xl" style={{ backgroundColor: 'var(--color-border)' }} />
        <div className="space-y-2 flex-1">
          <div className="h-4 rounded w-40" style={{ backgroundColor: 'var(--color-border)' }} />
          <div className="h-6 rounded w-28" style={{ backgroundColor: 'var(--color-border)' }} />
        </div>
      </div>
    );
  }

  if (!ultima) {
    return (
      <div className="rounded-2xl border p-6 flex items-center gap-4"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ backgroundColor: 'color-mix(in srgb,#6b7280 15%,transparent)', color: '#9ca3af' }}>
          <FiCpu size={24} />
        </div>
        <div>
          <p className="text-sm opacity-40">Sin inferencias aún</p>
          <p className="text-lg font-bold mt-0.5" style={{ color: 'var(--color-text)' }}>
            Esperando datos del microservicio ML
          </p>
          <p className="text-xs opacity-30 mt-1">El modelo ejecuta cada 10 minutos</p>
        </div>
      </div>
    );
  }

  const isAnomaly = ultima.es_anomalia;
  const score     = Number(ultima.score_anomalia ?? 0);
  const color     = isAnomaly ? '#ef4444' : '#10b981';
  const bgColor   = isAnomaly ? '#ef444420' : '#10b98120';
  const borderC   = isAnomaly ? '#ef444440' : '#10b98140';

  return (
    <div className="rounded-2xl border p-5 flex flex-wrap items-center gap-4"
      style={{ backgroundColor: 'var(--color-card)', borderColor: borderC }}>

      {/* Icono de estado */}
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: bgColor, color }}>
        {isAnomaly
          ? <FiAlertTriangle size={26} />
          : <FiCheckCircle   size={26} />}
      </div>

      {/* Estado principal */}
      <div className="flex-1 min-w-[140px]">
        <p className="text-xs font-semibold uppercase tracking-wider opacity-50">Estado del gabinete</p>
        <p className="text-2xl font-bold mt-0.5" style={{ color }}>
          {isAnomaly ? 'Anomalía detectada' : 'Operación normal'}
        </p>
        <p className="text-xs opacity-40 mt-1 flex items-center gap-1">
          <FiClock size={11} />
          Última inferencia: {timeAgo(ultima.timestamp)} ({ultima.timestamp})
        </p>
      </div>

      {/* Score numérico */}
      <div className="text-right shrink-0">
        <p className="text-xs opacity-40 uppercase tracking-wide font-semibold">Score IF</p>
        <p className="text-3xl font-bold font-mono mt-0.5" style={{ color }}>
          {score.toFixed(4)}
        </p>
        <p className="text-[11px] opacity-40 mt-0.5">
          {score < 0 ? '← anómalo' : '→ normal'} · umbral: 0
        </p>
      </div>
    </div>
  );
}

/* ---- Card de un sensor / feature ---- */
function FeatureCard({ def, value }) {
  const Icon = def.icon;
  const v    = Number(value);
  const isAlert = !def.bool ? def.alert(v) : def.alert(v);
  const isWarn  = !def.bool ? def.warn(v)  : false;

  let color  = '#10b981';
  let bgCol  = '#10b98118';
  let border = '#10b98130';
  if (isAlert) { color = '#ef4444'; bgCol = '#ef444418'; border = '#ef444430'; }
  else if (isWarn) { color = '#f59e0b'; bgCol = '#f59e0b18'; border = '#f59e0b30'; }

  if (value === undefined || value === null) {
    color = '#6b7280'; bgCol = '#6b728018'; border = '#6b728030';
  }

  return (
    <div className="rounded-xl border p-3.5 flex items-start gap-3"
      style={{ backgroundColor: 'var(--color-bg)', borderColor: border }}>
      <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: bgCol, color }}>
        <Icon size={15} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] opacity-50 font-medium truncate">{def.label}</p>
        <p className="text-sm font-bold mt-0.5" style={{ color: 'var(--color-text)' }}>
          {value === undefined || value === null ? '—' : def.fmt(value)}
        </p>
        {isAlert && (
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#ef4444' }}>
            Fuera de rango
          </p>
        )}
        {isWarn && !isAlert && (
          <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#f59e0b' }}>
            Valor alto
          </p>
        )}
      </div>
    </div>
  );
}

/* ---- Grid de sensores de la última lectura ---- */
function FeatureBreakdown({ item }) {
  const features = parseFeatures(item?.features_json);
  const hasData  = Object.keys(features).length > 0;

  if (!hasData) return null;

  const isAnomaly = item.es_anomalia;
  const borderC   = isAnomaly ? '#ef444430' : 'var(--color-border)';

  return (
    <div className="rounded-2xl border" style={{ backgroundColor: 'var(--color-card)', borderColor: borderC }}>
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b" style={{ borderColor: borderC }}>
        <FiCpu size={14} className="opacity-50" />
        <div>
          <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">
            Sensores en la última inferencia
          </h2>
          <p className="text-xs mt-0.5 opacity-40">
            {item.timestamp} ·
            {isAnomaly
              ? ' Patrón inusual detectado — revisa los valores resaltados'
              : ' Todos los sensores dentro de parámetros normales'}
          </p>
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {FEATURE_DEFS.map(def => (
          <FeatureCard key={def.key} def={def} value={features[def.key]} />
        ))}
      </div>
      {/* Nota sobre hora_sin/hora_cos/temp_rate */}
      <div className="px-5 pb-4 flex items-start gap-2">
        <FiInfo size={11} className="opacity-30 mt-0.5 shrink-0" />
        <p className="text-[11px] opacity-30">
          El modelo también considera la <strong>tendencia de temperatura</strong> y la{' '}
          <strong>hora del día</strong> — combinaciones de sensores pueden activar la detección
          aunque ningún valor individual esté fuera de rango.
        </p>
      </div>
    </div>
  );
}

/* ---- Tooltip personalizado para el gráfico ---- */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const isAnomaly = d.es_anomalia;
  const score     = Number(d.score);

  return (
    <div className="rounded-xl border px-3 py-2.5 text-xs shadow-xl"
      style={{ backgroundColor: 'var(--color-card)', borderColor: isAnomaly ? '#ef444450' : '#10b98150' }}>
      <p className="font-mono opacity-60 mb-1">{label}</p>
      <p className="font-bold text-sm" style={{ color: isAnomaly ? '#ef4444' : '#10b981' }}>
        {isAnomaly ? 'Anomalía' : 'Normal'}
      </p>
      <p className="font-mono opacity-70 mt-0.5">Score: {score.toFixed(5)}</p>
    </div>
  );
}

/* ---- Punto personalizado en el gráfico ---- */
function ChartDot(props) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const color = payload?.es_anomalia ? '#ef4444' : '#10b981';
  return <circle cx={cx} cy={cy} r={3} fill={color} strokeWidth={0} />;
}

/* ---- Panel del gráfico de tendencia ---- */
function ScoreChart({ historico, loading }) {
  if (loading) {
    return (
      <div className="h-52 flex items-center justify-center opacity-30">
        <div className="animate-spin rounded-full h-6 w-6 border-t-2"
          style={{ borderColor: 'var(--color-primary)' }} />
      </div>
    );
  }

  if (!historico.length) {
    return (
      <div className="h-52 flex items-center justify-center opacity-30 text-sm">
        Sin datos históricos para mostrar
      </div>
    );
  }

  return (
    <div className="h-56 px-2 pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={historico} margin={{ top: 4, right: 12, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#6b7280" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#6b7280" stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" strokeOpacity={0.5} />

          <XAxis
            dataKey="timestamp"
            tick={{ fontSize: 10, fill: 'var(--color-text)', opacity: 0.4 }}
            interval="preserveStartEnd"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={['auto', 'auto']}
            tick={{ fontSize: 10, fill: 'var(--color-text)', opacity: 0.4 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => v.toFixed(2)}
          />

          <Tooltip content={<ChartTooltip />} />

          {/* Línea del umbral de anomalía */}
          <ReferenceLine
            y={0}
            stroke="#ef4444"
            strokeDasharray="6 3"
            strokeOpacity={0.6}
            label={{ value: 'Umbral anomalía', position: 'insideTopRight', fontSize: 10, fill: '#ef4444', opacity: 0.7 }}
          />

          {/* Área de relleno */}
          <Area
            type="monotone"
            dataKey="score"
            fill="url(#scoreGrad)"
            stroke="transparent"
          />

          {/* Línea del score con puntos coloreados por tipo */}
          <Line
            type="monotone"
            dataKey="score"
            stroke="var(--color-primary)"
            strokeWidth={1.5}
            dot={<ChartDot />}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────
   COMPONENTE PRINCIPAL
──────────────────────────────────────────────────────────── */
export default function MLPage() {
  const [anomalias,    setAnomalias]    = useState([]);
  const [historico,    setHistorico]    = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [loadChart,    setLoadChart]    = useState(false);
  const [err,          setErr]          = useState('');
  const [soloAnomalias, setSoloAnomalias] = useState(false);
  const [limit,         setLimit]        = useState(50);
  const [chartOpen,    setChartOpen]    = useState(false);
  const [chartHoras,   setChartHoras]   = useState(24);
  const [dashOpen,     setDashOpen]     = useState(false);

  /* ---- Carga inferencias ---- */
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setErr('');
      const params = new URLSearchParams({ limit, solo_anomalias: soloAnomalias });
      const res  = await fetch(`${BACKEND}/api/anomalias?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setAnomalias(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [limit, soloAnomalias]);

  /* ---- Carga datos del gráfico ---- */
  const loadHistorico = useCallback(async () => {
    try {
      setLoadChart(true);
      const params = new URLSearchParams({ horas: chartHoras, limit: 300 });
      const res  = await fetch(`${BACKEND}/api/anomalias/historico?${params}`);
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setHistorico(Array.isArray(data) ? data : []);
    } catch {
      setHistorico([]);
    } finally {
      setLoadChart(false);
    }
  }, [chartHoras]);

  useEffect(() => { loadData(); }, [loadData]);

  /* Cargar historial cuando se abre el gráfico o cambia la ventana */
  useEffect(() => {
    if (chartOpen) loadHistorico();
  }, [chartOpen, loadHistorico]);

  /* Auto-refresh cada 2 min cuando el gráfico está abierto */
  useEffect(() => {
    if (!chartOpen) return;
    const t = setInterval(loadHistorico, 120_000);
    return () => clearInterval(t);
  }, [chartOpen, loadHistorico]);

  /* ---- Revisar anomalía ---- */
  const handleRevisar = async (id, valor) => {
    try {
      await fetch(`${BACKEND}/api/anomalias/${id}/revisar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revisado: valor }),
      });
      setAnomalias(prev => prev.map(a => a.id === id ? { ...a, revisado: valor } : a));
    } catch (e) {
      alert('Error al actualizar: ' + e.message);
    }
  };

  /* ---- Estadísticas ---- */
  const ultima         = anomalias[0] ?? null;
  const totalAnomalias = anomalias.filter(a => a.es_anomalia).length;
  const sinRevisar     = anomalias.filter(a => a.es_anomalia && !a.revisado).length;
  const tasa           = anomalias.length > 0
    ? ((totalAnomalias / anomalias.length) * 100).toFixed(1)
    : '—';

  /* ── RENDER ── */
  return (
    <>
    <div className="space-y-5 pb-6" style={{ color: 'var(--color-text)' }}>

      {/* ====== HEADER ====== */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <LiveDot />
          <h1 className="text-2xl font-bold tracking-tight">Detección ML</h1>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'color-mix(in srgb,var(--color-primary) 15%,transparent)', color: 'var(--color-primary)' }}>
            Isolation Forest
          </span>
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 ml-1"
              style={{ borderColor: 'var(--color-primary)' }} />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Botón Estadísticas (overlay completo) */}
          <button
            onClick={() => setDashOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: 'var(--color-primary)' }}>
            <FiBarChart2 size={14} />
            Estadísticas
          </button>

          {/* Botón gráfico rápido inline */}
          <button
            onClick={() => setChartOpen(v => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition hover:opacity-80"
            style={{ borderColor: chartOpen ? 'var(--color-primary)' : 'var(--color-border)',
                     color: chartOpen ? 'var(--color-primary)' : 'var(--color-text)' }}>
            <FiTrendingUp size={14} />
            {chartOpen ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
          </button>

          <button onClick={loadData} disabled={loading}
            className="p-2 rounded-lg border hover:opacity-80 transition disabled:opacity-40"
            style={{ borderColor: 'var(--color-border)' }} title="Recargar">
            <FiRefreshCcw size={14} />
          </button>
        </div>
      </div>

      {/* ====== ERROR ====== */}
      {err && (
        <div className="flex items-center gap-2 text-sm px-4 py-3 rounded-xl"
          style={{ backgroundColor: 'color-mix(in srgb,#ef4444 12%,transparent)', border: '1px solid #ef444430', color: '#f87171' }}>
          <FiXCircle size={14} /> {err}
        </div>
      )}

      {/* ====== HERO: ESTADO ACTUAL ====== */}
      <StatusHero ultima={ultima} loading={loading} />

      {/* ====== GRAFICO DE TENDENCIA (toggle) ====== */}
      {chartOpen && (
        <div className="rounded-2xl border" style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
          {/* Cabecera gráfico */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b"
            style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">
                Tendencia del Score de Anomalía
              </h2>
              <p className="text-xs mt-0.5 opacity-40">
                Puntos <span style={{ color: '#ef4444' }}>rojos</span> = anomalía ·
                Puntos <span style={{ color: '#10b981' }}>verdes</span> = normal ·
                Línea roja = umbral 0
              </p>
            </div>
            {/* Selector de ventana temporal */}
            <div className="flex items-center gap-1.5">
              {[6, 12, 24, 48].map(h => (
                <button key={h}
                  onClick={() => setChartHoras(h)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold transition"
                  style={{
                    backgroundColor: chartHoras === h
                      ? 'var(--color-primary)'
                      : 'color-mix(in srgb,var(--color-primary) 10%,transparent)',
                    color: chartHoras === h ? '#fff' : 'var(--color-text)',
                    opacity: chartHoras === h ? 1 : 0.6,
                  }}>
                  {h}h
                </button>
              ))}
              <button onClick={loadHistorico} disabled={loadChart}
                className="p-1.5 rounded-lg border opacity-50 hover:opacity-100 transition ml-1"
                style={{ borderColor: 'var(--color-border)' }} title="Actualizar gráfico">
                <FiRefreshCcw size={12} className={loadChart ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Gráfico */}
          <ScoreChart historico={historico} loading={loadChart} />

          {/* Leyenda */}
          <div className="px-5 pb-4 pt-1 flex items-start gap-2">
            <FiInfo size={11} className="opacity-30 mt-0.5 shrink-0" />
            <p className="text-[11px] opacity-30">
              Valores <strong>por debajo de 0</strong> indican un patrón inusual.
              Cuanto más negativo, más alejado del comportamiento normal del gabinete.
              Se actualiza automáticamente cada 2 minutos.
            </p>
          </div>
        </div>
      )}

      {/* ====== DESGLOSE DE SENSORES (última inferencia) ====== */}
      {ultima && <FeatureBreakdown item={ultima} />}

      {/* ====== ESTADÍSTICAS RÁPIDAS ====== */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Anomalías detectadas', value: totalAnomalias, color: '#ef4444',
            sub: `de ${anomalias.length} inferencias` },
          { label: 'Tasa de anomalías', value: `${tasa} %`, color: '#f59e0b',
            sub: 'normal < 5 %' },
          { label: 'Sin revisar', value: sinRevisar, color: sinRevisar > 0 ? '#f59e0b' : '#10b981',
            sub: 'anomalías pendientes' },
          { label: 'Lecturas normales', value: anomalias.length - totalAnomalias, color: '#10b981',
            sub: `de ${anomalias.length} total` },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="rounded-xl border p-4 flex flex-col gap-1"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
            <span className="text-2xl font-bold" style={{ color }}>{value}</span>
            <span className="text-xs font-semibold uppercase tracking-wide opacity-50">{label}</span>
            {sub && <span className="text-[11px] opacity-35">{sub}</span>}
          </div>
        ))}
      </div>

      {/* ====== HISTORIAL DE INFERENCIAS ====== */}
      <div className="rounded-2xl border"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>

        {/* Filtros */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--color-border)' }}>
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">
              Historial de inferencias
            </h2>
            <p className="text-xs mt-0.5 opacity-40">
              {anomalias.length} registros · intervalo: 10 min
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs opacity-60 cursor-pointer select-none">
              <input type="checkbox" checked={soloAnomalias}
                onChange={e => setSoloAnomalias(e.target.checked)} className="rounded" />
              Solo anomalías
            </label>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))}
              className="text-xs px-2 py-1 rounded-lg border"
              style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
              {[20, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full" style={{ color: 'var(--color-text)' }}>
            <thead>
              <tr className="text-xs tracking-wider uppercase"
                style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Timestamp</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Estado</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Score</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Temp</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Hum</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Humo</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Luz</th>
                <th className="py-2.5 px-4 text-center font-semibold opacity-55">Revisado</th>
              </tr>
            </thead>
            <tbody>
              {anomalias.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm opacity-30">
                    {soloAnomalias
                      ? 'No hay anomalías sin revisar.'
                      : 'Sin datos. El microservicio ML ejecuta cada 10 minutos.'}
                  </td>
                </tr>
              )}
              {anomalias.map((a, i) => {
                const feat  = parseFeatures(a.features_json);
                const score = Number(a.score_anomalia ?? 0);
                const pct   = Math.min(100, Math.max(0, ((score + 0.5) / 1.0) * 100));
                const barColor = score < 0 ? '#ef4444' : score < 0.05 ? '#f59e0b' : '#10b981';

                return (
                  <tr key={a.id}
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      backgroundColor: a.es_anomalia
                        ? 'color-mix(in srgb,#ef4444 5%,transparent)'
                        : (i % 2 !== 0 ? 'color-mix(in srgb,var(--color-bg) 30%,transparent)' : 'transparent'),
                    }}>

                    <td className="py-2.5 px-4">
                      <span className="text-xs font-mono opacity-70">{a.timestamp}</span>
                    </td>

                    <td className="py-2.5 px-4">
                      {a.es_anomalia ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#ef444422', color: '#f87171', border: '1px solid #ef444440' }}>
                          <FiAlertTriangle size={10} /> Anomalía
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#10b98122', color: '#34d399', border: '1px solid #10b98140' }}>
                          <FiCheckCircle size={10} /> Normal
                        </span>
                      )}
                    </td>

                    {/* Score con barra */}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2 w-36">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                          style={{ backgroundColor: 'var(--color-border)' }}>
                          <div className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: barColor }} />
                        </div>
                        <span className="text-[11px] font-mono opacity-60 shrink-0">
                          {score.toFixed(4)}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-4 text-xs font-mono">
                      {feat.temperatura != null ? `${Number(feat.temperatura).toFixed(1)}°C` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono">
                      {feat.humedad != null ? `${Number(feat.humedad).toFixed(0)}%` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono">
                      {feat.humo != null ? `${Number(feat.humo).toFixed(0)} ppm` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-xs font-mono">
                      {feat.luz != null ? `${Number(feat.luz).toFixed(0)} lux` : '—'}
                    </td>

                    {/* Botón revisar */}
                    <td className="py-2.5 px-4 text-center">
                      {a.es_anomalia ? (
                        <button
                          onClick={() => handleRevisar(a.id, !a.revisado)}
                          title={a.revisado ? 'Marcar como no revisado' : 'Confirmar revisión'}
                          className="p-1.5 rounded-lg border transition hover:opacity-100"
                          style={{
                            borderColor: a.revisado ? '#10b98140' : 'var(--color-border)',
                            color:       a.revisado ? '#10b981'   : 'var(--color-text)',
                            opacity:     a.revisado ? 1 : 0.4,
                          }}>
                          <FiCheckCircle size={14} />
                        </button>
                      ) : (
                        <span className="text-xs opacity-20">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ====== INFO BOX ====== */}
      <div className="rounded-xl border px-5 py-4 flex items-start gap-3"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <FiCpu size={16} className="shrink-0 mt-0.5 opacity-40" />
        <div className="text-xs opacity-50 space-y-1.5">
          <p>
            <strong className="opacity-80">¿Qué detecta?</strong> Combinaciones inusuales entre
            todos los sensores, incluso si cada valor individual está dentro del rango normal.
            Por ejemplo: temperatura normal + humedad alta + sin movimiento a las 3am puede ser anómalo.
          </p>
          <p>
            <strong className="opacity-80">Score:</strong> Isolation Forest asigna un score por
            cada muestra. Valores <strong>negativos (bajo 0)</strong> = anomalía; más negativo =
            más inusual. El modelo fue entrenado con los patrones normales del gabinete.
          </p>
          <p>
            <strong className="opacity-80">Inferencia:</strong> Cada 10 minutos el microservicio
            (ml_service.py) lee los últimos 10 min de sensores, construye el vector de features
            y evalúa con el modelo entrenado.
          </p>
          <p>
            <strong className="opacity-80">Revisado:</strong> Marca las anomalías para indicar
            que fueron verificadas. Esto genera retroalimentación para futuros re-entrenamientos.
          </p>
        </div>
      </div>

    </div>

    {/* ====== DASHBOARD OVERLAY (pantalla completa) ====== */}
    {dashOpen && <MLDashboard onClose={() => setDashOpen(false)} />}
    </>
  );
}
