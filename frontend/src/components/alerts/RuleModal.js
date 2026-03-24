import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { FiAlertCircle, FiEdit, FiX, FiChevronDown, FiChevronUp, FiSearch, FiCode, FiEye, FiEyeOff, FiCopy } from "react-icons/fi";
import { BACKEND } from "../../utils/api";
import Portal from "../Portal";

/* ============================================================
   VARIABLES DE PLANTILLA disponibles en el HTML personalizado
============================================================ */
const TEMPLATE_VARS = [
  {
    group: "Sensor",
    vars: [
      { name: "{{sensor_id}}",    desc: "ID del sensor",             example: "sensor-01" },
      { name: "{{sensor_name}}",  desc: "Nombre del sensor",          example: "Temp Rack A" },
      { name: "{{metric}}",       desc: "Métrica medida",             example: "temperatura" },
      { name: "{{value}}",        desc: "Valor actual que disparó la alerta", example: "35.2" },
      { name: "{{unit}}",         desc: "Unidad de medida",           example: "°C" },
    ],
  },
  {
    group: "Condición",
    vars: [
      { name: "{{op}}",             desc: "Operador de comparación",    example: ">=" },
      { name: "{{threshold}}",      desc: "Umbral configurado",         example: "30" },
      { name: "{{severity}}",       desc: "Gravedad de la regla",       example: "WARNING" },
      { name: "{{severity_color}}", desc: "Color hex según gravedad",   example: "#f59e0b" },
    ],
  },
  {
    group: "Contexto",
    vars: [
      { name: "{{rule_name}}",  desc: "Nombre de esta regla",         example: "Temp alta CPU" },
      { name: "{{timestamp}}", desc: "Fecha y hora de la alerta",    example: "2026-03-22 14:30" },
      { name: "{{location}}",  desc: "Ubicación del gabinete",       example: "Sala DC" },
    ],
  },
];

const SEVERITY_COLORS = {
  CRITICAL: "#ef4444",
  HIGH:     "#f97316",
  WARNING:  "#f59e0b",
  INFO:     "#3b82f6",
};

/* Plantilla HTML predeterminada */
const DEFAULT_HTML = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
  <!-- Cabecera de alerta -->
  <div style="background:{{severity_color}};padding:18px 24px">
    <h2 style="color:#fff;margin:0;font-size:18px">⚠️ Alerta: {{rule_name}}</h2>
    <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:13px">{{timestamp}}</p>
  </div>

  <!-- Cuerpo -->
  <div style="padding:24px;background:#ffffff">
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr>
        <td style="padding:8px 0;color:#6b7280;width:140px">Sensor</td>
        <td style="padding:8px 0;font-weight:600;color:#111827">{{sensor_name}} <span style="opacity:0.5;font-size:12px">({{sensor_id}})</span></td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:8px;color:#6b7280">Métrica</td>
        <td style="padding:8px;font-weight:600;color:#111827">{{metric}}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280">Valor actual</td>
        <td style="padding:8px 0;font-weight:700;color:{{severity_color}};font-size:20px">{{value}} {{unit}}</td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:8px;color:#6b7280">Condición</td>
        <td style="padding:8px;font-family:monospace;color:#374151">{{metric}} {{op}} {{threshold}}</td>
      </tr>
      <tr>
        <td style="padding:8px 0;color:#6b7280">Gravedad</td>
        <td style="padding:8px 0">
          <span style="background:{{severity_color}};color:#fff;padding:3px 12px;border-radius:99px;font-size:12px;font-weight:700">
            {{severity}}
          </span>
        </td>
      </tr>
      <tr style="background:#f9fafb">
        <td style="padding:8px;color:#6b7280">Ubicación</td>
        <td style="padding:8px;color:#374151">{{location}}</td>
      </tr>
    </table>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <p style="color:#9ca3af;font-size:12px;margin:0">
      Generado automáticamente por <strong>Gateway IoT</strong> · {{timestamp}}
    </p>
  </div>
