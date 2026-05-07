import React, {
  useMemo, useState, useEffect, useRef,
  useCallback, useLayoutEffect, memo,
} from 'react';
import { createPortal } from 'react-dom';
import ChartRenderer from './ChartRenderer';
import SystemStatusCard from './SystemStatusCard';
import AddChartWizard from './AddChartWizard';
import SensorDashboard from './SensorDashboard';
import {
  FiClock, FiRefreshCcw, FiEdit2, FiMenu, FiMaximize2, FiMinimize2, FiBarChart2,
  FiAlertTriangle, FiCheckCircle, FiCpu, FiArrowUp, FiArrowDown,
} from 'react-icons/fi';
import { BACKEND } from '../utils/api';
import { authHeader } from '../utils/auth';
import ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

/* ============================================================
   CONSTANTES
============================================================ */
const STORAGE_KEY  = 'sensorDisplayItems';
const HISTORY_KEY  = 'sensorHistory';
const EMPTY_ARR    = Object.freeze([]);

const FIXED_ITEMS = [
  { id: 'fixed-temp', type: 'fixed', metric: 'temp', title: 'Temp CPU', colSpan: 1 },
  { id: 'fixed-cpu',  type: 'fixed', metric: 'cpu',  title: 'CPU %',    colSpan: 1 },
  { id: 'fixed-mem',  type: 'fixed', metric: 'mem',  title: 'Memoria',  colSpan: 1 },
];
const FIXED_IDS = new Set(FIXED_ITEMS.map(f => f.id));

const QUICK_RANGES = [
  { label: '5m',  kind: 'lastN', unit: 'minutes', value: 5 },
  { label: '15m', kind: 'lastN', unit: 'minutes', value: 15 },
  { label: '30m', kind: 'lastN', unit: 'minutes', value: 30 },
  { label: '1h',  kind: 'lastN', unit: 'hours',   value: 1 },
  { label: '3h',  kind: 'lastN', unit: 'hours',   value: 3 },
  { label: '6h',  kind: 'lastN', unit: 'hours',   value: 6 },
  { label: '12h', kind: 'lastN', unit: 'hours',   value: 12 },
  { label: '24h', kind: 'lastN', unit: 'hours',   value: 24 },
  { label: '7d',  kind: 'lastN', unit: 'days',    value: 7 },
  { label: '30d', kind: 'lastN', unit: 'days',    value: 30 },
];

const TYPE_COLORS = {
  temperatura: { bg: '#ef444420', text: '#f87171', border: '#ef444440' },
  humedad:     { bg: '#3b82f620', text: '#60a5fa', border: '#3b82f640' },
  luz:         { bg: '#f59e0b20', text: '#fbbf24', border: '#f59e0b40' },
  lux:         { bg: '#f59e0b20', text: '#fbbf24', border: '#f59e0b40' },
  presion:     { bg: '#8b5cf620', text: '#a78bfa', border: '#8b5cf640' },
  corriente:   { bg: '#10b98120', text: '#34d399', border: '#10b98140' },
  voltaje:     { bg: '#06b6d420', text: '#22d3ee', border: '#06b6d440' },
  movimiento:  { bg: '#f9731620', text: '#fb923c', border: '#f9731640' },
  puerta:      { bg: '#84cc1620', text: '#a3e635', border: '#84cc1640' },
  cpu:         { bg: '#8b5cf620', text: '#a78bfa', border: '#8b5cf640' },
  memoria:     { bg: '#6366f120', text: '#818cf8', border: '#6366f140' },
};

const ROW_H  = 36;
const GRID_C = 12;

/* ============================================================
   HELPERS PUROS (fuera del componente → no se recrean)
============================================================ */
function getTypeColor(type) {
  const key = (type || '').toLowerCase();
  return TYPE_COLORS[key] || { bg: '#6b728020', text: '#9ca3af', border: '#6b728040' };
}

function relativeTime(ts) {
  if (!ts) return null;
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 10)    return 'ahora';
  if (diff < 60)    return `${Math.round(diff)}s`;
  if (diff < 3600)  return `${Math.round(diff / 60)} min`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h`;
  return `${Math.round(diff / 86400)}d`;
}

// Agrupa sensores temperatura+humedad del mismo puerto en pares (un SHT31 físico)
function groupSensors(sensors) {
  const result = [];
  const used = new Set();
  for (const s of sensors) {
    const skey = `${s.id}::${s.type}`;
    if (used.has(skey)) continue;
    if ((s.type === 'temperatura' || s.type === 'humedad') && s.puerto != null) {
      const counterType = s.type === 'temperatura' ? 'humedad' : 'temperatura';
      const partner = sensors.find(o => {
        const okey = `${o.id}::${o.type}`;
        return !used.has(okey) && okey !== skey && o.puerto === s.puerto && o.type === counterType;
      });
      if (partner) {
        const tS = s.type === 'temperatura' ? s : partner;
        const hS = s.type === 'humedad'     ? s : partner;
        result.push({ kind: 'pair', tSensor: tS, hSensor: hS });
        used.add(`${tS.id}::${tS.type}`);
        used.add(`${hS.id}::${hS.type}`);
        continue;
      }
    }
    result.push({ kind: 'single', sensor: s });
    used.add(skey);
  }
  return result;
}

// Normaliza lecturas crudas del backend/poll
function normalizarLecturas(arr) {
  if (!Array.isArray(arr)) return EMPTY_ARR;
  const result = [];
  for (const l of arr) {
    const nested    = l.lectura || {};
    const sensorId  = String(l.sensor_id ?? l.sensorId ?? l.id_sensor ?? '');
    const tipo      = String(l.tipo ?? l.tipo_medida ?? l.type ?? '');
    const rawValor  = l.valor ?? nested.valor ?? null;
    const valor     = rawValor !== null ? Number(rawValor) : NaN;
    const unidad    = (l.unidad ?? nested.unidad ?? '').trim();
    const timestamp = l.timestamp ?? nested.timestamp ?? null;
    if (sensorId && tipo && !Number.isNaN(valor) && timestamp) {
      result.push({ sensorId, tipo, valor, unidad, timestamp });
    }
  }
  return result;
}

function loadItems() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        const normalize = (i) => ({
          ...i,
          type: i.type || (FIXED_IDS.has(i.id) ? 'fixed' : 'sensor'),
          gh:   i.gh != null ? Math.min(i.gh, 12) : undefined,
        });
        const hasAnyFixed = parsed.some(i => FIXED_IDS.has(i.id));
        if (hasAnyFixed) {
          return parsed
            .filter(i => i.id !== 'system-status-fixed')
            .map(i => {
              if (!FIXED_IDS.has(i.id)) return normalize(i);
              const base = FIXED_ITEMS.find(f => f.id === i.id);
              return base
                ? { ...base, colSpan: i.colSpan ?? base.colSpan, gx: i.gx, gy: i.gy, gw: i.gw, gh: i.gh != null ? Math.min(i.gh, 8) : undefined }
                : normalize(i);
            })
            .concat(FIXED_ITEMS.filter(f => !parsed.some(i => i.id === f.id)));
        }
        const dynamic = parsed.filter(i => !FIXED_IDS.has(i.id) && i.id !== 'system-status-fixed');
        return [...FIXED_ITEMS, ...dynamic.map(normalize)];
      }
    }
  } catch { /* ignore */ }
  return [...FIXED_ITEMS];
}

function getDefaultH(item) {
  if (item.type === 'fixed') return 3;
  if (item.type === 'climate-gauge') return 6;
  const t = item.chartType;
  if (t === 'stat' || t === 'stat-bg' || t === 'stat-bar' || t === 'stat-spark') return 3;
  if (t === 'gauge')   return 4;
  if (t === 'heatmap') return 5;
  return 4;
}

/* ============================================================
   ARC GAUGE — estilo CMC III de Rittal
============================================================ */
function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function svgArcPath(cx, cy, r, startDeg, endDeg) {
  const s    = polarToCartesian(cx, cy, r, startDeg);
  const e    = polarToCartesian(cx, cy, r, endDeg);
  const diff = ((endDeg - startDeg) % 360 + 360) % 360;
  const large = diff > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

const GAUGE_START = 225;
const GAUGE_SWEEP = 270;

const TEMP_ZONES = [
  { from: -10, to: 15,  color: '#60a5fa' },
  { from: 15,  to: 27,  color: '#22c55e' },
  { from: 27,  to: 35,  color: '#f59e0b' },
  { from: 35,  to: 60,  color: '#ef4444' },
];
const HUM_ZONES = [
  { from: 0,  to: 30,  color: '#f59e0b' },
  { from: 30, to: 70,  color: '#22c55e' },
  { from: 70, to: 100, color: '#3b82f6' },
];

const ArcGauge = memo(function ArcGauge({ value, min, max, zones, unit, label }) {
  const cx = 70, cy = 75, r = 50;
  const sw = 11;

  const clampedVal = value != null ? Math.min(max, Math.max(min, value)) : null;
  const pct        = clampedVal != null ? (clampedVal - min) / (max - min) : 0;
  const valueAngle = GAUGE_START + pct * GAUGE_SWEEP;

  const currentZone = value != null
    ? (zones.find(z => value >= z.from && value < z.to) ?? zones[zones.length - 1])
    : null;
  const statusColor = currentZone?.color ?? 'var(--color-border)';

  const needlePt  = clampedVal != null ? polarToCartesian(cx, cy, r - 3, valueAngle) : null;
  const startPt   = polarToCartesian(cx, cy, r + 10, GAUGE_START);
  const endPt     = polarToCartesian(cx, cy, r + 10, GAUGE_START + GAUGE_SWEEP);

  const displayVal = clampedVal != null
    ? (Math.abs(clampedVal) >= 100 || Number.isInteger(clampedVal)
        ? Math.round(clampedVal)
        : clampedVal.toFixed(1))
    : '—';

  return (
    <svg viewBox="0 0 140 118" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      {/* Track background — usa color-mix para adaptarse al tema */}
      <path d={svgArcPath(cx, cy, r, GAUGE_START, GAUGE_START + GAUGE_SWEEP)}
        fill="none" strokeWidth={sw} strokeLinecap="round"
        style={{ stroke: 'color-mix(in srgb, var(--color-border) 70%, var(--color-card))' }}/>
      {/* Zone segments */}
      {zones.map((zone, i) => {
        const a1 = GAUGE_START + ((zone.from - min) / (max - min)) * GAUGE_SWEEP;
        const a2 = GAUGE_START + ((zone.to   - min) / (max - min)) * GAUGE_SWEEP;
        return (
          <path key={i} d={svgArcPath(cx, cy, r, a1, a2)}
            fill="none" stroke={zone.color} strokeWidth={sw} strokeOpacity={0.45}/>
        );
      })}
      {/* Value arc */}
      {clampedVal != null && pct > 0.005 && (
        <path d={svgArcPath(cx, cy, r, GAUGE_START, valueAngle)}
          fill="none" stroke={statusColor} strokeWidth={sw * 0.55} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px ${statusColor}88)` }}/>
      )}
      {/* Needle dot */}
      {needlePt && (
        <circle cx={needlePt.x} cy={needlePt.y} r={sw * 0.68} fill={statusColor}
          style={{ filter: `drop-shadow(0 0 5px ${statusColor})` }}/>
      )}
      {/* Value text */}
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize={24} fontWeight="bold"
        fontFamily="'Courier New', monospace"
        style={{ fill: clampedVal != null ? statusColor : 'var(--color-border)' }}>
        {displayVal}
      </text>
      {/* Unit */}
      <text x={cx} y={cy + 13} textAnchor="middle" fontSize={12} fontWeight="600"
        style={{ fill: 'var(--text-color-muted, #9ca3af)' }}>
        {unit}
      </text>
      {/* Label */}
      <text x={cx} y={cy + 27} textAnchor="middle" fontSize={8} fontWeight="700" letterSpacing="1.5"
        style={{ fill: 'var(--text-color-muted, #9ca3af)', opacity: 0.7 }}>
        {label}
      </text>
      {/* Min / Max */}
      <text x={startPt.x} y={startPt.y + 4} textAnchor="middle" fontSize={8}
        style={{ fill: 'var(--text-color-muted, #9ca3af)', opacity: 0.55 }}>{min}</text>
      <text x={endPt.x}   y={endPt.y   + 4} textAnchor="middle" fontSize={8}
        style={{ fill: 'var(--text-color-muted, #9ca3af)', opacity: 0.55 }}>{max}</text>
    </svg>
  );
});

