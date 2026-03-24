/**
 * SensorDashboard.js
 * Pantalla completa de análisis de un sensor individual.
 * Abre como overlay encima de la página de sensores.
 * Incluye: info del sensor, estadísticas, gráficos múltiples con zoom.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import Portal from "./Portal";
import {
  FiX, FiActivity, FiBarChart2, FiRefreshCcw, FiCheckCircle,
  FiTrendingUp, FiTrendingDown, FiMinus, FiClock, FiCpu,
  FiAlertTriangle, FiZap, FiHash, FiCalendar,
} from "react-icons/fi";
import { BACKEND } from "../utils/api";
import { authHeader } from "../utils/auth";
import ChartRenderer from "./ChartRenderer";

/* ── Rangos ─────────────────────────────────────────────────── */
const RANGES = [
  { label: "1h",  unit: "horas",  timeRange: { kind: "lastN", unit: "hours", value: 1  }, ms: 1  * 3_600_000, limit: 2000 },
  { label: "6h",  unit: "horas",  timeRange: { kind: "lastN", unit: "hours", value: 6  }, ms: 6  * 3_600_000, limit: 3000 },
  { label: "24h", unit: "horas",  timeRange: { kind: "lastN", unit: "hours", value: 24 }, ms: 24 * 3_600_000, limit: 4000 },
  { label: "7d",  unit: "días",   timeRange: { kind: "lastN", unit: "days",  value: 7  }, ms: 7  * 86_400_000, limit: 5000 },
  { label: "30d", unit: "días",   timeRange: { kind: "lastN", unit: "days",  value: 30 }, ms: 30 * 86_400_000, limit: 5000 },
];

/* ── Helpers ─────────────────────────────────────────────────── */
function computeStats(values) {
  if (!values || values.length === 0) return null;
  const n    = values.length;
  const min  = Math.min(...values);
  const max  = Math.max(...values);
  const avg  = values.reduce((s, v) => s + v, 0) / n;
  const std  = Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / n);
  const last = values[n - 1];
  return { min, max, avg, std, count: n, last };
}

function fmtDuration(ms) {
  if (!ms || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function fmtTs(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("es-CR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function relAgo(ts) {
  if (!ts) return null;
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 10)   return "ahora";
  if (d < 60)   return `${Math.round(d)}s`;
  if (d < 3600) return `${Math.round(d / 60)} min`;
  return `${Math.round(d / 3600)}h`;
}

/* ── Sub-componentes ─────────────────────────────────────────── */
function StatCard({ label, value, unit, color, Icon, sub }) {
  return (
    <div className="flex flex-col p-4 rounded-2xl border"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card)" }}>
      <div className="flex items-center gap-2 mb-3">
        {Icon && <Icon size={13} style={{ color, flexShrink: 0 }} />}
        <span className="text-[11px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--color-text)", opacity: 0.5 }}>
          {label}
        </span>
      </div>
      <span className="text-3xl font-bold tabular-nums leading-none" style={{ color }}>
        {value != null ? Number(value).toFixed(2) : "—"}
      </span>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        {unit && <span className="text-xs" style={{ color: "var(--color-text)", opacity: 0.4 }}>{unit}</span>}
        {sub  && <span className="text-[10px]" style={{ color: "var(--color-text)", opacity: 0.3 }}>{sub}</span>}
      </div>
    </div>
  );
}

function InfoRow({ label, value, Icon }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b"
      style={{ borderColor: "var(--color-border)" }}>
      <div className="flex items-center gap-1.5 w-36 shrink-0">
        {Icon && <Icon size={12} style={{ color: "var(--color-primary)", opacity: 0.7 }} />}
        <span className="text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--color-text)", opacity: 0.45 }}>
          {label}
        </span>
      </div>
      <span className="text-sm font-mono" style={{ color: "var(--color-text)" }}>
        {value || "—"}
      </span>
    </div>
  );
}

