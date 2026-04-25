/**
 * SensorStatsPanel.js
 * Panel expandible inline de estadísticas históricas de un sensor.
 * Se muestra como fila expandida en la tabla de sensores.
 */
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  FiActivity, FiX, FiBarChart2, FiTrendingUp, FiTrendingDown,
  FiMinus, FiRefreshCcw, FiCheckCircle,
} from "react-icons/fi";
import { BACKEND } from "../utils/api";
import { authHeader } from "../utils/auth";
import ChartRenderer from "./ChartRenderer";

/* ── Rangos disponibles ─────────────────────────────────────── */
const HIST_RANGES = [
  { label: "1h",  timeRange: { kind: "lastN", unit: "hours", value: 1  }, ms: 1  * 3_600_000, limit: 2000 },
  { label: "6h",  timeRange: { kind: "lastN", unit: "hours", value: 6  }, ms: 6  * 3_600_000, limit: 3000 },
  { label: "24h", timeRange: { kind: "lastN", unit: "hours", value: 24 }, ms: 24 * 3_600_000, limit: 4000 },
  { label: "7d",  timeRange: { kind: "lastN", unit: "days",  value: 7  }, ms: 7  * 86_400_000, limit: 5000 },
  { label: "30d", timeRange: { kind: "lastN", unit: "days",  value: 30 }, ms: 30 * 86_400_000, limit: 5000 },
];

/* ── Estadísticas ───────────────────────────────────────────── */
function computeStats(values) {
  if (!values || values.length === 0) return null;
  const n   = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / n);
  const last = values[values.length - 1];
  return { min, max, avg, std, count: n, last };
}

/* ── StatCard mini ──────────────────────────────────────────── */
function StatCard({ label, value, unit, color, Icon }) {
  return (
    <div
      className="flex flex-col p-3 rounded-xl border"
      style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card)" }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {Icon && <Icon size={11} style={{ color, flexShrink: 0 }} />}
        <span
          className="text-[10px] uppercase tracking-wider font-semibold"
          style={{ color: "var(--color-text)", opacity: 0.5 }}
        >
          {label}
        </span>
      </div>
      <span className="text-2xl font-bold tabular-nums leading-none" style={{ color }}>
        {value != null ? Number(value).toFixed(2) : "—"}
      </span>
      {unit && (
        <span className="text-[10px] mt-1" style={{ color: "var(--color-text)", opacity: 0.35 }}>
          {unit}
        </span>
      )}
    </div>
  );
}