const STATUS_COLORS_CG = ['#22c55e', '#60a5fa', '#f59e0b', '#ef4444'];
const STATUS_LABELS_CG = ['OK', 'Info', 'Advertencia', 'Crítico'];
const ZONE_SEVERITY = { '#22c55e': 0, '#60a5fa': 1, '#3b82f6': 1, '#f59e0b': 2, '#ef4444': 3 };

const ClimateGauge = memo(function ClimateGauge({ tempValue, humValue, tempUnit, humUnit, title }) {
  const tempZone = tempValue != null
    ? (TEMP_ZONES.find(z => tempValue >= z.from && tempValue < z.to) ?? TEMP_ZONES[TEMP_ZONES.length - 1])
    : null;
  const humZone = humValue != null
    ? (HUM_ZONES.find(z => humValue >= z.from && humValue < z.to) ?? HUM_ZONES[HUM_ZONES.length - 1])
    : null;

  const sev = Math.max(
    tempZone ? (ZONE_SEVERITY[tempZone.color] ?? 0) : -1,
    humZone  ? (ZONE_SEVERITY[humZone.color]  ?? 0) : -1,
  );

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: 'var(--color-card)',
      overflow: 'hidden',
    }}>
      {/* Status strip */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '4px 10px 3px', flexShrink: 0,
        borderBottom: '1px solid var(--color-border)',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-color-muted, #9ca3af)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {title || 'Clima'}
        </span>
        {sev >= 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
            backgroundColor: `${STATUS_COLORS_CG[sev]}18`, color: STATUS_COLORS_CG[sev],
            border: `1px solid ${STATUS_COLORS_CG[sev]}44`,
          }}>
            {STATUS_LABELS_CG[sev]}
          </span>
        )}
      </div>

      {/* Gauges row */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: '2px 2px 4px' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <ArcGauge value={tempValue} min={-10} max={60}
            zones={TEMP_ZONES} unit={tempUnit || '°C'} label="TEMPERATURA"/>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: 'var(--color-border)', margin: '6px 0', flexShrink: 0 }}/>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
          <ArcGauge value={humValue} min={0} max={100}
            zones={HUM_ZONES} unit={humUnit || '%'} label="HUMEDAD"/>
        </div>
      </div>
    </div>
  );
});

/* ============================================================
   SUB-COMPONENTES MEMOIZADOS
============================================================ */
const TypeBadge = memo(function TypeBadge({ type }) {
  const c = getTypeColor(type);
  return (
    <span
      className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize"
      style={{ backgroundColor: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {type || '—'}
    </span>
  );
});

const LiveDot = memo(function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span
        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
        style={{ backgroundColor: '#10b981' }}
      />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: '#10b981' }} />
    </span>
  );
});

/* ============================================================
   PANEL FULLSCREEN — overlay de un solo gráfico con zoom
============================================================ */
function PanelFullscreen({ item, config, data, reading, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', h);
    };
  }, [onClose]);

  const zoomConfig = { ...config, enableZoom: true };

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9997,
      backgroundColor: 'var(--color-bg)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
            {item.title || item.sensorName}
          </span>
          {item.measure && <TypeBadge type={item.measure} />}
          {reading && (
            <span className="font-mono text-xs px-2 py-0.5 rounded"
              style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}>
              {reading.valor}{reading.unidad ? ' ' + reading.unidad : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] opacity-30">Arrastra para zoom · Esc para cerrar</span>
          <button onClick={onClose}
            className="p-1.5 rounded-lg border transition hover:opacity-80"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}>
            <FiMinimize2 size={14}/>
          </button>
        </div>
      </div>
      {/* Gráfico */}
      <div style={{ flex: 1, padding: 12, minHeight: 0 }}>
        <ChartRenderer config={zoomConfig} data={data} height="100%" />
      </div>
    </div>,
    document.body
  );
}

/* Panel individual — memo evita re-renders cuando cambia
   state ajeno (editMode de otros paneles, fullscreen, etc.) */