</div>`;

/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */
export default function RuleModal({ open, onClose, onCreated, profiles, initialData }) {
  const isEditing = !!initialData;

  const [form,         setForm]         = useState(emptyForm());
  const [candidates,   setCandidates]   = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [err,          setErr]          = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHtmlMsg,  setShowHtmlMsg]  = useState(false);
  const [showPreview,  setShowPreview]  = useState(false);

  const [sensorSearch,  setSensorSearch]  = useState("");
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const [tooltipVar,    setTooltipVar]    = useState(null);

  const dropdownRef      = useRef(null);
  const htmlTextareaRef  = useRef(null);

  /* ---- Carga inicial ---- */
  useEffect(() => {
    if (!open) return;
    setForm({
      ...emptyForm(),
      ...(initialData || {}),
      recipients:       initialData?.channels_json?.email?.to?.join(", ") || "",
      email_profile_id: initialData?.channels_json?.email?.profile_id ?? "",
      custom_html:      initialData?.custom_html || "",
    });
    setErr("");
    setSensorSearch("");
    setDropdownOpen(false);
    setShowAdvanced(false);
    setShowHtmlMsg(false);
    setShowPreview(false);
    setLoading(true);

    fetch(`${BACKEND}/datos_sensores`)
      .then(r => r.json())
      .then(data => {
        const uniq = new Map();
        data.forEach(it => {
          const sid    = String(it.sensor_id ?? it.id ?? "");
          const tipo   = String(it.tipo ?? "");
          const nombre = it.nombre || it.name || sid;
          const key    = `${sid}__${tipo}`;
          if (!uniq.has(key)) uniq.set(key, { value: sid, tipo, label: `${nombre} — ${tipo}`, metricSugg: tipo });
        });
        setCandidates(Array.from(uniq.values()));
      })
      .catch(() => setErr("No se pudo cargar la lista de sensores."))
      .finally(() => setLoading(false));
  }, [open, initialData]);

  /* Cerrar dropdown al click fuera */
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const metricHints = useMemo(() => {
    const base = new Set(["temperatura", "humedad", "cpu", "memoria"]);
    candidates.forEach(c => c.metricSugg && base.add(c.metricSugg));
    return Array.from(base);
  }, [candidates]);

  const filteredCandidates = useMemo(() => {
    const q = sensorSearch.toLowerCase();
    return candidates.filter(c => c.label.toLowerCase().includes(q) || c.value.toLowerCase().includes(q));
  }, [candidates, sensorSearch]);

  const selectedCandidate = candidates.find(c => c.value === form.selector);

  const selectSensor = (c) => {
    set("selector", c.value);
    if (!form.metric && c.metricSugg) set("metric", c.metricSugg);
    setSensorSearch("");
    setDropdownOpen(false);
  };

  /* ---- Insertar variable en la posición del cursor ---- */
  const insertVariable = useCallback((varName) => {
    const ta = htmlTextareaRef.current;
    if (!ta) { set("custom_html", (form.custom_html || "") + varName); return; }
    const start  = ta.selectionStart;
    const end    = ta.selectionEnd;
    const before = (form.custom_html || "").slice(0, start);
    const after  = (form.custom_html || "").slice(end);
    const newVal = before + varName + after;
    set("custom_html", newVal);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + varName.length;
      ta.focus();
    });
  }, [form.custom_html]);

  /* ---- Vista previa: sustituye variables con valores de muestra ---- */
  const previewHtml = useMemo(() => {
    const previewMap = {
      sensor_id:      "sensor-01",
      sensor_name:    "Sensor de temperatura",
      metric:         form.metric  || "temperatura",
      value:          "35.2",
      unit:           "°C",
      op:             form.op      || ">",
      threshold:      String(form.threshold || 30),
      severity:       form.severity || "WARNING",
      severity_color: SEVERITY_COLORS[form.severity] || "#f59e0b",
      rule_name:      form.name    || "Mi regla",
      timestamp:      new Date().toLocaleString("es-MX"),
      location:       "Sala DC",
    };
    return (form.custom_html || "").replace(
      /\{\{(\w+)\}\}/g,
      (_, key) => previewMap[key] ?? `{{${key}}}`
    );
  }, [form.custom_html, form.metric, form.op, form.threshold, form.severity, form.name]);

  /* ---- Submit ---- */
  const submit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.selector || !form.metric || !form.email_profile_id) {
      setErr("Completa todos los campos requeridos (marcados *).");
      return;
    }
    const toList = form.recipients.split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
    const payload = {
      ...form,
      threshold:    Number(form.threshold),
      duration_sec: Number(form.duration_sec),
      hysteresis:   Number(form.hysteresis),
      cooldown_sec: Number(form.cooldown_sec),
      custom_html:  form.custom_html || null,
      channels_json: { email: { profile_id: Number(form.email_profile_id), to: toList } },
    };
    try {
      const url    = isEditing ? `${BACKEND}/alerts/rules/${initialData.id}` : `${BACKEND}/alerts/rules`;
      const method = isEditing ? "PUT" : "POST";
      const res    = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const js     = await res.json();
      if (!res.ok || js.error) throw new Error(js.error || "Error al guardar la regla");
      onCreated?.();
      onClose?.();
    } catch (e) { setErr(String(e.message || e)); }
  };

  if (!open) return null;

  const hasCustomHtml = (form.custom_html || "").trim().length > 0;

  return (
    <Portal>
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50 p-4">
      <div
        className={`w-full rounded-2xl border shadow-2xl overflow-y-auto max-h-[92vh] transition-all duration-200 ${showHtmlMsg ? "max-w-4xl" : "max-w-2xl"}`}
        style={{ backgroundColor: "var(--color-card)", color: "var(--color-text)", borderColor: "var(--color-border)" }}
      >
        <div className="p-6">

          {/* Header */}
          <div className="flex justify-between items-center border-b pb-4 mb-5" style={{ borderColor: "var(--color-border)" }}>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <FiAlertCircle size={16} style={{ color: "var(--color-primary)" }} />
              {isEditing ? "Editar regla de alerta" : "Nueva regla de alerta"}
            </h2>
            <button onClick={onClose} className="opacity-40 hover:opacity-100 transition"><FiX size={16} /></button>
          </div>

          <form onSubmit={submit} className="space-y-5 text-sm">
            {err && (
              <div className="text-sm px-4 py-3 rounded-xl"
                style={{ backgroundColor: "color-mix(in srgb,#ef4444 12%,transparent)", border: "1px solid #ef444430", color: "#f87171" }}>
                {err}
              </div>
            )}

            {/* === 1. Identificación === */}
            <Section label="Identificación">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Nombre de la regla *" value={form.name} onChange={e => set("name", e.target.value)} />
                <FormSelect label="Gravedad *" value={form.severity} onChange={e => set("severity", e.target.value)}
                  options={["WARNING", "HIGH", "CRITICAL"]} />
              </div>
            </Section>

            {/* === 2. Condición === */}
            <Section label="Condición">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sensor buscable */}
                <div className="md:col-span-2" ref={dropdownRef}>
                  <label className="block text-xs font-medium mb-1.5 opacity-60">Sensor *</label>
                  <div className="relative">
                    <div className="w-full px-4 py-2 rounded-lg flex items-center justify-between cursor-pointer"
                      style={inputStyle} onClick={() => setDropdownOpen(v => !v)}>
                      <span className={selectedCandidate ? "" : "opacity-40"}>
                        {selectedCandidate ? selectedCandidate.label : loading ? "Cargando sensores…" : "— seleccionar sensor —"}
                      </span>
                      {dropdownOpen ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                    </div>
                    {dropdownOpen && (
                      <div className="absolute z-50 w-full mt-1 rounded-xl border shadow-2xl overflow-hidden"
                        style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }}>
                        <div className="p-2 border-b" style={{ borderColor: "var(--color-border)" }}>
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={inputStyle}>
                            <FiSearch size={12} />
                            <input autoFocus className="bg-transparent outline-none flex-1 text-sm"
                              placeholder="Buscar por ID o nombre…"
                              value={sensorSearch} onChange={e => setSensorSearch(e.target.value)} />
                          </div>
                        </div>
                        <div className="max-h-44 overflow-y-auto">
                          {filteredCandidates.length === 0 && <div className="px-4 py-3 text-sm opacity-40">Sin resultados</div>}
                          {filteredCandidates.map(c => (
                            <div key={`${c.value}-${c.tipo}`}
                              className="px-4 py-2 cursor-pointer text-sm hover:bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] transition"
                              onClick={() => selectSensor(c)}>
                              <span className="font-medium">{c.value}</span>
                              <span className="ml-2 opacity-50 text-xs">— {c.tipo}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Métrica */}
                <div>
                  <label className="block text-xs font-medium mb-1.5 opacity-60">Métrica *</label>
                  <input value={form.metric} onChange={e => set("metric", e.target.value)}
                    list="ruleMetrics" className="w-full px-4 py-2 rounded-lg" style={inputStyle}
                    placeholder="temperatura, humedad…" />
                  <datalist id="ruleMetrics">{metricHints.map(m => <option key={m} value={m} />)}</datalist>
                </div>

                {/* Operador + Umbral */}
                <div className="flex gap-2">
                  <div className="w-28">
                    <FormSelect label="Operador" value={form.op} onChange={e => set("op", e.target.value)}
                      options={[">", "<", ">=", "<=", "==", "!="]} />
                  </div>
                  <div className="flex-1">
                    <FormField label="Umbral *" type="number" value={form.threshold}
                      onChange={e => set("threshold", e.target.value)} />
                  </div>
                </div>
              </div>
            </Section>

            {/* === 3. Notificación === */}
            <Section label="Notificación">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormSelect label="Perfil SMTP *" value={form.email_profile_id}
                  onChange={e => set("email_profile_id", e.target.value)}
                  options={profiles.map(p => ({ value: p.id, label: p.name }))} />
                <FormField label="Destinatarios" placeholder="correo@dominio.com, otro@dominio.com"
                  value={form.recipients} onChange={e => set("recipients", e.target.value)} />
              </div>
            </Section>

            {/* === 4. Temporización (avanzado colapsable) === */}
            <CollapseSection
              label="Opciones avanzadas · temporización"
              open={showAdvanced}
              onToggle={() => setShowAdvanced(v => !v)}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <FormField label="Duración mínima (seg)" type="number"
                    value={form.duration_sec} onChange={e => set("duration_sec", e.target.value)} />
                  <p className="text-xs mt-1 opacity-40">La condición debe cumplirse durante este tiempo</p>
                </div>
                <div>
                  <FormField label="Histéresis" type="number"
                    value={form.hysteresis} onChange={e => set("hysteresis", e.target.value)} />
                  <p className="text-xs mt-1 opacity-40">Margen para evitar oscilaciones</p>
                </div>
                <div>
                  <FormField label="Cooldown (seg)" type="number"
                    value={form.cooldown_sec} onChange={e => set("cooldown_sec", e.target.value)} />
                  <p className="text-xs mt-1 opacity-40">Tiempo mínimo entre alertas repetidas</p>
                </div>
              </div>
            </CollapseSection>

            {/* === 5. MENSAJE HTML PERSONALIZADO === */}
            <CollapseSection
              label={<span className="flex items-center gap-2"><FiCode size={13} /> Mensaje HTML personalizado <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "color-mix(in srgb,var(--color-primary) 15%,transparent)", color: "var(--color-primary)" }}>Avanzado</span>{hasCustomHtml && <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" title="Plantilla activa" />}</span>}
              open={showHtmlMsg}
              onToggle={() => setShowHtmlMsg(v => !v)}
            >
              <div className="space-y-4">

                {/* Descripción */}
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-color-muted,#9ca3af)" }}>
                  Personaliza el cuerpo del correo de alerta con HTML. Usa las variables de abajo para insertar
                  datos reales del sensor en el momento que se dispare la alerta. Si dejas este campo vacío
                  se usará la plantilla predeterminada del sistema.
                </p>

                {/* ---- Panel de variables ---- */}
                <div className="rounded-xl border p-3 space-y-3" style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}>
                  <p className="text-xs font-semibold opacity-50 uppercase tracking-wide">
                    Variables disponibles — clic para insertar en el cursor
                  </p>
                  {TEMPLATE_VARS.map(group => (
                    <div key={group.group}>
                      <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--color-primary)", opacity: 0.7 }}>
                        {group.group}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {group.vars.map(v => (
                          <div key={v.name} className="relative">
                            <button
                              type="button"
                              onClick={() => insertVariable(v.name)}
                              onMouseEnter={() => setTooltipVar(v.name)}
                              onMouseLeave={() => setTooltipVar(null)}
                              className="font-mono text-[11px] px-2 py-1 rounded-lg border transition hover:opacity-100 cursor-pointer"
                              style={{
                                backgroundColor: "color-mix(in srgb,var(--color-primary) 10%,transparent)",
                                color: "var(--color-primary)",
                                borderColor: "color-mix(in srgb,var(--color-primary) 25%,transparent)",
                                opacity: 0.85,
                              }}
                            >
                              {v.name}
                            </button>
                            {/* Tooltip */}
                            {tooltipVar === v.name && (
                              <div className="absolute bottom-full mb-1.5 left-0 z-50 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap shadow-xl pointer-events-none"
                                style={{ backgroundColor: "var(--color-card)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                                <p className="font-semibold mb-0.5">{v.desc}</p>
                                <p className="opacity-50">ej. <span className="font-mono">{v.example}</span></p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ---- Acciones del editor ---- */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button"
                    onClick={() => set("custom_html", DEFAULT_HTML)}
                    className="text-xs px-3 py-1.5 rounded-lg border transition hover:opacity-80"
                    style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
                    Usar plantilla predeterminada
                  </button>
                  {hasCustomHtml && (
                    <button type="button"
                      onClick={() => set("custom_html", "")}
                      className="text-xs px-3 py-1.5 rounded-lg border transition hover:opacity-80 hover:text-red-400 hover:border-red-400/40"
                      style={{ borderColor: "var(--color-border)", color: "var(--text-color-muted,#9ca3af)" }}>
                      Limpiar
                    </button>
                  )}
                  <button type="button"
                    onClick={() => setShowPreview(v => !v)}
                    className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition hover:opacity-80"
                    style={{
                      backgroundColor: showPreview ? "color-mix(in srgb,var(--color-primary) 12%,transparent)" : "transparent",
                      borderColor: showPreview ? "var(--color-primary)" : "var(--color-border)",
                      color: showPreview ? "var(--color-primary)" : "var(--color-text)",
                    }}>
                    {showPreview ? <FiEyeOff size={12} /> : <FiEye size={12} />}
                    Vista previa
                  </button>
                </div>

                {/* ---- Editor HTML ---- */}
                <div className={`grid gap-4 ${showPreview ? "grid-cols-2" : "grid-cols-1"}`}>
                  {/* Textarea */}
                  <div>
                    <label className="block text-xs opacity-40 mb-1.5">HTML del mensaje</label>
                    <textarea
                      ref={htmlTextareaRef}
                      value={form.custom_html || ""}
                      onChange={e => set("custom_html", e.target.value)}
                      rows={14}
                      spellCheck={false}
                      placeholder={`<!-- Escribe tu HTML aquí o usa "Plantilla predeterminada" -->`}
                      className="w-full px-3 py-2.5 rounded-xl text-xs font-mono leading-relaxed resize-y"
                      style={{
                        ...inputStyle,
                        minHeight: 200,
                        tabSize: 2,
                        outline: "none",
                        lineHeight: "1.6",
                      }}
                    />
                    <p className="text-[11px] mt-1 opacity-30">
                      {(form.custom_html || "").length} caracteres
                    </p>
                  </div>

                  {/* Vista previa */}
                  {showPreview && (
                    <div>
                      <label className="block text-xs opacity-40 mb-1.5">Vista previa (valores de muestra)</label>
                      <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)", height: "auto", minHeight: 200 }}>
                        {previewHtml ? (
                          <iframe
                            key={previewHtml}
                            srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#fff}</style></head><body>${previewHtml}</body></html>`}
                            sandbox="allow-same-origin"
                            title="Vista previa del mensaje HTML"
                            style={{ width: "100%", height: 310, border: "none", display: "block" }}
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full text-xs opacity-30 p-8 text-center">
                            Escribe HTML arriba para ver la vista previa
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] mt-1 opacity-30">
                        Las variables se muestran con valores de ejemplo
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CollapseSection>

            {/* Acciones */}
            <div className="flex justify-end gap-3 pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
              <button type="button" onClick={onClose}
                className="px-5 py-2 border rounded-xl text-sm transition hover:opacity-80"
                style={{ borderColor: "var(--color-border)", color: "var(--color-text)" }}>
                Cancelar
              </button>
              <button type="submit"
                className="px-6 py-2 text-white rounded-xl text-sm flex items-center gap-2 transition hover:opacity-90"
                style={{ backgroundColor: "var(--color-primary)" }}>
                {isEditing ? <><FiEdit size={13} /> Actualizar regla</> : "Crear regla"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
    </Portal>
  );
}

