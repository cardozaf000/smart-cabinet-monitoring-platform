import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  FiAlertTriangle, FiAlertOctagon, FiInfo, FiCheckCircle,
  FiRefreshCcw, FiFilter, FiCalendar, FiClock, FiChevronLeft,
  FiChevronRight, FiCheck, FiActivity,
} from "react-icons/fi";
import { BACKEND } from "../utils/api";
import { authHeader } from "../utils/auth";

/* ══════════════════════════════════════════════════
   CONSTANTES
══════════════════════════════════════════════════ */
const SEV_META = {
  critical: { label: "Crítico",     color: "#ef4444", bg: "#ef444415", Icon: FiAlertOctagon },
  warning:  { label: "Advertencia", color: "#f59e0b", bg: "#f59e0b15", Icon: FiAlertTriangle },
  info:     { label: "Info",        color: "#3b82f6", bg: "#3b82f615", Icon: FiInfo },
};

const STATUS_META = {
  active:       { label: "Activo",      color: "#ef4444", pulse: true  },
  acknowledged: { label: "Reconocido",  color: "#f59e0b", pulse: false },
  resolved:     { label: "Resuelto",    color: "#10b981", pulse: false },
};

/* ══════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════ */
function fmtTs(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function duration(fired, resolved) {
  const end  = resolved ? new Date(resolved).getTime() : Date.now();
  const ms   = Math.max(0, end - new Date(fired).getTime());
  const sec  = Math.floor(ms / 1000);
  if (sec < 60)   return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

/* ══════════════════════════════════════════════════
   SUB-COMPONENTES
══════════════════════════════════════════════════ */
function StatCard({ label, value, color, sub }) {
  return (
    <div className="rounded-2xl border px-5 py-4 flex flex-col gap-1"
      style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
      <span className="text-3xl font-bold tabular-nums" style={{ color }}>{value ?? 0}</span>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-50">{label}</span>
      {sub && <span className="text-[11px] opacity-35">{sub}</span>}
    </div>
  );
}

function SevBadge({ severity }) {
  const m = SEV_META[severity] || SEV_META.info;
  const Icon = m.Icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ backgroundColor: m.bg, color: m.color }}>
      <Icon size={10}/>{m.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.resolved;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: m.color + "18", color: m.color }}>
      {m.pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
            style={{ backgroundColor: m.color }}/>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: m.color }}/>
        </span>
      )}
      {m.label}
    </span>
  );
}

