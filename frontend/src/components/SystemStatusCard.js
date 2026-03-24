import React, { useEffect, useLayoutEffect, useRef, useState } from "react";

// ===========================================================
// ✅ Detección automática de entorno (LAN vs Cloudflare túnel)
// ===========================================================
const isLAN =
  window.location.hostname === "localhost" ||
  window.location.hostname.startsWith("192.168.") ||
  window.location.hostname.startsWith("10.");

const BACKEND = isLAN
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : "https://api.tesis-monitoring.xyz/";

// ===========================================================
// === COMPONENTE PRINCIPAL =================================
// ===========================================================

function GaugeRing({ valueText, percent, accent = "emerald" }) {
  const size = 100;
  const stroke = 10;
  const r = size / 2 - stroke;
  const C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const dash = C * (1 - p / 100);

  const accentColor =
    {
      emerald: "var(--color-primary)",
      amber: "#fbbf24",
      rose: "#f87171",
    }[accent] || "var(--color-primary)";

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      preserveAspectRatio="xMidYMid meet"
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r}
          stroke="var(--color-border)" strokeWidth={stroke} fill="none" strokeLinecap="round" />
        <circle cx={size / 2} cy={size / 2} r={r}
          stroke={accentColor} strokeWidth={stroke} fill="none"
          strokeDasharray={C} strokeDashoffset={dash} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s linear" }} />
      </g>
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontSize="20" fontWeight="bold" fill="var(--color-text)">{valueText}</text>
    </svg>
  );
}