function ChartCard({ title, subtitle, children, height = "260px" }) {
  return (
    <div className="rounded-2xl border overflow-hidden flex flex-col"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card)" }}>
      <div className="px-4 py-3 border-b flex items-center gap-2"
        style={{ borderColor: "var(--color-border)" }}>
        <FiBarChart2 size={13} style={{ color: "var(--color-primary)" }} />
        <div>
          <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{title}</p>
          {subtitle && (
            <p className="text-[10px] mt-0.5" style={{ color: "var(--color-text)", opacity: 0.35 }}>{subtitle}</p>
          )}
        </div>
      </div>
      <div style={{ height, padding: "4px" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Componente principal ─────────────────────────────────────── */
export default function SensorDashboard({ sensor, lastReading, isAdded, onClose, onAddToDashboard }) {
  const [rangeIdx, setRangeIdx] = useState(2); // 24h
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [unit,     setUnit]     = useState("");

  const sensorId = String(sensor.id);
  const measure  = String(sensor.type ?? "");

  /* ── Fetch de historial ── */
  const fetchData = useCallback(async () => {
    const r = RANGES[rangeIdx];
    setLoading(true); setError(null);
    try {
      const from = new Date(Date.now() - r.ms);
      const toISO = (d) => {
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };
      const params = new URLSearchParams({
        sensorId, tipo: measure,
        from: toISO(from),
        limit: String(r.limit),
      });
      const res = await fetch(`${BACKEND}/historico?${params}`, { headers: authHeader() });
      if (!res.ok) throw new Error("Error al cargar historial");
      const raw = await res.json();
      const norm = raw
        .filter(d => d.valor != null && d.timestamp)
        .map(d => ({
          sensorId, tipo: measure,
          valor: Number(d.valor),
          unidad: d.unidad || "",
          timestamp: d.timestamp,
        }));
      if (norm.length > 0) setUnit(norm[0].unidad);
      setData(norm);
    } catch (e) { setError(e.message); setData([]); }
    finally { setLoading(false); }
  }, [sensorId, measure, rangeIdx]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Escape para cerrar ── */
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  /* ── Bloquear scroll del fondo ── */
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  /* ── Stats derivadas ── */
  const stats = useMemo(() => computeStats(data.map(d => d.valor)), [data]);

  const firstTs   = data.length > 0 ? data[0].timestamp : null;
  const lastTs    = data.length > 0 ? data[data.length - 1].timestamp : null;
  const uptimeMs  = firstTs ? Date.now() - new Date(firstTs).getTime() : null;
  const activeNow = lastTs  ? (Date.now() - new Date(lastTs).getTime()) < 5 * 60 * 1000 : false;

  const range = RANGES[rangeIdx];

  /* ── Configs de gráficos ── */
  const mainCfg = {
    chartType: "area", sensorId, measure,
    timeRange: range.timeRange, decimals: 2, unitOverride: unit,
    enableZoom: true,
  };
  const lineCfg = {
    chartType: "line", sensorId, measure,
    timeRange: range.timeRange, decimals: 2, unitOverride: unit,
    enableZoom: true,
  };
  const barCfg = {
    chartType: "bar", sensorId, measure,
    timeRange: range.timeRange, decimals: 2, unitOverride: unit,
    enableZoom: true,
  };
  const sparkCfg = {
    chartType: "stat-spark", sensorId, measure,
    timeRange: range.timeRange, decimals: 2, unitOverride: unit,
  };
  const scatterCfg = {
    chartType: "scatter", sensorId, measure,
    timeRange: range.timeRange, decimals: 2, unitOverride: unit,
    enableZoom: true,
  };
  const heatCfg = {
    chartType: "heatmap", sensorId, measure,
    timeRange: { kind: "lastN", unit: "days", value: 7 },
    decimals: 2, unitOverride: unit,
  };

  return (
    <Portal>
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        backgroundColor: "var(--color-bg)",
        display: "flex", flexDirection: "column",
        overflowY: "auto",
      }}
    >
      {/* ══════════════════════════════════════════
          BARRA SUPERIOR
      ══════════════════════════════════════════ */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b sticky top-0 z-10 flex-shrink-0"
        style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}
      >
        {/* Título */}
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 15%, transparent)" }}
          >
            <FiCpu size={17} style={{ color: "var(--color-primary)" }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold truncate" style={{ color: "var(--color-text)" }}>
                {sensor.name || sensor.id}
              </h1>
              <span
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize shrink-0"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
                  color: "var(--color-primary)",
                }}
              >
                {measure}
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: activeNow ? "#10b98118" : "#6b728018",
                  color:           activeNow ? "#10b981"   : "#9ca3af",
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: activeNow ? "#10b981" : "#6b7280" }}
                />
                {activeNow ? "En línea" : "Sin señal reciente"}
              </span>
            </div>
            <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--color-text)", opacity: 0.4 }}>
              ID: {sensor.id}
              {sensor.puerto ? ` · Puerto: ${sensor.puerto}` : ""}
              {lastTs ? ` · Última señal: ${relAgo(lastTs)}` : ""}
            </p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0 ml-4">
          <button
            onClick={onAddToDashboard}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition hover:opacity-80"
            style={{
              borderColor: isAdded ? "#10b981" : "var(--color-primary)",
              color:       isAdded ? "#10b981" : "var(--color-primary)",
              backgroundColor: isAdded
                ? "color-mix(in srgb, #10b981 10%, transparent)"
                : "color-mix(in srgb, var(--color-primary) 8%, transparent)",
            }}
          >
            {isAdded
              ? <><FiCheckCircle size={12} /> En dashboard</>
              : <><FiBarChart2   size={12} /> Añadir al inicio</>
            }
          </button>
          <button
            onClick={fetchData}
            title="Actualizar"
            className="p-2 rounded-lg border transition hover:opacity-80"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            <FiRefreshCcw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={onClose}
            title="Cerrar (Esc)"
            className="p-2 rounded-lg border transition hover:opacity-80"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            <FiX size={14} />
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          CUERPO PRINCIPAL
      ══════════════════════════════════════════ */}
      <div className="flex-1 p-4 sm:p-6 space-y-6 max-w-[1800px] mx-auto w-full">

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
            style={{ backgroundColor: "#ef444415", color: "#fca5a5" }}>
            <FiAlertTriangle size={14} />
            {error}
          </div>
        )}

        {/* ── Fila superior: info + selector de rango ── */}
        <div className="flex flex-wrap items-stretch justify-between gap-4">

          {/* Ficha del sensor */}
          <div
            className="rounded-2xl border p-4 flex-1"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card)", minWidth: 260 }}
          >
            <p className="text-xs font-bold uppercase tracking-wider mb-3"
              style={{ color: "var(--color-primary)", opacity: 0.8 }}>
              Información del sensor
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <InfoRow label="Nombre"       value={sensor.name || "—"}                              Icon={FiCpu}      />
              <InfoRow label="ID / Dir."    value={String(sensor.id)}                               Icon={FiHash}     />
              <InfoRow label="Tipo"         value={measure}                                         Icon={FiActivity} />
              <InfoRow label="Puerto"       value={sensor.puerto || "—"}                            Icon={FiZap}      />
              <InfoRow label="Unidad"       value={unit || "—"}                                     Icon={FiMinus}    />
              <InfoRow label="Lecturas"     value={stats ? stats.count.toLocaleString() + " en período" : "—"} Icon={FiHash} />
              <InfoRow label="1ª lectura"   value={firstTs ? fmtTs(firstTs) : "—"}                  Icon={FiCalendar} />
              <InfoRow label="Últ. lectura" value={lastTs  ? fmtTs(lastTs)  : "—"}                  Icon={FiClock}    />
              <InfoRow label="Uptime aprox." value={uptimeMs ? fmtDuration(uptimeMs) : "—"}         Icon={FiClock}    />
            </div>
          </div>

          {/* Valor actual + selector de rango */}
          <div className="flex flex-col gap-3 self-stretch" style={{ minWidth: 260, maxWidth: 420 }}>
            {/* Selector de rango */}
            <div className="rounded-2xl border p-3"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wider mb-2"
                style={{ color: "var(--color-text)", opacity: 0.4 }}>
                Período de análisis
              </p>
              <div className="flex gap-2 flex-wrap">
                {RANGES.map((r, idx) => (
                  <button key={r.label} onClick={() => setRangeIdx(idx)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-bold border transition"
                    style={{
                      backgroundColor: idx === rangeIdx ? "var(--color-primary)" : "transparent",
                      color:       idx === rangeIdx ? "#fff" : "var(--color-text)",
                      borderColor: idx === rangeIdx ? "var(--color-primary)" : "var(--color-border)",
                    }}>
                    {r.label}
                  </button>
                ))}
              </div>
              {!loading && data.length > 0 && (
                <p className="text-[10px] mt-2" style={{ color: "var(--color-text)", opacity: 0.3 }}>
                  {data.length.toLocaleString()} lecturas · desde{" "}
                  {new Date(Date.now() - range.ms).toLocaleString("es-CR", {
                    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              )}
              {loading && (
                <p className="text-[10px] mt-2 animate-pulse" style={{ color: "var(--color-text)", opacity: 0.3 }}>
                  Cargando datos…
                </p>
              )}
              <p className="text-[10px] mt-2" style={{ color: "var(--color-text)", opacity: 0.25 }}>
                💡 En los gráficos: arrastra para seleccionar un rango · scroll para hacer zoom
              </p>
            </div>

            {/* Valor actual con sparkline — ocupa el espacio restante */}
            <div className="rounded-2xl border overflow-hidden flex flex-col flex-1 min-h-0"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card)", minHeight: 130 }}>
              <div className="px-4 pt-3 pb-1 flex items-center justify-between flex-shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--color-text)", opacity: 0.4 }}>
                  Valor actual · tendencia
                </p>
                {lastReading && (
                  <span className="text-lg font-bold tabular-nums"
                    style={{ color: "var(--color-primary)" }}>
                    {Number(lastReading.valor).toFixed(2)}
                    <span className="text-xs font-normal ml-1 opacity-50">{unit || lastReading.unidad}</span>
                  </span>
                )}
              </div>
              <div className="flex-1 min-h-0">
                <ChartRenderer config={sparkCfg} data={data} height="100%" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Estadísticas ── */}
        {(stats || loading) && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider mb-3"
              style={{ color: "var(--color-text)", opacity: 0.4 }}>
              Estadísticas del período · {range.label}
            </p>
            {stats ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard label="Valor actual" value={stats.last}  unit={unit} color="var(--color-primary)"
                  Icon={FiActivity} sub="última lectura" />
                <StatCard label="Mínimo"       value={stats.min}   unit={unit} color="#3b82f6"
                  Icon={FiTrendingDown} />
                <StatCard label="Máximo"       value={stats.max}   unit={unit} color="#ef4444"
                  Icon={FiTrendingUp} />
                <StatCard label="Promedio"     value={stats.avg}   unit={unit} color="#10b981"
                  Icon={FiMinus} />
                <StatCard label="Desv. Est."   value={stats.std}   unit={unit} color="#8b5cf6"
                  Icon={FiActivity} sub="variabilidad" />
                <StatCard
                  label="Rango"
                  value={stats.max - stats.min}
                  unit={unit}
                  color="#f59e0b"
                  Icon={FiZap}
                  sub={`max − min`}
                />
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-3 animate-pulse">
                {[0,1,2,3,4,5].map(i => (
                  <div key={i} className="h-24 rounded-2xl"
                    style={{ backgroundColor: "var(--color-border)" }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Gráficos ── */}
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-3"
            style={{ color: "var(--color-text)", opacity: 0.4 }}>
            Gráficos históricos · {range.label} — arrastra/scroll para zoom
          </p>

          {data.length === 0 && !loading ? (
            <div className="rounded-2xl border py-16 text-center"
              style={{ borderColor: "var(--color-border)", color: "var(--color-text)", opacity: 0.3 }}>
              Sin datos para el período seleccionado
            </div>
          ) : (
            <div className="space-y-4">

              {/* Gráfico principal — área con zoom */}
              <ChartCard
                title="Serie temporal — Área"
                subtitle="Arrastra en el gráfico o usa el slider inferior para hacer zoom en un período"
                height="300px"
              >
                <ChartRenderer config={mainCfg} data={data} height="300px" />
              </ChartCard>

              {/* Fila: línea + barras */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard
                  title="Serie temporal — Línea"
                  subtitle="Otra perspectiva con línea continua"
                  height="240px"
                >
                  <ChartRenderer config={lineCfg} data={data} height="240px" />
                </ChartCard>
                <ChartCard
                  title="Serie temporal — Barras"
                  subtitle="Cada barra es una lectura"
                  height="240px"
                >
                  <ChartRenderer config={barCfg} data={data} height="240px" />
                </ChartCard>
              </div>

              {/* Fila: scatter + heatmap */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ChartCard
                  title="Dispersión (Scatter)"
                  subtitle="Distribución temporal de valores — patrones y outliers"
                  height="240px"
                >
                  <ChartRenderer config={scatterCfg} data={data} height="240px" />
                </ChartCard>
                <ChartCard
                  title="Mapa de calor semanal"
                  subtitle="Promedio por hora del día y día de la semana (últimos 7 días)"
                  height="240px"
                >
                  <ChartRenderer config={heatCfg} data={data} height="240px" />
                </ChartCard>
              </div>

            </div>
          )}

          {/* Skeleton de carga */}
          {loading && data.length === 0 && (
            <div className="space-y-4 animate-pulse">
              <div className="h-[300px] rounded-2xl" style={{ backgroundColor: "var(--color-border)" }} />
              <div className="grid grid-cols-2 gap-4">
                <div className="h-[240px] rounded-2xl" style={{ backgroundColor: "var(--color-border)" }} />
                <div className="h-[240px] rounded-2xl" style={{ backgroundColor: "var(--color-border)" }} />
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
    </Portal>
  );
}