function IncidentRow({ inc, onAck, onResolve }) {
  return (
    <tr className="transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_3%,transparent)]"
      style={{ borderBottom: "1px solid var(--color-border)" }}>

      {/* Severidad */}
      <td className="py-3 px-3"><SevBadge severity={inc.severity}/></td>

      {/* Estado */}
      <td className="py-3 px-3"><StatusBadge status={inc.status}/></td>

      {/* Inicio */}
      <td className="py-3 px-3 whitespace-nowrap">
        <div className="text-xs font-mono" style={{ color: "var(--color-text)" }}>{fmtTs(inc.fired_at)}</div>
        {inc.status !== "resolved" && (
          <div className="text-[10px] opacity-35 mt-0.5 flex items-center gap-1">
            <FiClock size={9}/>{duration(inc.fired_at, null)}
          </div>
        )}
      </td>

      {/* Duración total si resuelto */}
      <td className="py-3 px-3 text-xs opacity-50">
        {inc.resolved_at ? duration(inc.fired_at, inc.resolved_at) : "—"}
      </td>

      {/* Regla */}
      <td className="py-3 px-3">
        <div className="text-xs font-semibold">{inc.rule_name || `Regla #${inc.rule_id}`}</div>
        <div className="text-[10px] opacity-40 font-mono">{inc.message}</div>
      </td>

      {/* Sensor / Métrica */}
      <td className="py-3 px-3">
        <div className="text-xs font-mono opacity-70">{inc.sensor_id || "—"}</div>
        <div className="text-[10px] opacity-40">{inc.metric}</div>
      </td>

      {/* Valor vs umbral */}
      <td className="py-3 px-3 text-right whitespace-nowrap">
        <span className="text-sm font-bold tabular-nums"
          style={{ color: SEV_META[inc.severity]?.color || "var(--color-primary)" }}>
          {Number(inc.value ?? 0).toFixed(2)}
        </span>
        <span className="text-[10px] opacity-40 ml-1">{inc.op} {inc.threshold}</span>
      </td>

      {/* Acciones */}
      <td className="py-3 px-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          {inc.status === "active" && (
            <>
              <button
                onClick={() => onAck(inc.id)}
                title="Reconocer"
                className="px-2 py-1 rounded text-[11px] font-semibold border transition hover:opacity-80"
                style={{ borderColor: "#f59e0b", color: "#f59e0b" }}>
                <FiCheck size={11} className="inline mr-0.5"/>Ack
              </button>
              <button
                onClick={() => onResolve(inc.id)}
                title="Resolver"
                className="px-2 py-1 rounded text-[11px] font-semibold border transition hover:opacity-80"
                style={{ borderColor: "#10b981", color: "#10b981" }}>
                <FiCheckCircle size={11} className="inline mr-0.5"/>Resolver
              </button>
            </>
          )}
          {inc.status === "acknowledged" && (
            <button
              onClick={() => onResolve(inc.id)}
              className="px-2 py-1 rounded text-[11px] font-semibold border transition hover:opacity-80"
              style={{ borderColor: "#10b981", color: "#10b981" }}>
              <FiCheckCircle size={11} className="inline mr-0.5"/>Resolver
            </button>
          )}
          {inc.status === "acknowledged" && (
            <span className="text-[10px] opacity-40">por {inc.ack_by}</span>
          )}
        </div>
      </td>
    </tr>
  );
}