/* -------------------------------------------------------
   GaugeTileEmbedded: versión embedded con ResizeObserver
   → mide el contenedor en píxeles reales para el ring
------------------------------------------------------- */
function GaugeTileEmbedded({ label, valueText, percent, accent, helperLines = [] }) {
  const containerRef = useRef(null);
  // dims: dimensiones reales del contenedor medidas con ResizeObserver
  const [dims, setDims] = useState({ w: 200, h: 80 });

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setDims({ w: Math.floor(width), h: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ring size: proporcional al contenedor, sin límite duro
  // - En modo fila: limitado por la altura y por el 38% del ancho (el resto es texto)
  // - En modo columna (panel alto y estrecho): limitado por el 70% del ancho
  const isColumn = dims.h > dims.w * 0.75;  // panel más alto que ancho → columna
  const ringPx = isColumn
    ? Math.max(20, Math.min(dims.h * 0.55, dims.w * 0.70))  // columna: ring grande, texto abajo
    : Math.max(20, Math.min(dims.h - 8,   dims.w * 0.38));  // fila:    ring escala con altura

  // Tamaño de fuente proporcional al ring
  const fsLabel  = Math.max(9,  Math.min(ringPx * 0.15, 13));
  const fsHelper = Math.max(8,  Math.min(ringPx * 0.12, 11));

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%', overflow: 'hidden',
        display: 'flex',
        flexDirection: isColumn ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: isColumn ? 'center' : 'flex-start',
        gap: isColumn ? 4 : 8,
        padding: '3px 4px',
        boxSizing: 'border-box',
      }}
    >
      {/* Ring: tamaño exacto en píxeles según ResizeObserver */}
      <div style={{ width: ringPx, height: ringPx, flexShrink: 0 }}>
        <GaugeRing valueText={valueText} percent={percent} accent={accent} />
      </div>

      {/* Info: texto proporcional */}
      <div style={{
        flex: isColumn ? '0 0 auto' : 1,
        minWidth: 0,
        overflow: 'hidden',
        textAlign: isColumn ? 'center' : 'left',
      }}>
        <div style={{
          fontSize: fsLabel, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.04em', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
          color: 'var(--color-text)',
        }}>{label}</div>
        {helperLines.map((txt, i) => (
          <div key={i} style={{
            fontSize: fsHelper, marginTop: 1,
            color: 'var(--text-color-muted, #aaa)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{txt}</div>
        ))}
        <div style={{ fontSize: fsHelper, marginTop: 1, color: 'var(--text-color-muted, #aaa)' }}>
          {Math.round(percent)}%
        </div>
      </div>
    </div>
  );
}

function GaugeTile({ label, valueText, percent, accent, helperLines = [], embedded = false }) {
  if (embedded) {
    return (
      <GaugeTileEmbedded
        label={label} valueText={valueText} percent={percent}
        accent={accent} helperLines={helperLines}
      />
    );
  }

  return (
    <div
      className="rounded-2xl p-5 flex items-center gap-5 border"
      style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
    >
      <div className="shrink-0" style={{ width: 100, height: 100 }}>
        <GaugeRing valueText={valueText} percent={percent} accent={accent} />
      </div>
      <div className="flex flex-col">
        <div className="text-sm uppercase tracking-wide font-semibold">{label}</div>
        {helperLines.map((txt, i) => (
          <div key={i} className="text-xs mt-1">{txt}</div>
        ))}
        <div className="text-[11px] mt-1" style={{ color: "var(--text-color-muted, #aaa)" }}>
          {Math.round(percent)}% del objetivo
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------
   Componente exportado
   - Sin prop `metric`: renderiza los 3 tiles (uso legacy)
   - Con prop `metric` ('temp' | 'cpu' | 'mem'): renderiza solo ese tile
------------------------------------------------------- */
export default function SystemStatusCard({ metric } = {}) {
  const [snap, setSnap] = useState(null);
  const [err, setErr] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    const fetchSnap = async (signal) => {
      try {
        const res = await fetch(`${BACKEND}/system/snapshot?t=${Date.now()}`, {
          cache: "no-store",
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSnap(data);
        setErr(null);
      } catch (e) {
        if (e.name !== "AbortError") setErr(e.message || "Error al obtener datos");
      }
    };

    const controller = new AbortController();
    fetchSnap(controller.signal);
    intervalRef.current = setInterval(() => fetchSnap(controller.signal), 2500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      controller.abort();
    };
  }, []);

  const temp = snap?.medidas?.cpu_temp?.valor ?? null;
  const cpu  = snap?.medidas?.cpu_usage?.valor ?? null;
  const mem  = snap?.medidas?.mem_usage?.valor ?? null;
  const memTotal = snap?.medidas?.mem_total_mb?.valor ?? null;
  const memUsed  = snap?.medidas?.mem_used_mb?.valor  ?? null;

  const TEMP_MAX = 85;
  const tempPct = temp == null ? 0 : Math.min(100, (temp / TEMP_MAX) * 100);
  const cpuPct  = cpu  == null ? 0 : Math.min(100, cpu);
  const memPct  = mem  == null ? 0 : Math.min(100, mem);

  const tempAccent = temp == null ? "emerald" : temp < 60 ? "emerald" : temp < 80 ? "amber" : "rose";
  const cpuAccent  = cpu  == null ? "emerald" : cpu  < 60 ? "emerald" : cpu  < 85 ? "amber" : "rose";
  const memAccent  = mem  == null ? "emerald" : mem  < 60 ? "emerald" : mem  < 85 ? "amber" : "rose";

  /* ---- Error ---- */
  if (err) {
    if (metric) {
      return (
        <div className="rounded-xl p-4 text-xs" style={{ backgroundColor: "#7f1d1d33", color: "#fecaca" }}>
          ⚠️ Error
        </div>
      );
    }
    return (
      <div
        className="rounded-xl p-4 col-span-full text-sm"
        style={{ backgroundColor: "#7f1d1d33", color: "#fecaca" }}
      >
        ⚠️ Error al cargar: {err}
      </div>
    );
  }

  /* ---- Cargando ---- */
  if (!snap) {
    if (metric) {
      return (
        <div
          className="animate-pulse rounded-xl w-full"
          style={{ backgroundColor: "var(--color-border)", minHeight: 120 }}
        />
      );
    }
    return (
      <>
        <div
          className="rounded-2xl p-5 col-span-1 border animate-pulse"
          style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)", color: "var(--text-color-muted)" }}
        >
          Cargando temperatura…
        </div>
        <div className="rounded-2xl p-5 col-span-1 border animate-pulse" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }} />
        <div className="rounded-2xl p-5 col-span-1 border animate-pulse" style={{ backgroundColor: "var(--color-card)", borderColor: "var(--color-border)" }} />
      </>
    );
  }

  /* ---- Modo individual (metric prop) — sin card propia (embedded) ---- */
  if (metric === "temp") {
    return (
      <GaugeTile embedded
        label="Temp CPU"
        valueText={temp == null ? "N/D" : `${temp.toFixed(1)} °C`}
        percent={tempPct}
        accent={tempAccent}
      />
    );
  }
  if (metric === "cpu") {
    return (
      <GaugeTile embedded
        label="% CPU"
        valueText={cpu == null ? "N/D" : `${cpu.toFixed(1)} %`}
        percent={cpuPct}
        accent={cpuAccent}
      />
    );
  }
  if (metric === "mem") {
    return (
      <GaugeTile embedded
        label="% MEMORIA"
        valueText={mem == null ? "N/D" : `${mem.toFixed(1)} %`}
        percent={memPct}
        accent={memAccent}
        helperLines={memUsed && memTotal ? [`${memUsed.toFixed(0)} / ${memTotal.toFixed(0)} MB`] : []}
      />
    );
  }

  /* ---- Modo completo (sin prop metric, compatible legacy) ---- */
  return (
    <>
      <GaugeTile label="Temp CPU" valueText={temp == null ? "N/D" : `${temp.toFixed(1)} °C`} percent={tempPct} accent={tempAccent} />
      <GaugeTile label="% CPU"    valueText={cpu  == null ? "N/D" : `${cpu.toFixed(1)} %`}  percent={cpuPct}  accent={cpuAccent}  />
      <GaugeTile label="% MEMORIA" valueText={mem == null ? "N/D" : `${mem.toFixed(1)} %`}  percent={memPct}  accent={memAccent}
        helperLines={memUsed && memTotal ? [`${memUsed.toFixed(0)} / ${memTotal.toFixed(0)} MB`] : []}
      />
    </>
  );
}
