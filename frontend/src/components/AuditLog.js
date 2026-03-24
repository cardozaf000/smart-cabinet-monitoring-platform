import React, { useState, useEffect, useCallback, useRef } from "react";
import Portal from "./Portal";
import {
  FiShield, FiSearch, FiRefreshCcw, FiChevronLeft, FiChevronRight,
  FiLogIn, FiLogOut, FiUserPlus, FiUserX, FiEdit2, FiLock,
  FiWifi, FiServer, FiAlertTriangle, FiCheckCircle, FiXCircle,
  FiChevronDown, FiChevronUp, FiFilter, FiCalendar, FiDownload, FiX,
  FiBarChart2, FiTrash2,
} from "react-icons/fi";
import { BACKEND } from "../utils/api";
import { authHeader, getToken } from "../utils/auth";

/* ════════════════════════════════════════════════════════
   CONSTANTES DE ACCIONES
════════════════════════════════════════════════════════ */
const ACTION_META = {
  LOGIN_SUCCESS:      { label: "Inicio de sesión",    Icon: FiLogIn,        color: "#10b981", bg: "#10b98118" },
  LOGIN_FAILURE:      { label: "Intento fallido",     Icon: FiAlertTriangle,color: "#f59e0b", bg: "#f59e0b18" },
  LOGOUT:             { label: "Cierre de sesión",    Icon: FiLogOut,       color: "#9ca3af", bg: "#9ca3af18" },
  CREATE_USER:        { label: "Usuario creado",      Icon: FiUserPlus,     color: "#6366f1", bg: "#6366f118" },
  UPDATE_USER:        { label: "Usuario modificado",  Icon: FiEdit2,        color: "#3b82f6", bg: "#3b82f618" },
  DELETE_USER:        { label: "Usuario eliminado",   Icon: FiUserX,        color: "#ef4444", bg: "#ef444418" },
  RESET_PASSWORD:     { label: "Contraseña cambiada", Icon: FiLock,         color: "#8b5cf6", bg: "#8b5cf618" },
  NETWORK_ETH0:       { label: "Config. Ethernet",    Icon: FiServer,       color: "#06b6d4", bg: "#06b6d418" },
  NETWORK_WLAN0:      { label: "Config. IP WiFi",     Icon: FiWifi,         color: "#06b6d4", bg: "#06b6d418" },
  WIFI_SSID:          { label: "Red WiFi cambiada",   Icon: FiWifi,         color: "#f59e0b", bg: "#f59e0b18" },
  SAVE_WIDGET:        { label: "Gráfico guardado",    Icon: FiBarChart2,    color: "#10b981", bg: "#10b98118" },
  DELETE_WIDGET:      { label: "Gráfico eliminado",   Icon: FiTrash2,       color: "#ef4444", bg: "#ef444418" },
  CREATE_ALERT_RULE:  { label: "Alerta creada",       Icon: FiAlertTriangle,color: "#6366f1", bg: "#6366f118" },
  UPDATE_ALERT_RULE:  { label: "Alerta modificada",   Icon: FiEdit2,        color: "#3b82f6", bg: "#3b82f618" },
  DELETE_ALERT_RULE:  { label: "Alerta eliminada",    Icon: FiTrash2,       color: "#ef4444", bg: "#ef444418" },
  ADD_SNMP_DEVICE:    { label: "Disp. SNMP agregado", Icon: FiServer,       color: "#06b6d4", bg: "#06b6d418" },
  DELETE_SNMP_DEVICE: { label: "Disp. SNMP eliminado",Icon: FiTrash2,       color: "#ef4444", bg: "#ef444418" },
  CREATE_THEME:       { label: "Tema creado",          Icon: FiEdit2,        color: "#8b5cf6", bg: "#8b5cf618" },
  DELETE_THEME:       { label: "Tema eliminado",       Icon: FiTrash2,       color: "#ef4444", bg: "#ef444418" },
  ACK_INCIDENT:       { label: "Incidente reconocido", Icon: FiAlertTriangle,color: "#f59e0b", bg: "#f59e0b18" },
  RESOLVE_INCIDENT:   { label: "Incidente resuelto",   Icon: FiCheckCircle,  color: "#10b981", bg: "#10b98118" },
};