/* ============================================================
   SUB-COMPONENTES
============================================================ */
function Section({ label, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase font-semibold mb-3 tracking-wide" style={{ color: "var(--text-color-muted,#9ca3af)" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

function CollapseSection({ label, open, onToggle, children }) {
  return (
    <div>
      <button type="button" onClick={onToggle}
        className="flex items-center gap-2 text-sm font-medium w-full text-left transition hover:opacity-80"
        style={{ color: "var(--color-primary)" }}>
        {open ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
        {label}
      </button>
      {open && (
        <div className="mt-3 p-4 rounded-xl border" style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

function emptyForm() {
  return {
    name: "", scope: "sensor", selector: "", metric: "",
    op: ">", threshold: 0, duration_sec: 0, hysteresis: 2, cooldown_sec: 300,
    severity: "WARNING", email_profile_id: "", recipients: "", custom_html: "",
  };
}

const inputStyle = {
  backgroundColor: "var(--color-bg)",
  color: "var(--color-text)",
  border: "1px solid var(--color-border)",
};

function FormField({ label, ...props }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 opacity-60">{label}</label>
      <input {...props} className="w-full px-4 py-2 rounded-lg text-sm" style={inputStyle} />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 opacity-60">{label}</label>
      <select value={value} onChange={onChange} className="w-full px-4 py-2 rounded-lg text-sm" style={inputStyle}>
        <option value="">— seleccionar —</option>
        {options.map(opt =>
          typeof opt === "string"
            ? <option key={opt} value={opt}>{opt}</option>
            : <option key={opt.value} value={opt.value}>{opt.label}</option>
        )}
      </select>
    </div>
  );
}
