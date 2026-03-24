import React, { useEffect, useMemo, useState } from "react";
import WidgetConfigModal from "./WidgetConfigModal";
import ChartRenderer from "./ChartRenderer";
import { BACKEND } from "../utils/api";
import { FiClock, FiRefreshCcw } from "react-icons/fi";

/* -------------------------------------------------------
   Rangos rápidos (mismo set que WidgetConfigModal)
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

/* Convierte colSpan (1,2,3) a clases CSS */
const colSpanClass = (span) => {
  if (span === 3) return "col-span-1 sm:col-span-2 xl:col-span-3";
  if (span === 2) return "col-span-1 sm:col-span-2 xl:col-span-2";
  return "col-span-1";
};

export default function DashboardBuilder({ lecturas = [] }) {
  const [widgets, setWidgets]   = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  // Selector de tiempo global (opcional — sobreescribe el widget si se activa)
  const [globalRange, setGlobalRange]       = useState(null); // null = usar config de cada widget
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [customFrom, setCustomFrom]         = useState("");
  const [customTo, setCustomTo]             = useState("");

  // ---- Carga de widgets ----
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    setLoading(true);
    setError("");
    fetch(`${BACKEND}/api/widgets`, {
      headers: { Authorization: "Bearer " + token },
    })
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => setWidgets(Array.isArray(data) ? data : []))
      .catch(err => { console.error(err); setError("No se pudieron cargar los widgets"); })
      .finally(() => setLoading(false));
  }, []);

  // ---- Normalización de lecturas ----
  const normalized = useMemo(() => {
    if (!Array.isArray(lecturas)) return [];
    return lecturas.map(l => {
      const nested = l.lectura || {};
      return {
        sensorId:  String(l.sensor_id ?? l.sensorId ?? l.id_sensor ?? ""),
        tipo:      String(l.tipo ?? l.tipo_medida ?? l.type ?? ""),
        valor:     Number(l.valor ?? nested.valor),
        unidad:    (l.unidad ?? nested.unidad ?? "").trim(),
        timestamp: l.timestamp ?? nested.timestamp ?? null,
        name:      l.nombre ?? l.name ?? null,
      };
    }).filter(x => x.sensorId && x.tipo && !Number.isNaN(x.valor));
  }, [lecturas]);

  // ---- Crear nuevo widget ----
  const handleCreate = () => {
    const defaultSensor = normalized.length > 0 ? normalized[0].sensorId : "";
    const defaultTipo   = normalized.length > 0 ? normalized[0].tipo : "temperatura";
    setEditing({
      id: `w-${Date.now()}`,
      title: "Nuevo widget",
      chartType: "line",
      measure: defaultTipo,
      sensorScope: "bySensor",
      sensorId: defaultSensor,
      agg: "none",
      timeRange: { kind: "lastN", unit: "hours", value: 2 },
      maxPoints: 200,
      decimals: 2,
      unitOverride: "",
      pinned: false,
      colSpan: 1,
    });
    setShowModal(true);
  };

  // ---- Guardar widget ----
  const handleSave = (cfg) => {
    const token = localStorage.getItem("auth_token");
    fetch(`${BACKEND}api/widgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(cfg),
    })
      .then(res => res.json())
      .then(() => {
        setWidgets(prev => {
          const i = prev.findIndex(w => w.id === cfg.id);
          if (i === -1) return [...prev, cfg];
          const cp = [...prev]; cp[i] = cfg; return cp;
        });
        setShowModal(false);
        setEditing(null);
      })
      .catch(err => console.error("Error guardando widget:", err));
  };

  // ---- Eliminar widget ----
  const handleDelete = (id) => {
    const token = localStorage.getItem("auth_token");
    fetch(`${BACKEND}api/widgets/${id}`, {
      method: "DELETE", headers: { Authorization: "Bearer " + token },
    })
      .then(() => setWidgets(prev => prev.filter(w => w.id !== id)))
      .catch(err => console.error("Error eliminando widget:", err));
  };

  const handleEdit   = (w) => { setEditing(w); setShowModal(true); };
  const handleCancel = () => { setShowModal(false); setEditing(null); };
  const setPinned    = (id, pinned) => {
    const w = widgets.find(x => x.id === id);
    if (w) handleSave({ ...w, pinned });
  };

  // Fusión de rango global con la config de cada widget
  const effectiveConfig = (w) => {
    if (!globalRange) return w;
    return { ...w, timeRange: globalRange };
  };

  const globalRangeLabel = () => {
    if (!globalRange) return null;
    if (globalRange.kind === "lastN") {
      const qr = QUICK_RANGES.find(q => q.unit === globalRange.unit && q.value === globalRange.value);
      return qr ? qr.label : `${globalRange.value} ${globalRange.unit}`;
    }
    return "Personalizado";
  };

  return (
    <div
      className="space-y-5 p-6 rounded-xl shadow"
      style={{ color: "var(--color-text)", backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)" }}
    >
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-[var(--color-primary)]">
          Dashboards
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de rango global (Grafana-style) */}
          <div className="relative">
            <button
              onClick={() => setShowRangePicker(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm border transition hover:opacity-80"
              style={{
                backgroundColor: globalRange ? "var(--color-primary)" : "var(--color-bg)",
                color: globalRange ? "#fff" : "var(--color-text)",
                borderColor: "var(--color-border)",
              }}
            >
              <FiClock size={14} />
              {globalRange ? globalRangeLabel() : "Rango global"}
            </button>

            {showRangePicker && (
              <div
                className="absolute right-0 top-10 z-40 w-80 rounded-xl border shadow-2xl p-4 space-y-3"
                style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}
              >
                <p className="text-xs font-semibold uppercase opacity-60">Rango global (sobreescribe widgets)</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_RANGES.map(qr => {
                    const active = globalRange?.unit === qr.unit && globalRange?.value === qr.value;
                    return (
                      <button key={qr.label} type="button"
                        onClick={() => { setGlobalRange({ kind: qr.kind, unit: qr.unit, value: qr.value }); setShowRangePicker(false); }}
                        className="px-2.5 py-1 rounded text-xs font-medium border transition"
                        style={{
                          backgroundColor: active ? "var(--color-primary)" : "transparent",
                          color: active ? "#fff" : "var(--color-text)",
                          borderColor: active ? "var(--color-primary)" : "var(--color-border)",
                        }}>
                        {qr.label}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <p className="text-xs opacity-60">Rango personalizado</p>
                  <input type="datetime-local" className="w-full text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                    value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
                  <input type="datetime-local" className="w-full text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                    value={customTo} onChange={e => setCustomTo(e.target.value)} />
                  <button
                    className="w-full py-1 text-xs rounded text-white"
                    style={{ backgroundColor: "var(--color-primary)" }}
                    onClick={() => { setGlobalRange({ kind: "absolute", from: customFrom, to: customTo }); setShowRangePicker(false); }}
                  >
                    Aplicar rango personalizado
                  </button>
                </div>
                {globalRange && (
                  <button className="w-full py-1 text-xs rounded border hover:opacity-80"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}
                    onClick={() => { setGlobalRange(null); setShowRangePicker(false); }}>
                    <FiRefreshCcw className="inline mr-1" size={11} />
                    Restablecer (usar config de cada widget)
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleCreate}
            className="px-4 py-2 rounded-md font-semibold transition-all shadow hover:scale-[1.02] text-white"
            style={{ backgroundColor: "var(--color-primary)" }}
          >
            + Nuevo widget
          </button>
        </div>
      </div>

      {globalRange && (
        <div className="text-xs px-3 py-1.5 rounded" style={{ backgroundColor: "color-mix(in srgb, var(--color-primary) 15%, transparent)", color: "var(--color-primary)" }}>
          Rango global activo: <strong>{globalRangeLabel()}</strong> — los widgets usan este rango en lugar del individual.
        </div>
      )}

      {/* Estado de carga */}
      {loading && (
        <div className="flex justify-center items-center h-40 gap-3 text-sm opacity-60">
          <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-white/50" />
          Cargando widgets…
        </div>
      )}

      {!loading && error && (
        <div className="p-4 rounded-lg text-sm" style={{ backgroundColor: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" }}>
          {error}
        </div>
      )}

      {!loading && !widgets.length && !error && (
        <div className="rounded-xl p-6 text-center text-sm"
          style={{ color: "var(--color-text-muted,#aaa)", border: "1px dashed var(--color-border)" }}>
          No hay widgets aún. Crea uno con "+ Nuevo widget".
        </div>
      )}

      {/* Grid de widgets */}
      {!loading && widgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {widgets.map(w => (
            <div
              key={w.id}
              className={`rounded-xl shadow-md hover:shadow-lg transition-shadow duration-300 p-4 ${colSpanClass(w.colSpan)}`}
              style={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)" }}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold flex items-center gap-2">
                  <span className="text-xs opacity-60 capitalize">{w.chartType}</span>
                  <span className="text-base">{w.title}</span>
                  {w.pinned && (
                    <span className="ml-1 text-xs px-2 py-0.5 rounded-full bg-green-700 text-white">
                      Destacado
                    </span>
                  )}
                </h3>
                <div className="flex gap-1">
                  <button onClick={() => setPinned(w.id, !w.pinned)}
                    className={`text-xs px-2 py-1 rounded text-white ${w.pinned ? "bg-gray-600 hover:bg-gray-700" : "bg-green-700 hover:bg-green-800"}`}
                    title={w.pinned ? "Quitar de Sensores" : "Mostrar en Sensores"}>
                    📌
                  </button>
                  <button onClick={() => handleEdit(w)}
                    className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-2 py-1 rounded"
                    title="Editar">
                    ✏️
                  </button>
                  <button onClick={() => handleDelete(w.id)}
                    className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
                    title="Eliminar">
                    🗑️
                  </button>
                </div>
              </div>
              <ChartRenderer config={effectiveConfig(w)} data={normalized} />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <WidgetConfigModal
          initial={editing}
          data={normalized}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