/* ── Componente principal ───────────────────────────────────── */
export default function SensorStatsPanel({
  sensorId,
  measure,
  sensorName,
  isAdded,
  onClose,
  onAddToDashboard,
}) {
  const [rangeIdx, setRangeIdx] = useState(2); // 24h por defecto
  const [data,     setData]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);
  const [unit,     setUnit]     = useState("");

  const fetchData = useCallback(async () => {
    if (!sensorId || !measure) return;
    const r = HIST_RANGES[rangeIdx];
    setLoading(true);
    setError(null);
    try {
      const from = new Date(Date.now() - r.ms);
      const toISO = (d) => d.toISOString().replace("T", " ").slice(0, 19);
      const params = new URLSearchParams({
        sensorId,
        tipo:  measure,
        from:  toISO(from),
        limit: String(r.limit),
      });
      const res = await fetch(`${BACKEND}/historico?${params}`, { headers: authHeader() });
      if (!res.ok) throw new Error("Error al cargar historial");
      const raw = await res.json();
      const norm = raw
        .filter((d) => d.valor != null && d.timestamp)
        .map((d) => ({
          sensorId,
          tipo:      measure,
          valor:     Number(d.valor),
          unidad:    d.unidad || "",
          timestamp: d.timestamp,
        }));
      if (norm.length > 0) setUnit(norm[0].unidad);
      setData(norm);
    } catch (e) {
      setError(e.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [sensorId, measure, rangeIdx]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const stats = useMemo(() => computeStats(data.map((d) => d.valor)), [data]);

  const chartConfig = {
    chartType:    "area",
    sensorId,
    measure,
    timeRange:    HIST_RANGES[rangeIdx].timeRange,
    decimals:     2,
    unitOverride: unit,
  };

  return (
    <div
      className="space-y-4 p-4"
      style={{
        backgroundColor: "var(--color-bg)",
        borderTop:  "2px solid var(--color-primary)",
        borderLeft: "3px solid var(--color-primary)",
      }}
    >
      {/* ── Encabezado ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FiActivity size={14} style={{ color: "var(--color-primary)", flexShrink: 0 }} />
          <span className="text-sm font-bold truncate" style={{ color: "var(--color-text)" }}>
            {sensorName}
          </span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
            style={{
              backgroundColor: "color-mix(in srgb, var(--color-primary) 15%, transparent)",
              color: "var(--color-primary)",
            }}
          >
            {measure}
          </span>
          {loading && (
            <span className="text-xs animate-pulse" style={{ color: "var(--color-text)", opacity: 0.4 }}>
              cargando…
            </span>
          )}
          {!loading && data.length > 0 && (
            <span className="text-xs" style={{ color: "var(--color-text)", opacity: 0.3 }}>
              {data.length.toLocaleString()} lecturas
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onAddToDashboard}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:opacity-80"
            style={{
              borderColor: isAdded ? "#10b981" : "var(--color-primary)",
              color:        isAdded ? "#10b981" : "var(--color-primary)",
              backgroundColor: isAdded
                ? "color-mix(in srgb, #10b981 10%, transparent)"
                : "color-mix(in srgb, var(--color-primary) 8%, transparent)",
            }}
          >
            {isAdded
              ? <><FiCheckCircle size={11} /> En dashboard</>
              : <><FiBarChart2   size={11} /> Añadir al dashboard</>
            }
          </button>
          <button
            onClick={fetchData}
            title="Actualizar datos"
            className="p-1.5 rounded-lg border transition hover:opacity-80"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            <FiRefreshCcw size={12} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={onClose}
            title="Cerrar"
            className="p-1.5 rounded-lg border transition hover:opacity-80"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
          >
            <FiX size={12} />
          </button>
        </div>
      </div>

      {/* ── Selector de rango ── */}
      <div className="flex gap-1.5 flex-wrap">
        {HIST_RANGES.map((r, idx) => (
          <button
            key={r.label}
            onClick={() => setRangeIdx(idx)}
            className="px-3 py-1 rounded-lg text-xs font-semibold border transition"
            style={{
              backgroundColor: idx === rangeIdx ? "var(--color-primary)" : "transparent",
              color:       idx === rangeIdx ? "#fff"  : "var(--color-text)",
              borderColor: idx === rangeIdx ? "var(--color-primary)" : "var(--color-border)",
            }}
          >
            {r.label}
          </button>
        ))}
        {!loading && data.length > 0 && stats && (
          <span
            className="ml-auto text-[11px] self-center"
            style={{ color: "var(--color-text)", opacity: 0.4 }}
          >
            {HIST_RANGES[rangeIdx].label} · desde{" "}
            {new Date(Date.now() - HIST_RANGES[rangeIdx].ms).toLocaleString("es-CR", {
              month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
            })}
          </span>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#ef444415", color: "#fca5a5" }}>
          ⚠ {error}
        </p>
      )}

      {/* ── Estadísticas ── */}
      {stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Mínimo"     value={stats.min} unit={unit}
            color="#3b82f6"                        Icon={FiTrendingDown}
          />
          <StatCard
            label="Máximo"     value={stats.max} unit={unit}
            color="#ef4444"                        Icon={FiTrendingUp}
          />
          <StatCard
            label="Promedio"   value={stats.avg} unit={unit}
            color="var(--color-primary)"           Icon={FiMinus}
          />
          <StatCard
            label="Desv. Est." value={stats.std} unit={unit}
            color="#8b5cf6"                        Icon={FiActivity}
          />
        </div>
      ) : !loading && !error && (
        <p className="text-sm text-center py-6" style={{ color: "var(--color-text)", opacity: 0.3 }}>
          Sin datos para el período seleccionado
        </p>
      )}

      {/* ── Gráfico ── */}
      {data.length > 0 && (
        <div
          style={{
            height: "240px",
            borderRadius: "12px",
            overflow: "hidden",
            border: "1px solid var(--color-border)",
          }}
        >
          <ChartRenderer config={chartConfig} data={data} height="240px" />
        </div>
      )}

      {/* ── Skeleton de carga ── */}
      {loading && data.length === 0 && (
        <div className="space-y-3 animate-pulse">
          <div className="grid grid-cols-4 gap-3">
            {[0,1,2,3].map((i) => (
              <div key={i} className="h-20 rounded-xl" style={{ backgroundColor: "var(--color-border)" }} />
            ))}
          </div>
          <div className="h-[240px] rounded-xl" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
      )}
    </div>
  );
}
