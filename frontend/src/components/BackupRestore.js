import React, { useState, useRef } from "react";
import {
  FiDownload, FiUpload, FiCheckCircle, FiAlertTriangle,
  FiArchive, FiRefreshCcw, FiInfo,
} from "react-icons/fi";
import { BACKEND } from "../utils/api";
import { authHeader } from "../utils/auth";
import Portal from "./Portal";

/* ─── helpers ─────────────────────────────────────────── */
function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-CR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function SectionBadge({ count, label }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0"
      style={{ borderColor: "var(--color-border)" }}>
      <span className="text-sm" style={{ color: "var(--color-text)", opacity: 0.7 }}>{label}</span>
      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
        style={{ backgroundColor: "color-mix(in srgb,var(--color-primary) 15%,transparent)", color: "var(--color-primary)" }}>
        {count}
      </span>
    </div>
  );
}

/* ─── Modal de confirmación de restauración ───────────── */
function ConfirmRestoreModal({ preview, onConfirm, onCancel }) {
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50 p-4">
        <div className="rounded-2xl shadow-xl p-6 w-full max-w-md"
          style={{ backgroundColor: "var(--color-card)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 rounded-xl" style={{ backgroundColor: "#f59e0b18" }}>
              <FiAlertTriangle size={20} style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <h3 className="font-bold text-lg">Confirmar restauración</h3>
              <p className="text-xs opacity-50">Esta acción reemplazará la configuración actual</p>
            </div>
          </div>

          <div className="rounded-xl border p-4 mb-4 space-y-1"
            style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-2 opacity-40">Contenido del backup</p>
            <SectionBadge label="Gabinetes"        count={preview.gabinetes?.length ?? 0} />
            <SectionBadge label="Widgets (paneles)" count={preview.widgets?.length ?? 0} />
            <SectionBadge label="Reglas de alerta" count={preview.alert_rules?.length ?? 0} />
            <SectionBadge label="Perfiles SMTP"    count={preview.smtp_profiles?.length ?? 0} />
            {preview.exported_at && (
              <p className="text-[11px] mt-2 opacity-40">Exportado: {fmtDate(preview.exported_at)}</p>
            )}
          </div>

          <p className="text-sm mb-5 p-3 rounded-lg"
            style={{ backgroundColor: "#ef444410", color: "#fca5a5", border: "1px solid #ef444430" }}>
            Los registros existentes serán <b>reemplazados</b> por los del archivo. Las lecturas históricas no se ven afectadas.
          </p>

          <div className="flex gap-3 justify-end">
            <button onClick={onCancel} className="btn-danger">Cancelar</button>
            <button onClick={onConfirm} className="btn-primary">Restaurar ahora</button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/* ─── Componente principal ────────────────────────────── */
export default function BackupRestore() {
  const [exporting, setExporting]   = useState(false);
  const [importing, setImporting]   = useState(false);
  const [preview,   setPreview]     = useState(null);   // JSON parsed del archivo
  const [fileName,  setFileName]    = useState("");
  const [confirm,   setConfirm]     = useState(false);
  const [result,    setResult]      = useState(null);   // { ok, message, type }
  const fileRef = useRef(null);

  /* ── Exportar ── */
  const handleExport = async () => {
    setExporting(true);
    setResult(null);
    try {
      const res = await fetch(`${BACKEND}/api/backup`, { headers: authHeader() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      const ts   = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `backup_monitoreo_${ts}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setResult({ ok: true, type: "export", message: `Backup exportado: ${a.download}` });
    } catch (e) {
      setResult({ ok: false, type: "export", message: `Error al exportar: ${e.message}` });
    } finally {
      setExporting(false);
    }
  };

  /* ── Seleccionar archivo ── */
  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        if (parsed.version !== "1.0") {
          setResult({ ok: false, type: "import", message: `Versión no compatible: ${parsed.version}` });
          setPreview(null);
        } else {
          setPreview(parsed);
        }
      } catch {
        setResult({ ok: false, type: "import", message: "El archivo no es un JSON válido." });
        setPreview(null);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  /* ── Restaurar ── */
  const handleRestore = async () => {
    if (!preview) return;
    setConfirm(false);
    setImporting(true);
    setResult(null);
    try {
      const res = await fetch(`${BACKEND}/api/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify(preview),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const r = data.restored || {};
      setResult({
        ok: true, type: "import",
        message: `Restauración completada: ${r.gabinetes ?? 0} gabinetes, ${r.widgets ?? 0} widgets, ${r.alert_rules ?? 0} reglas.`,
      });
      setPreview(null);
      setFileName("");
    } catch (e) {
      setResult({ ok: false, type: "import", message: `Error al restaurar: ${e.message}` });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Título */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl"
          style={{ backgroundColor: "color-mix(in srgb,var(--color-primary) 12%,transparent)" }}>
          <FiArchive size={20} style={{ color: "var(--color-primary)" }} />
        </div>
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--color-text)" }}>
            Backup y Restauración
          </h2>
          <p className="text-xs opacity-50" style={{ color: "var(--color-text)" }}>
            Exporta o importa la configuración completa del sistema
          </p>
        </div>
      </div>

      {/* Alerta info */}
      <div className="flex items-start gap-3 p-4 rounded-xl border text-sm"
        style={{ backgroundColor: "color-mix(in srgb,var(--color-primary) 8%,transparent)",
                 borderColor: "color-mix(in srgb,var(--color-primary) 25%,transparent)",
                 color: "var(--color-text)" }}>
        <FiInfo size={16} style={{ color: "var(--color-primary)", marginTop: 1, flexShrink: 0 }} />
        <span className="opacity-70">
          El backup incluye <b>gabinetes</b>, <b>widgets del dashboard</b>, <b>reglas de alerta</b> y <b>perfiles SMTP</b>.
          Las lecturas históricas y usuarios <b>no</b> se incluyen. Útil para replicar configuración en otro gateway o recuperarse de fallos.
        </span>
      </div>

      {/* Resultado */}
      {result && (
        <div className="flex items-center gap-3 p-4 rounded-xl border text-sm"
          style={{
            backgroundColor: result.ok ? "#10b98110" : "#ef444410",
            borderColor:     result.ok ? "#10b98130" : "#ef444430",
            color:           result.ok ? "#10b981"   : "#fca5a5",
          }}>
          {result.ok
            ? <FiCheckCircle size={16} style={{ flexShrink: 0 }} />
            : <FiAlertTriangle size={16} style={{ flexShrink: 0 }} />}
          {result.message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── EXPORTAR ── */}
        <div className="rounded-2xl border p-5 space-y-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card)" }}>
          <div className="flex items-center gap-2">
            <FiDownload size={15} style={{ color: "var(--color-primary)" }} />
            <h3 className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Exportar backup</h3>
          </div>
          <p className="text-xs opacity-50" style={{ color: "var(--color-text)" }}>
            Descarga un archivo <code>.json</code> con toda la configuración actual del sistema.
          </p>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {exporting
              ? <><FiRefreshCcw size={14} className="animate-spin" /> Exportando…</>
              : <><FiDownload size={14} /> Descargar backup</>}
          </button>
        </div>

        {/* ── IMPORTAR ── */}
        <div className="rounded-2xl border p-5 space-y-4"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card)" }}>
          <div className="flex items-center gap-2">
            <FiUpload size={15} style={{ color: "var(--color-primary)" }} />
            <h3 className="font-semibold text-sm" style={{ color: "var(--color-text)" }}>Restaurar backup</h3>
          </div>
          <p className="text-xs opacity-50" style={{ color: "var(--color-text)" }}>
            Selecciona un archivo de backup generado por este sistema para restaurar la configuración.
          </p>

          {/* File picker */}
          <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-sm font-medium transition hover:opacity-80"
            style={{ borderColor: "var(--color-border)", color: "var(--color-text)",
                     backgroundColor: "var(--color-bg)" }}
          >
            <FiUpload size={14} />
            {fileName || "Seleccionar archivo…"}
          </button>

          {/* Preview */}
          {preview && (
            <div className="rounded-xl border p-3 space-y-1"
              style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}>
              <p className="text-[11px] font-bold uppercase tracking-wider opacity-40 mb-2"
                style={{ color: "var(--color-text)" }}>Vista previa</p>
              <SectionBadge label="Gabinetes"         count={preview.gabinetes?.length ?? 0} />
              <SectionBadge label="Widgets (paneles)"  count={preview.widgets?.length ?? 0} />
              <SectionBadge label="Reglas de alerta"  count={preview.alert_rules?.length ?? 0} />
              <SectionBadge label="Perfiles SMTP"     count={preview.smtp_profiles?.length ?? 0} />
              {preview.exported_at && (
                <p className="text-[11px] mt-1 opacity-35" style={{ color: "var(--color-text)" }}>
                  Exportado el {fmtDate(preview.exported_at)}
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => setConfirm(true)}
            disabled={!preview || importing}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {importing
              ? <><FiRefreshCcw size={14} className="animate-spin" /> Restaurando…</>
              : <><FiUpload size={14} /> Restaurar configuración</>}
          </button>
        </div>
      </div>

      {/* Modal de confirmación */}
      {confirm && preview && (
        <ConfirmRestoreModal
          preview={preview}
          onConfirm={handleRestore}
          onCancel={() => setConfirm(false)}
        />
      )}
    </div>
  );
}