const PanelItem = memo(function PanelItem({
  item, config, data, editMode, onRemove, onFullscreen, panelPxH, reading, displayName, onRename,
}) {
  const isFixed        = item.type === 'fixed' || FIXED_IDS.has(item.id);
  const isClimateGauge = item.type === 'climate-gauge';
  const showHeader = !editMode && panelPxH >= 46;
  const showFooter = !editMode && panelPxH >= 78;
  const label = displayName || item.sensorName || item.title;
  const isPair = item.type === 'sht31-pair';
  const pairTR = config?.timeRange || item.timeRange || { kind: 'lastN', unit: 'hours', value: 2 };
  const tempCfg = isPair ? { chartType: 'area', sensorId: item.tempSensorId, measure: 'temperatura', timeRange: pairTR, decimals: 1, unitOverride: '°C' } : null;
  const humCfg  = isPair ? { chartType: 'area', sensorId: item.humSensorId,  measure: 'humedad',     timeRange: pairTR, decimals: 1, unitOverride: '%'  } : null;

  return (
    <div
      className="group relative rounded-xl border overflow-hidden"
      style={{
        backgroundColor: 'var(--color-card)',
        borderColor: editMode ? 'var(--color-primary)' : 'var(--color-border)',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ---- Barra de edición ---- */}
      {editMode && (
        <div
          className="drag-handle flex items-center justify-between px-3 py-1.5 border-b flex-shrink-0"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, var(--color-card))',
            cursor: 'grab',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <FiMenu size={12} style={{ color: 'var(--color-primary)', flexShrink: 0 }}/>
            <span className="text-[11px] font-medium truncate" style={{ color: 'var(--color-text)', opacity: 0.75 }}>
              {label || item.title}
            </span>
            {isFixed && (
              <span className="text-[10px] italic shrink-0" style={{ opacity: 0.35 }}>fijo</span>
            )}
          </div>
          {!isFixed && (
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={() => onRemove(item.id)}
              className="text-[10px] bg-red-600 hover:bg-red-700 text-white px-1.5 py-0.5 rounded shrink-0"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* ---- Contenido FIJO ---- */}
      {isFixed && (
        <div style={{
          flex: 1, minHeight: 0, overflow: 'hidden',
          display: 'grid', placeItems: 'stretch',
          padding: '4px 6px',
        }}>
          <SystemStatusCard metric={item.metric} />
        </div>
      )}

      {/* ---- Contenido SHT31 PAIR (temperatura + humedad apilados) ---- */}
      {!isFixed && isPair && (
        <>
          {showHeader && (
            <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5 flex-shrink-0">
              <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>{label}</span>
              <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#ef444420', color: '#f87171', border: '1px solid #ef444440' }}>T+H</span>
              <div className="ml-auto flex items-center gap-1 shrink-0">
                <button onClick={() => onRemove(item.id)}
                  className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white bg-red-600 hover:bg-red-700"
                  style={{ transition: 'opacity 0.15s' }} title="Eliminar">✕</button>
              </div>
            </div>
          )}
          {/* Temperatura */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '1px 4px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 9, color: '#f87171', fontWeight: 700, padding: '1px 2px', lineHeight: 1.5, flexShrink: 0 }}>
              TEMP{reading?.temp ? ` · ${reading.temp.valor}${reading.temp.unidad || ' °C'}` : ''}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ChartRenderer config={tempCfg} data={data} />
            </div>
          </div>
          <div style={{ height: 1, backgroundColor: 'var(--color-border)', margin: '0 4px', flexShrink: 0 }} />
          {/* Humedad */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '1px 4px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 9, color: '#60a5fa', fontWeight: 700, padding: '1px 2px', lineHeight: 1.5, flexShrink: 0 }}>
              HUM{reading?.hum ? ` · ${reading.hum.valor}${reading.hum.unidad || ' %'}` : ''}
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <ChartRenderer config={humCfg} data={data} />
            </div>
          </div>
          {!showHeader && !editMode && (
            <button onClick={() => onRemove(item.id)}
              className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white bg-red-600 hover:bg-red-700"
              style={{ transition: 'opacity 0.15s' }} title="Eliminar">✕</button>
          )}
        </>
      )}

      {/* ---- Contenido CLIMATE GAUGE ---- */}
      {!isFixed && isClimateGauge && (
        <>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <ClimateGauge
              tempValue={reading?.temp?.valor ?? null}
              humValue={reading?.hum?.valor   ?? null}
              tempUnit={reading?.temp?.unidad || '°C'}
              humUnit={reading?.hum?.unidad   || '%'}
              title={label}
            />
          </div>
          {!editMode && (
            <button onClick={() => onRemove(item.id)}
              className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white bg-red-600 hover:bg-red-700"
              style={{ transition: 'opacity 0.15s' }} title="Eliminar">✕</button>
          )}
        </>
      )}

      {/* ---- Contenido DINÁMICO (sensor único) ---- */}
      {!isFixed && !isPair && !isClimateGauge && (
        <>
          {showHeader && (
            <div className="flex items-center gap-1.5 px-2 pt-1.5 pb-0.5 flex-shrink-0">
              <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text)' }}>
                {label}
              </span>
              <TypeBadge type={item.measure} />
              <div className="ml-auto flex items-center gap-1 shrink-0">
                {onRename && (
                  <button
                    onClick={() => onRename(item)}
                    className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center"
                    style={{ transition: 'opacity 0.15s', color: 'var(--color-primary)' }}
                    title="Renombrar sensor"
                  >
                    <FiEdit2 size={9}/>
                  </button>
                )}
                <button
                  onClick={() => onFullscreen(item)}
                  className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded flex items-center justify-center"
                  style={{ transition: 'opacity 0.15s', color: 'var(--color-primary)' }}
                  title="Pantalla completa con zoom"
                >
                  <FiMaximize2 size={10}/>
                </button>
                <button
                  onClick={() => onRemove(item.id)}
                  className="opacity-0 group-hover:opacity-100 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white bg-red-600 hover:bg-red-700"
                  style={{ transition: 'opacity 0.15s' }}
                  title="Eliminar"
                >✕</button>
              </div>
            </div>
          )}

          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '2px 4px' }}>
            <ChartRenderer config={config} data={data} />
          </div>

          {showFooter && (
            <div className="flex items-center justify-between px-2 py-0.5 border-t flex-shrink-0"
              style={{ borderColor: 'var(--color-border)' }}>
              {(() => {
                const isDoor = ['puerta','reed'].some(k => (item.measure||'').toLowerCase().includes(k) || (item.sensorId||'').toLowerCase().includes(k) || (item.sensorName||'').toLowerCase().includes(k));
                const text   = reading ? (isDoor ? (Number(reading.valor) === 0 ? 'Abierto' : 'Cerrado') : `${reading.valor}${reading.unidad ? ' ' + reading.unidad : ''}`) : '—';
                const color  = isDoor && reading ? (Number(reading.valor) === 0 ? '#f87171' : '#4ade80') : 'var(--color-text)';
                return <span className="font-mono text-[10px] font-semibold" style={{ color }}>{text}</span>;
              })()}
              {reading?.timestamp && (
                <span className="text-[9px]" style={{ color: 'var(--text-color-muted, #9ca3af)' }}>
                  {relativeTime(reading.timestamp)}
                </span>
              )}
            </div>
          )}

          {!showHeader && !editMode && (
            <>
              <button
                onClick={() => onFullscreen(item)}
                className="opacity-0 group-hover:opacity-100 absolute top-1 left-1 w-4 h-4 rounded flex items-center justify-center"
                style={{ transition: 'opacity 0.15s', color: 'var(--color-primary)', backgroundColor: 'var(--color-card)' }}
                title="Pantalla completa"
              >
                <FiMaximize2 size={9}/>
              </button>
            </>
          )}
          {!showHeader && !editMode && (
            <button
              onClick={() => onRemove(item.id)}
              className="opacity-0 group-hover:opacity-100 absolute top-1 right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] text-white bg-red-600 hover:bg-red-700"
              style={{ transition: 'opacity 0.15s' }}
              title="Eliminar"
            >✕</button>
          )}
        </>
      )}
    </div>
  );
});

/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */
const SensorManagement = ({ sensors = [], lecturas = [], sensorsLoaded = true, sensorAliases = {}, onSensorRename }) => {

  const [displayItems, setDisplayItems] = useState(loadItems); // se sobreescribe con datos del backend
  const widgetsSyncedRef = useRef(false); // evitar sync antes de que carguen del backend
  const [editMode,     setEditMode]     = useState(false);
  const [fullscreen,   setFullscreen]   = useState(false);
  const [dashboardSensor,  setDashboardSensor]  = useState(null); // sensor dashboard completo
  const [fullscreenItem,   setFullscreenItem]   = useState(null); // panel individual fullscreen
  const [showWizard,   setShowWizard]   = useState(false);
  const [portSort,     setPortSort]     = useState('asc');  // 'none' | 'asc' | 'desc'

  /* ---- Renombrar sensor ---- */
  const [renameTarget, setRenameTarget] = useState(null); // {sensorId, defaultName}
  const [renameValue,  setRenameValue]  = useState('');
  const renameInputRef = useRef(null);
  useEffect(() => { if (renameTarget) { setRenameValue(sensorAliases[renameTarget.sensorId] || ''); setTimeout(() => renameInputRef.current?.focus(), 50); } }, [renameTarget, sensorAliases]);
  const commitRename = () => {
    if (!renameTarget) return;
    onSensorRename?.(renameTarget.sensorId, renameValue.trim());
    setRenameTarget(null);
  };
  const [globalRange,  setGlobalRange]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('globalRange')) || null; } catch { return null; }
  });
  const [showRangePicker, setShowRangePicker] = useState(false);
  const [customFrom,      setCustomFrom]      = useState('');
  const [customTo,        setCustomTo]        = useState('');

  const rangePickerRef   = useRef(null);
  const gridContainerRef = useRef(null);
  const [gridWidth, setGridWidth] = useState(() => window.innerWidth);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* ---- Historial acumulado ---- */
  const [history, setHistory] = useState(() => {
    try {
      const s = localStorage.getItem(HISTORY_KEY);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  /* ---- Cargar widgets desde backend (una sola vez al montar) ---- */
  useEffect(() => {
    fetch(`${BACKEND}/api/widgets`, { headers: authHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(rows => {
        if (!Array.isArray(rows) || rows.length === 0) { widgetsSyncedRef.current = true; return; }

        // Extraer posiciones de los items fijos guardados en backend
        const fixedPositions = {};
        for (const w of rows) {
          if (String(w.id || '').startsWith('fixed-')) {
            fixedPositions[w.id] = {
              gx: w.gx ?? undefined, gy: w.gy ?? undefined,
              gw: w.gw ?? undefined, gh: w.gh != null ? Math.min(w.gh, 8) : undefined,
              colSpan: w.col_span ?? undefined,
            };
          }
        }

        const custom = rows
          .filter(w => !String(w.id || '').startsWith('fixed-'))
          .map(w => ({
            id:          w.id,
            type:        'sensor',
            title:       w.title        || '',
            chartType:   w.chart_type   || 'line',
            measure:     w.measure      || '',
            sensorScope: w.sensor_scope || 'any',
            sensorId:    w.sensor_id    || '',
            agg:         w.agg          || 'none',
            timeRange:   typeof w.time_range === 'object' ? w.time_range : { kind: 'lastN', unit: 'hours', value: 2 },
            maxPoints:   w.max_points   ?? 200,
            decimals:    w.decimals     ?? 2,
            unitOverride:w.unit_override || '',
            pinned:      !!w.pinned,
            colSpan:     w.col_span     ?? 1,
            gx: w.gx ?? undefined, gy: w.gy ?? undefined,
            gw: w.gw ?? undefined, gh: w.gh ?? undefined,
          }));

        // Fusionar posiciones: backend > localStorage (prev) > defecto
        setDisplayItems(prev => {
          const prevFixed = {};
          for (const item of prev) {
            if (FIXED_IDS.has(item.id)) prevFixed[item.id] = item;
          }
          const mergedFixed = FIXED_ITEMS.map(f => {
            const backPos = fixedPositions[f.id];
            // Si el backend tiene posición guardada (gx no null), úsala
            if (backPos && backPos.gx != null) return { ...f, ...backPos };
            // Si no, conserva la posición de localStorage (estado previo)
            const prev_ = prevFixed[f.id];
            return prev_ ? { ...f, gx: prev_.gx, gy: prev_.gy, gw: prev_.gw, gh: prev_.gh, colSpan: prev_.colSpan ?? f.colSpan } : f;
          });
          return [...mergedFixed, ...custom];
        });
        widgetsSyncedRef.current = true;
      })
      .catch(() => { widgetsSyncedRef.current = true; });
  }, []); // eslint-disable-line

  // Ref con el set de claves únicas → dedup O(1) sin rebuild en cada poll
  const historyKeysRef = useRef(null);
  if (historyKeysRef.current === null) {
    historyKeysRef.current = new Set(
      history.map(p => `${p.sensorId}|${p.tipo}|${p.timestamp}`)
    );
  }

  /* ---- Lecturas normalizadas (useMemo → solo cuando cambia lecturas) ---- */
  const lecturasNormalizadas = useMemo(() => normalizarLecturas(lecturas), [lecturas]);

  /* ---- ResizeObserver con useLayoutEffect (antes del paint) ---- */
  useLayoutEffect(() => {
    const el = gridContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setGridWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---- Cerrar picker y Escape ---- */
  useEffect(() => {
    const handler = (e) => {
      if (rangePickerRef.current && !rangePickerRef.current.contains(e.target))
        setShowRangePicker(false);
      if (e.key === 'Escape') setFullscreen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handler);
    };
  }, []);

  /* ---- Scroll body en kiosko ---- */
  useEffect(() => {
    document.body.style.overflow = fullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [fullscreen]);

  /* ---- Persistir globalRange ---- */
  useEffect(() => {
    if (globalRange) localStorage.setItem('globalRange', JSON.stringify(globalRange));
    else localStorage.removeItem('globalRange');
  }, [globalRange]);

  /* ---- Persistir displayItems: localStorage (fallback) + backend (sync) ---- */
  useEffect(() => {
    const timer = setTimeout(() => {
      // Siempre guardamos en localStorage como caché offline
      localStorage.setItem(STORAGE_KEY, JSON.stringify(displayItems));
      // Sync al backend solo tras la carga inicial
      if (!widgetsSyncedRef.current) return;
      // Enviamos TODOS los items (incluidos fixed-*) para persistir posiciones del grid
      fetch(`${BACKEND}/api/widgets/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify(displayItems),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [displayItems]);

  /* ---- Persistir historial (debounce 2s + inmediato al desmontar) ---- */
  useEffect(() => {
    const save = () => {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-4000))); }
      catch { /* cuota llena */ }
    };
    const timer = setTimeout(save, 2000);
    return () => { clearTimeout(timer); save(); };
  }, [history]);

  /* ---- Acumular lecturas en historial (O(1) con keysRef) ---- */
  useEffect(() => {
    if (lecturasNormalizadas.length === 0) return;
    const keys = historyKeysRef.current;
    const toAdd = [];
    for (const n of lecturasNormalizadas) {
      const k = `${n.sensorId}|${n.tipo}|${n.timestamp}`;
      if (!keys.has(k)) { keys.add(k); toAdd.push(n); }
    }
    if (toAdd.length === 0) return;
    setHistory(prev => {
      const combined = [...prev, ...toAdd];
      if (combined.length > 3000) {
        const pruned = combined.slice(-3000);
        historyKeysRef.current = new Set(pruned.map(p => `${p.sensorId}|${p.tipo}|${p.timestamp}`));
        return pruned;
      }
      return combined;
    });
  }, [lecturasNormalizadas]);

  /* ---- Cargar historial del backend al montar / cambiar rango ---- */
  useEffect(() => {
    const MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
    const pad = (n) => String(n).padStart(2, '0');
    const toISOLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    // Expand sht31-pair items into individual temperatura + humedad fetch requests
    const chartItems = [];
    for (const i of displayItems) {
      if (FIXED_IDS.has(i.id)) continue;
      if (i.type === 'sht31-pair' || i.type === 'climate-gauge') {
        const tr = globalRange || i.timeRange || { kind: 'lastN', unit: 'hours', value: 24 };
        if (i.tempSensorId) chartItems.push({ sensorId: i.tempSensorId, measure: 'temperatura', timeRange: tr });
        if (i.humSensorId)  chartItems.push({ sensorId: i.humSensorId,  measure: 'humedad',     timeRange: tr });
      } else if (i.sensorId && i.measure) {
        chartItems.push(i);
      }
    }
    if (chartItems.length === 0) return;

    const controller = new AbortController();
    const { signal } = controller;

    (async () => {
      for (const item of chartItems) {
        if (signal.aborted) break;
        const { sensorId, measure } = item;
        const tr = globalRange || item.timeRange || { kind: 'lastN', unit: 'hours', value: 24 };
        try {
          const params = new URLSearchParams({ tipo: measure, sensorId, limit: '3000' });
          if (tr.kind === 'lastN') {
            params.set('from', toISOLocal(new Date(Date.now() - tr.value * (MS[tr.unit] ?? 3_600_000))));
          } else if (tr.kind === 'absolute') {
            if (tr.from) params.set('from', tr.from.replace('T', ' ').slice(0, 19));
            if (tr.to)   params.set('to',   tr.to.replace('T', ' ').slice(0, 19));
          }
          const res = await fetch(`${BACKEND}/historico?${params}`, { signal });
          if (!res.ok || signal.aborted) continue;
          const raw = await res.json();
          if (signal.aborted) break;
          const norm = raw
            .map(d => ({ sensorId, tipo: measure, valor: Number(d.valor), unidad: d.unidad || '', timestamp: d.timestamp }))
            .filter(x => !Number.isNaN(x.valor) && x.timestamp);
          if (norm.length === 0) continue;
          setHistory(prev => {
            const keys = historyKeysRef.current;
            const toAdd = [];
            for (const n of norm) {
              const k = `${n.sensorId}|${n.tipo}|${n.timestamp}`;
              if (!keys.has(k)) { keys.add(k); toAdd.push(n); }
            }
            if (toAdd.length === 0) return prev;
            const combined = [...prev, ...toAdd].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            if (combined.length > 5000) {
              const pruned = combined.slice(-5000);
              historyKeysRef.current = new Set(pruned.map(p => `${p.sensorId}|${p.tipo}|${p.timestamp}`));
              return pruned;
            }
            return combined;
          });
        } catch (e) {
          if (e.name !== 'AbortError') { /* silencioso */ }
        }
      }
    })();

    return () => controller.abort();
  }, [displayItems, globalRange]);

  /* ---- Derivados ---- */
  const ultimaPorIdTipo = useMemo(() => {
    const map = new Map();
    for (const l of lecturasNormalizadas) {
      const k    = `${l.sensorId}__${l.tipo}`;
      const prev = map.get(k);
      if (!prev || new Date(l.timestamp) > new Date(prev.timestamp)) map.set(k, l);
    }
    return map;
  }, [lecturasNormalizadas]);

  const globalRangeLabel = useMemo(() => {
    if (!globalRange) return null;
    if (globalRange.kind === 'lastN') {
      const qr = QUICK_RANGES.find(q => q.unit === globalRange.unit && q.value === globalRange.value);
      return qr ? qr.label : `${globalRange.value} ${globalRange.unit}`;
    }
    return 'Personalizado';
  }, [globalRange]);

  // Solo mostrar paneles cuyo sensor tiene datos activos (igual que la tabla de sensores)
  const visibleDisplayItems = useMemo(() => {
    return displayItems.filter(item => {
      if (FIXED_IDS.has(item.id)) return true;
      if (item.type === 'sht31-pair' || item.type === 'climate-gauge') {
        return ultimaPorIdTipo.has(`${item.tempSensorId}__temperatura`) ||
               ultimaPorIdTipo.has(`${item.humSensorId}__humedad`);
      }
      return ultimaPorIdTipo.has(`${item.sensorId}__${item.measure}`);
    });
  }, [displayItems, ultimaPorIdTipo]);

  const gridLayout = useMemo(() => {
    // Acumula altura máxima por fila para calcular y sin huecos
    const rowMaxH = [];
    visibleDisplayItems.forEach((item, idx) => {
      const row = Math.floor(idx / 3);
      const h = item.gh ?? getDefaultH(item);
      rowMaxH[row] = Math.max(rowMaxH[row] ?? 0, h);
    });
    const rowStartY = rowMaxH.reduce((acc, _, i) => {
      acc.push(i === 0 ? 0 : acc[i - 1] + rowMaxH[i - 1]);
      return acc;
    }, []);

    return visibleDisplayItems.map((item, idx) => ({
      i:      item.id,
      x:      item.gx ?? (idx % 3) * 4,
      y:      item.gy ?? (rowStartY[Math.floor(idx / 3)] ?? 0),
      w:      item.gw ?? (item.colSpan === 3 ? 12 : item.colSpan === 2 ? 8 : 4),
      h:      item.gh ?? getDefaultH(item),
      minW:   1,
      minH:   item.chartType === 'heatmap' ? 2 : 1,
      static: !editMode,
    }));
  }, [visibleDisplayItems, editMode]);

  const mobileLayout = useMemo(() =>
    visibleDisplayItems.map((item, idx) => {
      const h = item.gh ?? getDefaultH(item);
      return { i: item.id, x: 0, y: idx * h, w: 2, h, minW: 1, minH: 1, static: true };
    }),
    [visibleDisplayItems]
  );

  const dynamicCount = useMemo(() => visibleDisplayItems.filter(i => i.type !== 'fixed').length, [visibleDisplayItems]);
  const totalPanels  = visibleDisplayItems.length;

  // Solo sensores con lectura en los últimos 30s
  const onlineSensors = useMemo(() => sensors.filter(s => {
    const r = ultimaPorIdTipo.get(`${String(s.id)}__${String(s.type ?? '')}`);
    return r?.timestamp && (Date.now() - new Date(r.timestamp).getTime()) < 120_000;
  }), [sensors, ultimaPorIdTipo]);

  const onlineCount = onlineSensors.length;

  const groupedAll = useMemo(() => groupSensors(onlineSensors), [onlineSensors]);

  const sortedGroupedAll = useMemo(() => {
    if (portSort === 'none') return groupedAll;
    const getPuerto = (g) => g.kind === 'pair' ? (g.tSensor.puerto ?? Infinity) : (g.sensor.puerto ?? Infinity);
    return [...groupedAll].sort((a, b) => portSort === 'asc' ? getPuerto(a) - getPuerto(b) : getPuerto(b) - getPuerto(a));
  }, [groupedAll, portSort]);

  // Compatibilidad con AddChartWizard (sigue necesitando la lista plana)
  const activeSensors = sensors;

  /* ---- Handlers memoizados ---- */
  const handleAddWidget     = useCallback((w)  => { setDisplayItems(prev => [...prev, w]); setShowWizard(false); }, []);
  const handleRemoveWidget  = useCallback((id) => setDisplayItems(prev => prev.filter(i => i.id !== id)), []);
  const handleToggleEdit    = useCallback(() => setEditMode(v => !v), []);
  const handleToggleFullscr = useCallback(() => setFullscreen(v => !v), []);
  const onGridChange        = useCallback((newLayout) => {
    setDisplayItems(prev => prev.map(item => {
      const l = newLayout.find(n => n.i === item.id);
      return l ? { ...item, gx: l.x, gy: l.y, gw: l.w, gh: l.h } : item;
    }));
  }, []);

  const handleOpenDashboard  = useCallback((sensor) => {
    const alias = sensorAliases[String(sensor.id)];
    setDashboardSensor(alias ? { ...sensor, name: alias } : sensor);
  }, [sensorAliases]);
  const handlePanelFullscreen = useCallback((item) => setFullscreenItem(item), []);

  const handleQuickAdd = useCallback((sensor) => {
    const sid = String(sensor.id);
    const exists = displayItems.some(d => d.sensorId === sid && d.measure === sensor.type);
    if (exists) {
      setDisplayItems(prev => prev.filter(d => !(d.sensorId === sid && d.measure === sensor.type)));
      return;
    }
    const chartType = sensor.type === 'luz' ? 'bar' : sensor.type === 'humedad' ? 'area' : 'line';
    setDisplayItems(prev => [...prev, {
      id: `sensor-${Date.now()}`, type: 'sensor',
      title: `${sensor.name ?? sensor.id} — ${sensor.type}`,
      sensorName: sensor.name ?? sensor.id, sensorPort: sensor.puerto ?? '—',
      chartType, measure: sensor.type, sensorScope: 'bySensor', sensorId: sid,
      agg: 'none', timeRange: { kind: 'lastN', unit: 'hours', value: 2 },
      maxPoints: 200, decimals: 2, unitOverride: '', pinned: true, colSpan: 1,
    }]);
  }, [displayItems]);

  const handleQuickAddPair = useCallback((group) => {
    const tid = String(group.tSensor.id);
    const hid = String(group.hSensor.id);
    const exists = displayItems.some(d => d.type === 'sht31-pair' && d.tempSensorId === tid);
    if (exists) {
      setDisplayItems(prev => prev.filter(d => !(d.type === 'sht31-pair' && d.tempSensorId === tid)));
      return;
    }
    setDisplayItems(prev => [...prev, {
      id: `sht31-pair-${Date.now()}`, type: 'sht31-pair',
      title: `SHT31 Puerto ${group.tSensor.puerto}`,
      sensorName: `SHT31 P${group.tSensor.puerto}`,
      tempSensorId: tid, humSensorId: hid,
      measure: 'sht31-pair',
      timeRange: { kind: 'lastN', unit: 'hours', value: 2 },
      colSpan: 1,
    }]);
  }, [displayItems]);

  const handleQuickAddClimateGauge = useCallback((group) => {
    const tid = String(group.tSensor.id);
    const hid = String(group.hSensor.id);
    const exists = displayItems.some(d => d.type === 'climate-gauge' && d.tempSensorId === tid);
    if (exists) {
      setDisplayItems(prev => prev.filter(d => !(d.type === 'climate-gauge' && d.tempSensorId === tid)));
      return;
    }
    setDisplayItems(prev => [...prev, {
      id: `climate-gauge-${Date.now()}`, type: 'climate-gauge',
      title: `SHT31 Puerto ${group.tSensor.puerto}`,
      sensorName: `SHT31 P${group.tSensor.puerto}`,
      tempSensorId: tid, humSensorId: hid,
      colSpan: 2, gh: 6,
    }]);
  }, [displayItems]);

  const effectiveConfig = useCallback((w) =>
    (!globalRange || w.type === 'fixed') ? w : { ...w, timeRange: globalRange }
  , [globalRange]);

  /* ---- Estado ML (última inferencia) ---- */
  const [mlStatus, setMlStatus] = useState(null);
  useEffect(() => {
    fetch(`${BACKEND}/api/anomalias?limit=1`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d) && d.length > 0) setMlStatus(d[0]); })
      .catch(() => {});
    const iv = setInterval(() => {
      fetch(`${BACKEND}/api/anomalias?limit=1`)
        .then(r => r.ok ? r.json() : [])
        .then(d => { if (Array.isArray(d) && d.length > 0) setMlStatus(d[0]); })
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(iv);
  }, []);

  /* ============================================================
     RENDER
  ============================================================ */
  return (
    <div className="space-y-5 pb-6">

      {/* ================================================
          HEADER
      ================================================ */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <LiveDot />
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text)' }}>
              Monitor de Sensores
            </h1>
            {onlineCount > 0 && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{
                backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)',
                color: 'var(--color-primary)',
              }}>
                {onlineCount} online
              </span>
            )}
          </div>
          <p className="text-xs ml-4" style={{ color: 'var(--text-color-muted, #9ca3af)' }}>
            {totalPanels} paneles · datos en tiempo real
          </p>
          {/* Indicador estado ML */}
          {mlStatus && (
            <div className="flex items-center gap-1.5 mt-1.5 ml-4">
              <FiCpu size={11} className="opacity-40" />
              <span className="text-[11px] opacity-50">ML:</span>
              {mlStatus.es_anomalia ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: '#ef444422', color: '#f87171', border: '1px solid #ef444430' }}>
                  <FiAlertTriangle size={9} /> Anomalía detectada
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: '#10b98122', color: '#34d399', border: '1px solid #10b98130' }}>
                  <FiCheckCircle size={9} /> Normal
                </span>
              )}
              <span className="text-[10px] opacity-30 font-mono">{mlStatus.timestamp}</span>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Rango de tiempo */}
          <div className="relative" ref={fullscreen ? null : rangePickerRef}>
            <button
              onClick={() => setShowRangePicker(v => !v)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border"
              style={{
                backgroundColor: globalRange ? 'var(--color-primary)' : 'var(--color-card)',
                color:       globalRange ? '#fff' : 'var(--color-text)',
                borderColor: 'var(--color-border)',
              }}
            >
              <FiClock size={13}/>
              <span className="hidden sm:inline">{globalRange ? globalRangeLabel : 'Rango de tiempo'}</span>
              <span className="sm:hidden">{globalRange ? globalRangeLabel : 'Rango'}</span>
            </button>

            {showRangePicker && !fullscreen && (
              <div className="absolute right-0 top-10 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border shadow-2xl p-4 space-y-3"
                style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                <p className="text-xs font-semibold uppercase opacity-50 tracking-wider">Rango global</p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_RANGES.map(qr => {
                    const active = globalRange?.unit === qr.unit && globalRange?.value === qr.value;
                    return (
                      <button key={qr.label} type="button"
                        onClick={() => { setGlobalRange({ kind: qr.kind, unit: qr.unit, value: qr.value }); setShowRangePicker(false); }}
                        className="px-2.5 py-1 rounded text-xs font-medium border"
                        style={{
                          backgroundColor: active ? 'var(--color-primary)' : 'transparent',
                          color:       active ? '#fff' : 'var(--color-text)',
                          borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                        }}>
                        {qr.label}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs opacity-50">Rango personalizado</p>
                  <input type="datetime-local" className="w-full text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    value={customFrom} onChange={e => setCustomFrom(e.target.value)}/>
                  <input type="datetime-local" className="w-full text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
                    value={customTo} onChange={e => setCustomTo(e.target.value)}/>
                  <button className="w-full py-1.5 text-xs rounded-md text-white font-medium"
                    style={{ backgroundColor: 'var(--color-primary)' }}
                    onClick={() => { setGlobalRange({ kind: 'absolute', from: customFrom, to: customTo }); setShowRangePicker(false); }}>
                    Aplicar rango personalizado
                  </button>
                </div>
                {globalRange && (
                  <button className="w-full py-1.5 text-xs rounded-md border flex items-center justify-center gap-1.5"
                    style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                    onClick={() => { setGlobalRange(null); setShowRangePicker(false); }}>
                    <FiRefreshCcw size={11}/> Restablecer
                  </button>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-white text-sm shadow-sm"
            style={{ backgroundColor: 'var(--color-primary)' }}
          >
            <span className="hidden sm:inline">+ Añadir gráfico</span>
            <span className="sm:hidden">+ Añadir</span>
          </button>

          <button
            onClick={handleToggleEdit}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm border"
            style={{
              backgroundColor: editMode ? 'var(--color-primary)' : 'var(--color-card)',
              color:       editMode ? '#fff' : 'var(--color-text)',
              borderColor: 'var(--color-border)',
            }}
          >
            <FiEdit2 size={13}/>
            {editMode ? 'Listo' : 'Editar'}
          </button>
        </div>
      </div>

      {/* Banners */}
      {globalRange && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}>
          <FiClock size={12}/> Rango activo: <strong>{globalRangeLabel}</strong> — aplicado a todos los gráficos.
        </div>
      )}

      {editMode && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ backgroundColor: 'color-mix(in srgb, #f59e0b 12%, transparent)', color: '#d97706' }}>
          <FiMenu size={12}/>
          Modo edición — arrastra paneles para reordenarlos · arrastra la esquina inferior derecha para cambiar tamaño.
        </div>
      )}

      {/* ================================================
          SECCIÓN: PANELES
          Cuando fullscreen=true, un portal backdrop cubre el viewport
          desde <body> para evitar que el sticky topbar se cuele por arriba
          (bug de compositing en Chrome con sticky + backdrop-filter).
      ================================================ */}
      {fullscreen && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99998, backgroundColor: 'var(--color-bg)' }} />,
        document.body
      )}
      <div
        className={fullscreen ? '' : 'rounded-2xl border'}
        style={fullscreen ? {
          position: 'fixed', inset: 0, zIndex: 99999,
          display: 'flex', flexDirection: 'column',
          backgroundColor: 'var(--color-bg)',
        } : {
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-border)',
        }}
      >
        {/* Header de paneles */}
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b flex-shrink-0"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)' }}
        >
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Paneles</h2>
            {fullscreen && globalRange && (
              <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 15%, transparent)', color: 'var(--color-primary)' }}>
                <FiClock size={10} style={{ display: 'inline', marginRight: 3 }}/>{globalRangeLabel}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Controles kiosko */}
            {fullscreen && (
              <>
                <div className="relative" ref={fullscreen ? rangePickerRef : null}>
                  <button
                    onClick={() => setShowRangePicker(v => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border"
                    style={{
                      backgroundColor: globalRange ? 'var(--color-primary)' : 'var(--color-bg)',
                      color: globalRange ? '#fff' : 'var(--color-text)',
                      borderColor: 'var(--color-border)',
                    }}
                  >
                    <FiClock size={11}/>{globalRange ? globalRangeLabel : 'Rango'}
                  </button>
                  {showRangePicker && fullscreen && (
                    <div className="absolute right-0 top-9 z-[10001] w-64 rounded-xl border shadow-2xl p-3 space-y-2"
                      style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
                      <div className="flex flex-wrap gap-1">
                        {QUICK_RANGES.map(qr => {
                          const active = globalRange?.unit === qr.unit && globalRange?.value === qr.value;
                          return (
                            <button key={qr.label} type="button"
                              onClick={() => { setGlobalRange({ kind: qr.kind, unit: qr.unit, value: qr.value }); setShowRangePicker(false); }}
                              className="px-2 py-0.5 rounded text-xs font-medium border"
                              style={{
                                backgroundColor: active ? 'var(--color-primary)' : 'transparent',
                                color: active ? '#fff' : 'var(--color-text)',
                                borderColor: active ? 'var(--color-primary)' : 'var(--color-border)',
                              }}>
                              {qr.label}
                            </button>
                          );
                        })}
                      </div>
                      {globalRange && (
                        <button className="w-full py-1 text-xs rounded border flex items-center justify-center gap-1"
                          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                          onClick={() => { setGlobalRange(null); setShowRangePicker(false); }}>
                          <FiRefreshCcw size={10}/> Restablecer
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleToggleEdit}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border"
                  style={{
                    backgroundColor: editMode ? 'var(--color-primary)' : 'var(--color-bg)',
                    color: editMode ? '#fff' : 'var(--color-text)',
                    borderColor: 'var(--color-border)',
                  }}
                >
                  <FiEdit2 size={11}/>{editMode ? 'Listo' : 'Editar'}
                </button>
              </>
            )}
            <span className="text-xs opacity-45">{totalPanels} paneles</span>
            <button
              onClick={handleToggleFullscr}
              title={fullscreen ? 'Salir de modo kiosko (Esc)' : 'Modo kiosko — pantalla completa'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs border"
              style={{
                backgroundColor: fullscreen ? 'var(--color-primary)' : 'transparent',
                borderColor: fullscreen ? 'var(--color-primary)' : 'var(--color-border)',
                color: fullscreen ? '#fff' : 'var(--color-text)',
              }}
            >
              {fullscreen ? <><FiMinimize2 size={12}/> Salir</> : <FiMaximize2 size={12}/>}
            </button>
          </div>
        </div>

        {/* Grid de paneles */}
        <div
          className="p-4"
          ref={gridContainerRef}
          style={fullscreen ? { flex: 1, overflowY: 'auto', overflowX: 'hidden' } : {}}
        >
          <ReactGridLayout
            width={gridWidth}
            layout={isMobile ? mobileLayout : gridLayout}
            cols={isMobile ? 2 : GRID_C}
            rowHeight={ROW_H}
            onDragStop={onGridChange}
            onResizeStop={onGridChange}
            isDraggable={editMode && !isMobile}
            isResizable={editMode && !isMobile}
            compactType="vertical"
            margin={isMobile ? [4, 4] : [8, 8]}
            containerPadding={[0, 0]}
            draggableHandle=".drag-handle"
          >
            {visibleDisplayItems.map((item) => {
              const lItem    = gridLayout.find(l => l.i === item.id);
              const panelPxH = (lItem?.h ?? getDefaultH(item)) * ROW_H;
              const reading = FIXED_IDS.has(item.id) ? null
                : (item.type === 'sht31-pair' || item.type === 'climate-gauge')
                  ? {
                      temp: ultimaPorIdTipo.get(`${item.tempSensorId}__temperatura`) || null,
                      hum:  ultimaPorIdTipo.get(`${item.humSensorId}__humedad`)     || null,
                    }
                  : (ultimaPorIdTipo.get(`${item.sensorId}__${item.measure}`) || null);

              return (
                <div key={item.id} style={{ height: '100%' }}>
                  <PanelItem
                    item={item}
                    config={effectiveConfig(item)}
                    data={history}
                    editMode={editMode}
                    onRemove={handleRemoveWidget}
                    onFullscreen={handlePanelFullscreen}
                    panelPxH={panelPxH}
                    reading={reading}
                    displayName={item.sensorId ? (sensorAliases[item.sensorId] || item.sensorName) : item.title}
                    onRename={item.type !== 'fixed' && item.sensorId ? (it) => setRenameTarget({ sensorId: it.sensorId, defaultName: it.sensorName }) : null}
                  />
                </div>
              );
            })}
          </ReactGridLayout>

          {dynamicCount === 0 && (
            <div className="rounded-xl p-6 mt-4 text-sm text-center"
              style={{ border: '1px dashed var(--color-border)', color: 'var(--text-color-muted, #9ca3af)' }}>
              No hay gráficos personalizados.
              <br/>
              <span className="opacity-60">Usa "+ Añadir gráfico" o el botón "Añadir" en la tabla.</span>
            </div>
          )}
        </div>
      </div>

      {/* ================================================
          SECCIÓN: TABLA DE SENSORES
      ================================================ */}
      <div className="rounded-2xl border overflow-hidden"
        style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b"
          style={{ borderColor: 'var(--color-border)' }}>
          <h2 className="text-sm font-semibold tracking-wide uppercase opacity-70">Sensores</h2>
          <span className="text-xs opacity-45">{onlineCount} online</span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full" style={{ color: 'var(--color-text)' }}>
            <thead>
              <tr className="text-xs tracking-wider uppercase"
                style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Estado</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Nombre</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Tipo</th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55 hidden md:table-cell">
                  <button
                    onClick={() => setPortSort(s => s === 'none' ? 'asc' : s === 'asc' ? 'desc' : 'none')}
                    className="flex items-center gap-1 hover:opacity-100 transition-opacity"
                    style={{ opacity: portSort !== 'none' ? 1 : 0.55 }}
                    title="Ordenar por puerto"
                  >
                    Puerto
                    {portSort === 'asc'  && <FiArrowUp size={11}/>}
                    {portSort === 'desc' && <FiArrowDown size={11}/>}
                    {portSort === 'none' && <span style={{ opacity: 0.4, fontSize: 10 }}>↕</span>}
                  </button>
                </th>
                <th className="py-2.5 px-4 text-left font-semibold opacity-55">Última lectura</th>
                <th className="py-2.5 px-4 text-center font-semibold opacity-55">Estadísticas</th>
              </tr>
            </thead>
            <tbody>
              {sortedGroupedAll.map((group, i) => {
                const rowBg = {
                  borderBottom: '1px solid var(--color-border)',
                  backgroundColor: i % 2 !== 0 ? 'color-mix(in srgb, var(--color-bg) 30%, transparent)' : 'transparent',
                };

                /* ── Fila par SHT31 (temperatura + humedad del mismo puerto) ── */
                if (group.kind === 'pair') {
                  const { tSensor, hSensor } = group;
                  const tReading  = ultimaPorIdTipo.get(`${String(tSensor.id)}__temperatura`);
                  const hReading  = ultimaPorIdTipo.get(`${String(hSensor.id)}__humedad`);
                  const pairAdded = displayItems.some(d => d.type === 'sht31-pair' && d.tempSensorId === String(tSensor.id));
                  const pairName  = sensorAliases[String(tSensor.id)] || tSensor.name || `SHT31 P${tSensor.puerto}`;
                  const pairOnline = tReading?.timestamp && (Date.now() - new Date(tReading.timestamp).getTime()) < 30_000;
                  return (
                    <tr key={`pair-${tSensor.id}-${hSensor.id}`}
                      className="hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)] transition-colors"
                      style={rowBg}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10b981' }}/>
                          <span className="font-mono text-xs opacity-50 hidden sm:inline">{tSensor.id}/{hSensor.id}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium">{pairName}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: '#ef444420', color: '#f87171', border: '1px solid #ef444440' }}>
                          Temp + Hum
                        </span>
                      </td>
                      <td className="py-3 px-4 hidden md:table-cell">
                        <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}>
                          P{tSensor.puerto}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold w-3" style={{ color: '#f87171' }}>T</span>
                            <span className="font-mono text-sm font-semibold">
                              {tReading ? `${tReading.valor}${tReading.unidad ? ` ${tReading.unidad}` : ' °C'}` : '—'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold w-3" style={{ color: '#60a5fa' }}>H</span>
                            <span className="font-mono text-sm font-semibold">
                              {hReading ? `${hReading.valor}${hReading.unidad ? ` ${hReading.unidad}` : ' %'}` : '—'}
                            </span>
                          </div>
                          {tReading?.timestamp && (
                            <div className="text-[10px]" style={{ color: 'var(--text-color-muted, #9ca3af)' }}>
                              {relativeTime(tReading.timestamp)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2 flex-wrap">
                          <button
                            onClick={() => handleQuickAddPair(group)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:opacity-80"
                            style={{
                              backgroundColor: pairAdded ? 'color-mix(in srgb, #10b981 10%, transparent)' : 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
                              color:       pairAdded ? '#10b981' : 'var(--color-primary)',
                              borderColor: pairAdded ? '#10b981' : 'var(--color-primary)',
                            }}>
                            <FiBarChart2 size={11}/>
                            {pairAdded ? 'En panel' : 'Añadir panel'}
                          </button>
                          <button
                            onClick={() => handleOpenDashboard(tSensor)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border transition hover:opacity-80 opacity-50"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                            title="Ver stats temperatura">
                            T↗
                          </button>
                          <button
                            onClick={() => handleOpenDashboard(hSensor)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs border transition hover:opacity-80 opacity-50"
                            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
                            title="Ver stats humedad">
                            H↗
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                /* ── Fila sensor individual ── */
                const sensor   = group.sensor;
                const sid      = String(sensor.id);
                const stype    = String(sensor.type ?? '');
                const reading  = ultimaPorIdTipo.get(`${sid}__${stype}`);
                const added    = displayItems.some(d => d.sensorId === sid && d.measure === stype);
                const isOnline = reading?.timestamp && (Date.now() - new Date(reading.timestamp).getTime()) < 30_000;
                return (
                  <tr
                    key={`${sensor.id}-${sensor.type}`}
                    className="hover:bg-[color-mix(in_srgb,var(--color-primary)_4%,transparent)] transition-colors"
                    style={rowBg}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#10b981' }}/>
                        <span className="font-mono text-xs opacity-50 hidden sm:inline">{sensor.id}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 group/name">
                        <span className="text-sm font-medium">
                          {sensorAliases[String(sensor.id)] || sensor.name}
                        </span>
                        {sensorAliases[String(sensor.id)] && (
                          <span className="text-[10px] opacity-35 italic hidden group-hover/name:inline">
                            ({sensor.name})
                          </span>
                        )}
                        <button
                          onClick={() => setRenameTarget({ sensorId: String(sensor.id), defaultName: sensor.name })}
                          className="opacity-0 group-hover/name:opacity-60 hover:!opacity-100 p-0.5 rounded transition"
                          title="Renombrar sensor"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          <FiEdit2 size={11}/>
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <TypeBadge type={sensor.type} />
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell">
                      {sensor.puerto != null
                        ? <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md"
                            style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 12%, transparent)', color: 'var(--color-primary)' }}>
                            P{sensor.puerto}
                          </span>
                        : <span className="text-xs opacity-30">—</span>
                      }
                    </td>
                    <td className="py-3 px-4">
                      {(() => {
                        const isDoor = ['puerta','reed'].some(k => stype.toLowerCase().includes(k) || (sensor.name||'').toLowerCase().includes(k) || sid.toLowerCase().includes(k));
                        const text   = reading ? (isDoor ? (Number(reading.valor) === 0 ? 'Abierto' : 'Cerrado') : `${reading.valor}${reading.unidad ? ` ${reading.unidad}` : ''}`) : '—';
                        const color  = isDoor && reading ? (Number(reading.valor) === 0 ? '#f87171' : '#4ade80') : 'var(--color-text)';
                        return <span className="font-mono text-sm font-semibold" style={{ color }}>{text}</span>;
                      })()}
                      {reading?.timestamp && (
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-color-muted, #9ca3af)' }}>
                          {relativeTime(reading.timestamp)}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleOpenDashboard(sensor)}
                        title="Ver dashboard completo del sensor"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition hover:opacity-80"
                        style={{
                          backgroundColor: 'color-mix(in srgb, var(--color-primary) 8%, transparent)',
                          color:       'var(--color-primary)',
                          borderColor: 'var(--color-primary)',
                        }}
                      >
                        <FiBarChart2 size={11}/>
                        Estadísticas
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sortedGroupedAll.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm opacity-35">
                    {sensorsLoaded ? 'No hay sensores registrados' : 'Conectando con el sistema…'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Wizard */}
      {showWizard && (
        <AddChartWizard
          sensors={sensors}
          lecturasNormalizadas={lecturasNormalizadas}
          sensorGroups={groupedAll}
          onAdd={handleAddWidget}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {/* Fullscreen de panel individual con zoom */}
      {fullscreenItem && (
        <PanelFullscreen
          item={fullscreenItem}
          config={{ ...effectiveConfig(fullscreenItem), enableZoom: true }}
          data={history}
          reading={ultimaPorIdTipo.get(
            `${fullscreenItem.sensorId ?? ''}__${fullscreenItem.measure ?? ''}`
          ) || null}
          onClose={() => setFullscreenItem(null)}
        />
      )}

      {/* Dashboard completo de sensor (overlay pantalla completa) */}
      {dashboardSensor && (
        <SensorDashboard
          sensor={dashboardSensor}
          lastReading={ultimaPorIdTipo.get(
            `${String(dashboardSensor.id)}__${String(dashboardSensor.type ?? '')}`
          ) || null}
          isAdded={displayItems.some(
            d => d.sensorId === String(dashboardSensor.id) && d.measure === String(dashboardSensor.type ?? '')
          )}
          onClose={() => setDashboardSensor(null)}
          onAddToDashboard={() => handleQuickAdd(dashboardSensor)}
        />
      )}

      {/* ── Modal de renombrado de sensor ── */}
      {renameTarget && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setRenameTarget(null); }}
        >
          <div
            className="rounded-2xl border shadow-2xl p-5 w-full max-w-sm"
            style={{ backgroundColor: 'var(--color-card)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>Renombrar sensor</h2>
                <p className="text-[11px] mt-0.5 opacity-40" style={{ color: 'var(--color-text)' }}>
                  Nombre original: {renameTarget.defaultName}
                </p>
              </div>
              <button onClick={() => setRenameTarget(null)} className="p-1.5 rounded-lg opacity-40 hover:opacity-80 transition" style={{ border: '1px solid var(--color-border)' }}>
                <FiMinimize2 size={13}/>
              </button>
            </div>
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameTarget(null); }}
              placeholder={renameTarget.defaultName}
              className="w-full px-3 py-2 text-sm rounded-xl mb-3"
              style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            />
            <div className="flex gap-2">
              {sensorAliases[renameTarget.sensorId] && (
                <button
                  onClick={() => { onSensorRename?.(renameTarget.sensorId, ''); setRenameTarget(null); }}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border transition hover:opacity-80"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)', opacity: 0.6 }}
                >
                  Restaurar original
                </button>
              )}
              <button
                onClick={() => setRenameTarget(null)}
                className="flex-1 py-2 rounded-xl text-xs font-semibold border transition hover:opacity-80"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
              >
                Cancelar
              </button>
              <button
                onClick={commitRename}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition hover:opacity-80"
                style={{ backgroundColor: 'var(--color-primary)' }}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default SensorManagement;