function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const range = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(pages, page + 2); i++) range.push(i);
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        className="p-1.5 rounded disabled:opacity-30" style={{ color: "var(--color-text)" }}>
        <FiChevronLeft size={14}/>
      </button>
      {range[0] > 1 && <span className="px-1 text-xs opacity-30">…</span>}
      {range.map(n => (
        <button key={n} onClick={() => onPage(n)}
          className="min-w-[28px] h-7 rounded text-xs font-semibold"
          style={{
            backgroundColor: n === page ? "var(--color-primary)" : "transparent",
            color: n === page ? "#fff" : "var(--color-text)",
            border: n === page ? "none" : "1px solid var(--color-border)",
          }}>{n}</button>
      ))}
      {range[range.length - 1] < pages && <span className="px-1 text-xs opacity-30">…</span>}
      <button onClick={() => onPage(page + 1)} disabled={page === pages}
        className="p-1.5 rounded disabled:opacity-30" style={{ color: "var(--color-text)" }}>
        <FiChevronRight size={14}/>
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
══════════════════════════════════════════════════ */
export default function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [stats,     setStats]     = useState(null);
  const [total,     setTotal]     = useState(0);
  const [pages,     setPages]     = useState(1);
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // Filtros
  const [statusF,   setStatusF]   = useState("");
  const [severityF, setSeverityF] = useState("");
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [showFilter, setShowFilter] = useState(false);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(true);
  const timerRef = useRef(null);

  const fetchIncidents = useCallback(async (pg = 1) => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ page: pg, per_page: 50 });
      if (statusF)   params.set("status",   statusF);
      if (severityF) params.set("severity", severityF);
      if (dateFrom)  params.set("from",     dateFrom);
      if (dateTo)    params.set("to",       dateTo);

      const res  = await fetch(`${BACKEND}/alerts/incidents?${params}`, { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar incidentes");

      setIncidents(data.incidents || []);
      setTotal(data.total  || 0);
      setPages(data.pages  || 1);
      setStats(data.stats  || null);
      setPage(pg);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [statusF, severityF, dateFrom, dateTo]);

  useEffect(() => {
    fetchIncidents(1);
  }, [fetchIncidents]);

  // Auto-refresh cada 30s
  useEffect(() => {
    if (!autoRefresh) return;
    timerRef.current = setInterval(() => fetchIncidents(page), 30_000);
    return () => clearInterval(timerRef.current);
  }, [autoRefresh, fetchIncidents, page]);

  const handleAck = async (id) => {
    try {
      await fetch(`${BACKEND}/alerts/incidents/${id}/ack`, { method: "POST", headers: authHeader() });
      fetchIncidents(page);
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleResolve = async (id) => {
    try {
      await fetch(`${BACKEND}/alerts/incidents/${id}/resolve`, { method: "POST", headers: authHeader() });
      fetchIncidents(page);
    } catch (e) { alert("Error: " + e.message); }
  };

  const handleReset = () => { setStatusF(""); setSeverityF(""); setDateFrom(""); setDateTo(""); };
  const hasFilters = statusF || severityF || dateFrom || dateTo;

  return (
    <div className="space-y-5 pb-6">

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            {stats?.active > 0 ? (
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ backgroundColor: "#ef4444" }}/>
                <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: "#ef4444" }}/>
              </span>
            ) : (
              <FiActivity size={14} style={{ color: "#10b981" }}/>
            )}
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
              Incidencias
            </h1>
          </div>
          <p className="text-xs ml-4 opacity-40">
            Alertas disparadas por las reglas configuradas · se actualiza cada 30 s
          </p>
          {stats?.active > 0 && (
            <p className="text-xs ml-4 mt-0.5 font-semibold" style={{ color: "#ef4444" }}>
              {stats.active} alerta{stats.active !== 1 ? "s" : ""} activa{stats.active !== 1 ? "s" : ""} — revisa y reconoce o resuelve
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs border transition"
            style={{
              backgroundColor: autoRefresh ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "transparent",
              color: autoRefresh ? "var(--color-primary)" : "var(--color-text)",
              borderColor: autoRefresh ? "var(--color-primary)" : "var(--color-border)",
            }}>
            <FiRefreshCcw size={12} className={autoRefresh ? "animate-spin" : ""}
              style={{ animationDuration: "3s" }}/>
            Auto {autoRefresh ? "ON" : "OFF"}
          </button>
          <button onClick={() => fetchIncidents(page)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition hover:opacity-80"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
            <FiRefreshCcw size={13} className={loading ? "animate-spin" : ""}/>
            Actualizar
          </button>
        </div>
      </div>

      {/* STATS */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Activos"         value={stats.active}          color="#ef4444" />
          <StatCard label="Críticos activos" value={stats.critical_active} color="#ef4444" sub="severidad crítica" />
          <StatCard label="Advertencias"    value={stats.warning_active}  color="#f59e0b" sub="activas" />
          <StatCard label="Reconocidos"     value={stats.acknowledged}    color="#f59e0b" />
          <StatCard label="Resueltos"       value={stats.resolved}        color="#10b981" />
        </div>
      )}

      {/* FILTROS */}
      <div className="rounded-2xl border" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => setStatusF(statusF === "active" ? "" : "active")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition"
            style={{
              backgroundColor: statusF === "active" ? "#ef444420" : "transparent",
              color: statusF === "active" ? "#ef4444" : "var(--color-text)",
              borderColor: statusF === "active" ? "#ef4444" : "var(--color-border)",
            }}>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 bg-red-400"/>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"/>
            </span>
            Solo activos
          </button>

          <button onClick={() => setShowFilter(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition"
            style={{
              backgroundColor: showFilter ? "var(--color-primary)" : "transparent",
              color: showFilter ? "#fff" : "var(--color-text)",
              borderColor: showFilter ? "var(--color-primary)" : "var(--color-border)",
            }}>
            <FiFilter size={11}/> Filtros
            {hasFilters && !showFilter && <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-0.5"/>}
          </button>

          {hasFilters && (
            <button onClick={handleReset} className="text-xs opacity-40 hover:opacity-70 px-2 transition">
              Limpiar
            </button>
          )}

          <span className="ml-auto text-xs opacity-30 tabular-nums">{total} incidentes</span>
        </div>

        {showFilter && (
          <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t"
            style={{ borderColor: "var(--color-border)" }}>
            <div className="pt-3">
              <label className="block text-[11px] font-medium mb-1 opacity-50 uppercase tracking-wide">Estado</label>
              <select value={statusF} onChange={e => setStatusF(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                <option value="">Todos</option>
                <option value="active">Activo</option>
                <option value="acknowledged">Reconocido</option>
                <option value="resolved">Resuelto</option>
              </select>
            </div>
            <div className="pt-3">
              <label className="block text-[11px] font-medium mb-1 opacity-50 uppercase tracking-wide">Severidad</label>
              <select value={severityF} onChange={e => setSeverityF(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                <option value="">Todas</option>
                <option value="critical">Crítico</option>
                <option value="warning">Advertencia</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div className="pt-3">
              <label className="block text-[11px] font-medium mb-1 opacity-50 uppercase tracking-wide">
                <FiCalendar size={9} className="inline mr-1"/>Desde
              </label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}/>
            </div>
            <div className="pt-3">
              <label className="block text-[11px] font-medium mb-1 opacity-50 uppercase tracking-wide">
                <FiCalendar size={9} className="inline mr-1"/>Hasta
              </label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}/>
            </div>
          </div>
        )}
      </div>

      {/* TABLA */}
      <div className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <FiAlertTriangle size={14} style={{ color: "var(--color-primary)" }}/>
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Historial de incidentes</h2>
          </div>
          <Pagination page={page} pages={pages} onPage={p => fetchIncidents(p)}/>
        </div>

        {error && (
          <div className="px-5 py-4 text-sm" style={{ color: "#fca5a5", backgroundColor: "#ef444412" }}>
            ⚠️ {error}
          </div>
        )}

        {loading && !error && (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="h-5 rounded-full w-20" style={{ backgroundColor: "var(--color-border)" }}/>
                <div className="h-5 rounded-full w-16" style={{ backgroundColor: "var(--color-border)" }}/>
                <div className="h-3 rounded w-28" style={{ backgroundColor: "var(--color-border)" }}/>
                <div className="h-3 rounded w-36" style={{ backgroundColor: "var(--color-border)" }}/>
                <div className="h-3 rounded w-16 ml-auto" style={{ backgroundColor: "var(--color-border)" }}/>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" style={{ color: "var(--color-text)" }}>
              <thead>
                <tr className="text-[11px] uppercase tracking-wider"
                  style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["Severidad", "Estado", "Inicio", "Duración", "Regla / Mensaje", "Sensor", "Valor", "Acciones"].map((h, i) => (
                    <th key={i}
                      className={`py-2.5 px-3 font-semibold opacity-45 ${i === 6 || i === 7 ? "text-right" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {incidents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-14 text-center">
                      {hasFilters
                        ? <span className="text-sm opacity-30">No hay incidentes con los filtros actuales</span>
                        : (
                          <div className="flex flex-col items-center gap-3">
                            <FiActivity size={32} style={{ color: "var(--color-primary)", opacity: 0.3 }}/>
                            <p className="text-sm font-semibold opacity-50">Sin incidentes registrados</p>
                            <p className="text-xs opacity-30 max-w-xs">
                              Cuando una regla de alerta se dispare, aparecerá aquí con severidad, sensor y duración.
                            </p>
                            <p className="text-[11px] opacity-25 mt-1">
                              Configura reglas en la pestaña <strong>Alertas</strong> para empezar a monitorear.
                            </p>
                          </div>
                        )}
                    </td>
                  </tr>
                ) : (
                  incidents.map(inc => (
                    <IncidentRow key={inc.id} inc={inc} onAck={handleAck} onResolve={handleResolve}/>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {!loading && pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t"
            style={{ borderColor: "var(--color-border)" }}>
            <span className="text-xs opacity-35">
              Página {page} de {pages} · {total} incidentes totales
            </span>
            <Pagination page={page} pages={pages} onPage={p => fetchIncidents(p)}/>
          </div>
        )}
      </div>
    </div>
  );
}