const STATUS_META = {
  success: { label: "Éxito",     color: "#10b981", Icon: FiCheckCircle  },
  warning: { label: "Advertencia", color: "#f59e0b", Icon: FiAlertTriangle },
  error:   { label: "Error",     color: "#ef4444", Icon: FiXCircle      },
};

const ROL_COLOR = {
  superadmin: "#f59e0b",
  admin:      "#818cf8",
  operador:   "#34d399",
  viewer:     "#9ca3af",
  sistema:    "#6b7280",
};

/* ════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════ */
function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-CR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function relTime(iso) {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400)return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

/* ════════════════════════════════════════════════════════
   SUB-COMPONENTES
════════════════════════════════════════════════════════ */
function StatCard({ label, value, color, sub }) {
  return (
    <div className="rounded-2xl border px-5 py-4 flex flex-col gap-1"
      style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
      <span className="text-3xl font-bold tabular-nums" style={{ color }}>{value ?? "—"}</span>
      <span className="text-xs font-semibold uppercase tracking-wide opacity-50">{label}</span>
      {sub && <span className="text-[11px] opacity-35">{sub}</span>}
    </div>
  );
}

function ActionBadge({ action }) {
  const m = ACTION_META[action] || {
    label: action, Icon: FiShield, color: "#6b7280", bg: "#6b728018"
  };
  const Icon = m.Icon;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap"
      style={{ backgroundColor: m.bg, color: m.color }}>
      <Icon size={10} />{m.label}
    </span>
  );
}

function StatusDot({ status }) {
  const m = STATUS_META[status] || STATUS_META.success;
  const Icon = m.Icon;
  return <Icon size={14} style={{ color: m.color }} title={m.label} />;
}

function RolBadge({ rol }) {
  if (!rol) return null;
  return (
    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
      style={{
        backgroundColor: (ROL_COLOR[rol] || "#6b7280") + "22",
        color: ROL_COLOR[rol] || "#6b7280",
      }}>
      {rol}
    </span>
  );
}

function DetailsPanel({ details }) {
  if (!details) return <span className="text-xs opacity-30">—</span>;
  if (typeof details === "string") return <span className="text-xs font-mono opacity-60">{details}</span>;

  return (
    <div className="flex flex-wrap gap-2">
      {Object.entries(details).map(([k, v]) => (
        <span key={k} className="text-[11px] px-2 py-0.5 rounded font-mono"
          style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
          <span className="opacity-40">{k}:</span>{" "}
          <span className="font-semibold" style={{ color: "var(--color-text)" }}>
            {typeof v === "boolean" ? (v ? "sí" : "no") : String(v)}
          </span>
        </span>
      ))}
    </div>
  );
}

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="transition-colors hover:bg-[color-mix(in_srgb,var(--color-primary)_3%,transparent)] cursor-pointer"
        style={{ borderBottom: "1px solid var(--color-border)" }}
        onClick={() => setExpanded(v => !v)}
      >
        {/* Estado */}
        <td className="py-3 px-3 text-center">
          <StatusDot status={log.status} />
        </td>
        {/* Timestamp */}
        <td className="py-3 px-3 whitespace-nowrap">
          <div className="text-xs font-mono" style={{ color: "var(--color-text)" }}>
            {fmtDate(log.timestamp)}
          </div>
          <div className="text-[10px] opacity-35 mt-0.5">{relTime(log.timestamp)}</div>
        </td>
        {/* Usuario */}
        <td className="py-3 px-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
              style={{
                backgroundColor: (ROL_COLOR[log.rol] || "#6b7280") + "22",
                color: ROL_COLOR[log.rol] || "#6b7280",
              }}>
              {(log.username || "?")[0].toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-semibold">{log.username || "sistema"}</div>
              <RolBadge rol={log.rol} />
            </div>
          </div>
        </td>
        {/* Acción */}
        <td className="py-3 px-3">
          <ActionBadge action={log.action} />
        </td>
        {/* Recurso */}
        <td className="py-3 px-3">
          {log.resource_type ? (
            <span className="text-xs font-mono opacity-50">
              {log.resource_type}{log.resource_id ? `#${log.resource_id}` : ""}
            </span>
          ) : <span className="opacity-20 text-xs">—</span>}
        </td>
        {/* IP */}
        <td className="py-3 px-3">
          <span className="text-xs font-mono opacity-40">{log.ip_address || "—"}</span>
        </td>
        {/* Expandir */}
        <td className="py-3 px-3 text-center">
          {log.details && (
            <span className="opacity-30 hover:opacity-70 transition-opacity">
              {expanded ? <FiChevronUp size={13}/> : <FiChevronDown size={13}/>}
            </span>
          )}
        </td>
      </tr>
      {expanded && log.details && (
        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
          <td colSpan={7} className="px-4 py-2.5"
            style={{ backgroundColor: "color-mix(in srgb, var(--color-bg) 60%, var(--color-card))" }}>
            <DetailsPanel details={log.details} />
          </td>
        </tr>
      )}
    </>
  );
}

function Pagination({ page, pages, onPage }) {
  if (pages <= 1) return null;
  const range = [];
  const delta = 2;
  for (let i = Math.max(1, page - delta); i <= Math.min(pages, page + delta); i++) {
    range.push(i);
  }
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        className="p-1.5 rounded disabled:opacity-30 hover:opacity-70 transition"
        style={{ color: "var(--color-text)" }}>
        <FiChevronLeft size={14}/>
      </button>
      {range[0] > 1 && (
        <>
          <PagBtn n={1} cur={page} onPage={onPage}/>
          {range[0] > 2 && <span className="px-1 text-xs opacity-30">…</span>}
        </>
      )}
      {range.map(n => <PagBtn key={n} n={n} cur={page} onPage={onPage}/>)}
      {range[range.length - 1] < pages && (
        <>
          {range[range.length - 1] < pages - 1 && <span className="px-1 text-xs opacity-30">…</span>}
          <PagBtn n={pages} cur={page} onPage={onPage}/>
        </>
      )}
      <button onClick={() => onPage(page + 1)} disabled={page === pages}
        className="p-1.5 rounded disabled:opacity-30 hover:opacity-70 transition"
        style={{ color: "var(--color-text)" }}>
        <FiChevronRight size={14}/>
      </button>
    </div>
  );
}

function PagBtn({ n, cur, onPage }) {
  return (
    <button onClick={() => onPage(n)}
      className="min-w-[28px] h-7 rounded text-xs font-semibold transition"
      style={{
        backgroundColor: n === cur ? "var(--color-primary)" : "transparent",
        color: n === cur ? "#fff" : "var(--color-text)",
        border: n === cur ? "none" : "1px solid var(--color-border)",
      }}>
      {n}
    </button>
  );
}

/* ════════════════════════════════════════════════════════
   MODAL EXPORTAR CSV
════════════════════════════════════════════════════════ */
function ExportModal({ onClose, activeFilters }) {
  const [limit,      setLimit]      = useState("500");
  const [exporting,  setExporting]  = useState(false);
  const [useFilters, setUseFilters] = useState(true);
  const [exportFrom, setExportFrom] = useState(activeFilters.dateFrom || "");
  const [exportTo,   setExportTo]   = useState(activeFilters.dateTo   || "");

  // Sync dates when toggling "apply filters"
  const handleUseFilters = (checked) => {
    setUseFilters(checked);
    if (checked) {
      setExportFrom(activeFilters.dateFrom || "");
      setExportTo(activeFilters.dateTo     || "");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams({ limit });
      if (useFilters) {
        if (activeFilters.search)    params.set("search",   activeFilters.search);
        if (activeFilters.actionF)   params.set("action",   activeFilters.actionF);
        if (activeFilters.statusF)   params.set("status",   activeFilters.statusF);
        if (activeFilters.usernameF) params.set("username", activeFilters.usernameF);
      }
      if (exportFrom) params.set("from", exportFrom);
      if (exportTo)   params.set("to",   exportTo);

      const res = await fetch(`${BACKEND}/audit/export?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Error al exportar");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `auditoria_${exportFrom || "todo"}_${exportTo || new Date().toISOString().slice(0,10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e) {
      alert("Error al exportar: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-2xl border w-full max-w-sm mx-4 p-6 space-y-5 shadow-2xl"
        style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FiDownload size={16} style={{ color: "var(--color-primary)" }}/>
            <h3 className="text-base font-semibold">Exportar CSV</h3>
          </div>
          <button onClick={onClose} className="opacity-40 hover:opacity-70 transition">
            <FiX size={16}/>
          </button>
        </div>

        {/* Intervalo de fechas */}
        <div>
          <label className="block text-xs font-medium mb-2 opacity-50 uppercase tracking-wide">
            <FiCalendar size={10} className="inline mr-1"/>Intervalo de fechas
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="block text-[11px] mb-1 opacity-40">Desde</span>
              <input
                type="date"
                value={exportFrom}
                onChange={e => setExportFrom(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
              />
            </div>
            <div>
              <span className="block text-[11px] mb-1 opacity-40">Hasta</span>
              <input
                type="date"
                value={exportTo}
                onChange={e => setExportTo(e.target.value)}
                min={exportFrom || undefined}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{
                  backgroundColor: "var(--color-bg)",
                  color: "var(--color-text)",
                  border: "1px solid var(--color-border)",
                }}
              />
            </div>
          </div>
          {(!exportFrom && !exportTo) && (
            <p className="text-[11px] mt-1.5 opacity-35">Sin rango → exporta los registros más recientes</p>
          )}
          {(exportFrom || exportTo) && (
            <button
              onClick={() => { setExportFrom(""); setExportTo(""); }}
              className="text-[11px] mt-1.5 opacity-40 hover:opacity-70 transition underline">
              Limpiar fechas
            </button>
          )}
        </div>

        {/* Límite */}
        <div>
          <label className="block text-xs font-medium mb-2 opacity-50 uppercase tracking-wide">
            Máx. registros
          </label>
          <div className="grid grid-cols-4 gap-2">
            {["100", "500", "1000", "5000"].map(n => (
              <button key={n} onClick={() => setLimit(n)}
                className="py-1.5 rounded-lg text-xs font-semibold transition border"
                style={{
                  backgroundColor: limit === n ? "var(--color-primary)" : "transparent",
                  color: limit === n ? "#fff" : "var(--color-text)",
                  borderColor: limit === n ? "var(--color-primary)" : "var(--color-border)",
                }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Aplicar filtros activos */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={useFilters}
            onChange={e => handleUseFilters(e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          <span className="text-sm">Aplicar filtros activos de la tabla</span>
        </label>

        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full py-2.5 rounded-xl text-sm font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: "var(--color-primary)", color: "#fff" }}>
          {exporting
            ? <><FiRefreshCcw size={13} className="animate-spin"/>Exportando…</>
            : <><FiDownload size={13}/>Descargar auditoria.csv</>
          }
        </button>
      </div>
    </div>
    </Portal>
  );
}

/* ════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
════════════════════════════════════════════════════════ */
export default function AuditLog() {
  const [logs,    setLogs]    = useState([]);
  const [stats,   setStats]   = useState(null);
  const [filters, setFilters] = useState({ actions: [], users: [] });
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Filtros activos
  const [search,     setSearch]     = useState("");
  const [actionF,    setActionF]    = useState("");
  const [statusF,    setStatusF]    = useState("");
  const [usernameF,  setUsernameF]  = useState("");
  const [dateFrom,   setDateFrom]   = useState("");
  const [dateTo,     setDateTo]     = useState("");
  const [page,       setPage]       = useState(1);
  const [showFilter, setShowFilter] = useState(false);
  const [showExport, setShowExport] = useState(false);

  const searchRef    = useRef(null);
  const debounceRef  = useRef(null);

  const fetchLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: pg, per_page: 50 });
      if (search)    params.set("search",   search);
      if (actionF)   params.set("action",   actionF);
      if (statusF)   params.set("status",   statusF);
      if (usernameF) params.set("username", usernameF);
      if (dateFrom)  params.set("from",     dateFrom);
      if (dateTo)    params.set("to",       dateTo);

      const res  = await fetch(`${BACKEND}/audit/logs?${params}`, { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar auditoría");

      setLogs(data.logs    || []);
      setTotal(data.total  || 0);
      setPages(data.pages  || 1);
      setStats(data.stats  || null);
      setFilters(data.filters || { actions: [], users: [] });
      setPage(pg);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, actionF, statusF, usernameF, dateFrom, dateTo]);

  // Carga inicial y cuando cambian filtros (con debounce para search)
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchLogs(1), search ? 400 : 0);
    return () => clearTimeout(debounceRef.current);
  }, [fetchLogs]);

  const handleReset = () => {
    setSearch(""); setActionF(""); setStatusF("");
    setUsernameF(""); setDateFrom(""); setDateTo("");
  };

  const hasFilters = search || actionF || statusF || usernameF || dateFrom || dateTo;

  /* ── Render ── */
  return (
    <div className="space-y-5 pb-6">

      {showExport && (
        <ExportModal
          onClose={() => setShowExport(false)}
          activeFilters={{ search, actionF, statusF, usernameF, dateFrom, dateTo }}
        />
      )}

      {/* HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                style={{ backgroundColor: "#6366f1" }}/>
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: "#6366f1" }}/>
            </span>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--color-text)" }}>
              Auditoría del Sistema
            </h1>
          </div>
          <p className="text-xs ml-4 opacity-40">
            Registro completo de acciones realizadas por los usuarios
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition hover:opacity-80"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
            <FiDownload size={13}/>
            Exportar CSV
          </button>
          <button onClick={() => fetchLogs(page)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition hover:opacity-80"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
            <FiRefreshCcw size={13} className={loading ? "animate-spin" : ""}/>
            Actualizar
          </button>
        </div>
      </div>

      {/* STATS */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Eventos hoy"   value={stats.today_total}   color="var(--color-primary)" />
          <StatCard label="Exitosos"      value={stats.today_success} color="#10b981" sub="hoy" />
          <StatCard label="Advertencias"  value={stats.today_warning} color="#f59e0b" sub="hoy" />
          <StatCard label="Usuarios activos" value={stats.today_users} color="#6366f1" sub="únicos hoy" />
        </div>
      )}

      {/* FILTROS */}
      <div className="rounded-2xl border" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
        {/* Barra principal */}
        <div className="flex items-center gap-2 px-4 py-3">
          {/* Búsqueda */}
          <div className="relative flex-1">
            <FiSearch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-30"/>
            <input
              ref={searchRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por usuario, acción, detalles…"
              className="w-full pl-8 pr-3 py-2 rounded-lg text-sm"
              style={{
                backgroundColor: "var(--color-bg)",
                color: "var(--color-text)",
                border: "1px solid var(--color-border)",
              }}
            />
          </div>

          {/* Toggle filtros avanzados */}
          <button
            onClick={() => setShowFilter(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition"
            style={{
              backgroundColor: showFilter ? "var(--color-primary)" : "transparent",
              color: showFilter ? "#fff" : "var(--color-text)",
              borderColor: showFilter ? "var(--color-primary)" : "var(--color-border)",
            }}>
            <FiFilter size={13}/> Filtros
            {hasFilters && !showFilter && (
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-0.5"/>
            )}
          </button>

          {hasFilters && (
            <button onClick={handleReset}
              className="text-xs opacity-40 hover:opacity-70 px-2 transition">
              Limpiar
            </button>
          )}
        </div>

        {/* Filtros avanzados */}
        {showFilter && (
          <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 border-t"
            style={{ borderColor: "var(--color-border)" }}>

            {/* Acción */}
            <div className="pt-3">
              <label className="block text-[11px] font-medium mb-1 opacity-50 uppercase tracking-wide">Acción</label>
              <select value={actionF} onChange={e => setActionF(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                <option value="">Todas</option>
                {filters.actions.map(a => (
                  <option key={a} value={a}>{ACTION_META[a]?.label || a}</option>
                ))}
              </select>
            </div>

            {/* Estado */}
            <div className="pt-3">
              <label className="block text-[11px] font-medium mb-1 opacity-50 uppercase tracking-wide">Estado</label>
              <select value={statusF} onChange={e => setStatusF(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                <option value="">Todos</option>
                <option value="success">✅ Éxito</option>
                <option value="warning">⚠️ Advertencia</option>
                <option value="error">❌ Error</option>
              </select>
            </div>

            {/* Usuario */}
            <div className="pt-3">
              <label className="block text-[11px] font-medium mb-1 opacity-50 uppercase tracking-wide">Usuario</label>
              <select value={usernameF} onChange={e => setUsernameF(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
                <option value="">Todos</option>
                {filters.users.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Desde */}
            <div className="pt-3">
              <label className="block text-[11px] font-medium mb-1 opacity-50 uppercase tracking-wide">
                <FiCalendar size={10} className="inline mr-1"/>Desde
              </label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg text-xs"
                style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}/>
            </div>

            {/* Hasta */}
            <div className="pt-3">
              <label className="block text-[11px] font-medium mb-1 opacity-50 uppercase tracking-wide">
                <FiCalendar size={10} className="inline mr-1"/>Hasta
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

        {/* Header tabla */}
        <div className="flex items-center justify-between px-5 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-3">
            <FiShield size={14} style={{ color: "var(--color-primary)" }}/>
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">
              Registro de eventos
            </h2>
            {!loading && (
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--color-primary) 12%, transparent)",
                  color: "var(--color-primary)",
                }}>
                {total.toLocaleString()} eventos
              </span>
            )}
          </div>
          <Pagination page={page} pages={pages} onPage={p => fetchLogs(p)} />
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-4 text-sm"
            style={{ color: "#fca5a5", backgroundColor: "#ef444412" }}>
            ⚠️ {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && !error && (
          <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "var(--color-border)" }}/>
                <div className="h-3 rounded w-32" style={{ backgroundColor: "var(--color-border)" }}/>
                <div className="h-3 rounded w-20" style={{ backgroundColor: "var(--color-border)" }}/>
                <div className="h-5 rounded-full w-28" style={{ backgroundColor: "var(--color-border)" }}/>
                <div className="h-3 rounded w-16 ml-auto" style={{ backgroundColor: "var(--color-border)" }}/>
              </div>
            ))}
          </div>
        )}

        {/* Tabla de registros */}
        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm" style={{ color: "var(--color-text)" }}>
              <thead>
                <tr className="text-[11px] uppercase tracking-wider"
                  style={{ borderBottom: "1px solid var(--color-border)" }}>
                  {["", "Fecha / Hora", "Usuario", "Acción", "Recurso", "IP", ""].map((h, i) => (
                    <th key={i}
                      className={`py-2.5 px-3 font-semibold opacity-45 ${i === 0 || i === 6 ? "text-center" : "text-left"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center text-sm opacity-30">
                      No se encontraron eventos con los filtros actuales
                    </td>
                  </tr>
                ) : (
                  logs.map(log => <LogRow key={log.id} log={log} />)
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer paginación */}
        {!loading && pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t"
            style={{ borderColor: "var(--color-border)" }}>
            <span className="text-xs opacity-35">
              Página {page} de {pages} · {total.toLocaleString()} eventos totales
            </span>
            <Pagination page={page} pages={pages} onPage={p => fetchLogs(p)} />
          </div>
        )}
      </div>
    </div>
  );
}
