import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { useTheme } from '../theme/ThemeProvider';

// ─── helpers ────────────────────────────────────────────────────────────────

function getCutoff(timeRange) {
  if (!timeRange) return null;
  if (timeRange.kind === 'lastN') {
    const ms = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[timeRange.unit] ?? 60_000;
    return new Date(Date.now() - timeRange.value * ms);
  }
  return null;
}

function getAbsoluteRange(timeRange) {
  if (timeRange?.kind === 'absolute' && timeRange.from && timeRange.to)
    return { from: new Date(timeRange.from), to: new Date(timeRange.to) };
  return null;
}

function toTs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  return new Date(String(ts).replace(' ', 'T')).getTime();
}

function applyTimeRange(data, timeRange) {
  const abs = getAbsoluteRange(timeRange);
  if (abs) {
    const from = abs.from.getTime(), to = abs.to.getTime();
    return data.filter((d) => { const t = toTs(d.timestamp); return t >= from && t <= to; });
  }
  const cutoff = getCutoff(timeRange);
  if (!cutoff) return data;
  const cutoffMs = cutoff.getTime();
  return data.filter((d) => toTs(d.timestamp) >= cutoffMs);
}

function getXAxisBounds(timeRange) {
  if (!timeRange) return {};
  if (timeRange.kind === 'lastN') {
    const ms = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 }[timeRange.unit] ?? 60_000;
    return { min: Date.now() - timeRange.value * ms, max: Date.now() };
  }
  if (timeRange.kind === 'absolute' && timeRange.from && timeRange.to)
    return { min: new Date(timeRange.from).getTime(), max: new Date(timeRange.to).getTime() };
  return {};
}

function getColors() {
  const r = getComputedStyle(document.documentElement);
  const g = (v) => r.getPropertyValue(v).trim();
  return {
    text:    g('--color-text')    || '#eee',
    primary: g('--color-primary') || '#4f8ef7',
    accent:  g('--color-accent')  || '#06b6d4',
    border:  g('--color-border')  || '#444',
    card:    g('--color-card')    || '#1e1e1e',
    bg:      g('--color-bg')      || '#111',
  };
}

function gaugeRange(measure) {
  const m = (measure || '').toLowerCase();
  if (m.includes('temp'))  return { min: 0,   max: 60   };
  if (m.includes('hum'))   return { min: 0,   max: 100  };
  if (m.includes('lux'))   return { min: 0,   max: 2000 };
  if (m.includes('co2'))   return { min: 300, max: 2000 };
  if (m.includes('volt'))  return { min: 0,   max: 260  };
  if (m.includes('corr'))  return { min: 0,   max: 30   };
  if (m.includes('smoke') || m.includes('mq')) return { min: 0, max: 4096 };
  return { min: 0, max: 100 };
}

function statFontSizes(type, w, h) {
  const W = w || 200, H = h || 100;
  if (type === 'stat' || type === 'stat-bg') {
    const numFs  = Math.max(18, Math.min(W * 0.30, H * 0.48, 130));
    const unitFs = Math.max(11, Math.round(numFs * 0.30));
    return { numFs: Math.round(numFs), unitFs };
  }
  if (type === 'stat-spark') {
    const numFs  = Math.max(16, Math.min(W * 0.22, H * 0.30, 80));
    const unitFs = Math.max(10, Math.round(numFs * 0.32));
    return { numFs: Math.round(numFs), unitFs };
  }
  if (type === 'stat-bar') {
    const numFs  = Math.max(16, Math.min(W * 0.20, H * 0.28, 72));
    const unitFs = Math.max(10, Math.round(numFs * 0.30));
    return { numFs: Math.round(numFs), unitFs };
  }
  return { numFs: 28, unitFs: 12 };
}

/** Formatea el eje X según el rango de tiempo para mayor legibilidad */
function xAxisFormatter(timeRange) {
  const kind = timeRange?.kind;
  const unit = timeRange?.unit;
  const val  = timeRange?.value ?? 1;

  if (kind === 'lastN' && unit === 'minutes') {
    // Últimos N minutos → HH:mm:ss
    return (v) => new Date(v).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  if (kind === 'lastN' && unit === 'hours' && val <= 6) {
    // Últimas pocas horas → HH:mm
    return (v) => new Date(v).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  }
  if (kind === 'lastN' && unit === 'hours') {
    return (v) => {
      const d = new Date(v);
      return `${d.toLocaleDateString('es-CR', { month: '2-digit', day: '2-digit' })} ${d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}`;
    };
  }
  // Días o absoluto → fecha + hora
  return (v) => {
    const d = new Date(v);
    return `${d.toLocaleDateString('es-CR', { month: '2-digit', day: '2-digit' })} ${d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}`;
  };
}

/** Ancla el primer punto al min del eje X para que area/line rellene desde el borde izquierdo */
function anchorToRange(type, seriesData, xBounds) {
  if (!xBounds.min || seriesData.length === 0) return seriesData;
  if (type !== 'area' && type !== 'line' && type !== 'line-step') return seriesData;
  const firstTs = seriesData[0].value[0];
  if (firstTs > xBounds.min + 1000) {
    return [{ value: [xBounds.min, seriesData[0].value[1]], unidad: seriesData[0].unidad }, ...seriesData];
  }
  return seriesData;
}

/** Tooltip formatter con fecha completa cuando el rango es > 1 día */
function tooltipFormatter(timeRange, unit) {
  return (params) => {
    const p = params[0];
    if (!p) return '';
    const d = new Date(p.value[0]);
    const kind = timeRange?.kind;
    const tr_unit = timeRange?.unit;
    const val = timeRange?.value ?? 1;
    const showDate = kind === 'lastN' ? (tr_unit === 'days' || (tr_unit === 'hours' && val > 12)) : true;
    const timeStr = showDate
      ? d.toLocaleString('es-CR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : d.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    return `${timeStr}<br/><b>${Number(p.value[1]).toFixed(2)} ${unit}</b>`;
  };
}

function buildOption(config, seriesData, colors, dims = { w: 0, h: 0 }) {
  const { primary, text, border, card, accent } = colors;
  const type = config.chartType;
  const unit = config.unitOverride || (seriesData[0]?.unidad ?? '');
  const dec  = config.decimals ?? 1;

  const axisStyle = {
    axisLine:  { lineStyle: { color: border } },
    axisLabel: { color: text, fontSize: 9 },
    splitLine: { lineStyle: { color: border + '33' } },
  };

  // ── gauge ──
  if (type === 'gauge') {
    const val = seriesData.length > 0 ? seriesData[seriesData.length - 1]?.value?.[1] ?? 0 : 0;
    const { min, max } = gaugeRange(config.measure);
    return {
      backgroundColor: card,
      series: [{
        type: 'gauge', center: ['50%', '60%'], radius: '82%', min, max,
        axisLine: {
          lineStyle: {
            width: 12,
            color: [[0.3, accent + 'bb'], [0.7, primary + 'bb'], [1, '#ef4444bb']],
          },
        },
        pointer:   { itemStyle: { color: primary }, length: '60%', width: 5 },
        axisTick:  { distance: -12, length: 4,  lineStyle: { color: '#fff', width: 1 } },
        splitLine: { distance: -14, length: 8,  lineStyle: { color: '#fff', width: 2 } },
        axisLabel: { color: text, distance: 16, fontSize: 9 },
        detail: {
          valueAnimation: true,
          formatter: `{value}${unit}`,
          color: primary, fontSize: 18, fontWeight: 'bold', offsetCenter: [0, '25%'],
        },
        data: [{ value: +Number(val).toFixed(dec) }],
      }],
    };
  }

  // ── stat ──
  if (type === 'stat') {
    const val = seriesData.length > 0 ? seriesData[seriesData.length - 1]?.value?.[1] ?? 0 : 0;
    const { numFs, unitFs } = statFontSizes(type, dims.w, dims.h);
    return {
      backgroundColor: card,
      xAxis: { show: false }, yAxis: { show: false }, series: [],
      graphic: [
        { id: 'val',  type: 'text', left: 'center', top: 'middle',
          style: { text: String(Number(val).toFixed(dec)), font: `bold ${numFs}px sans-serif`, fill: primary, textAlign: 'center' } },
        { id: 'unit', type: 'text', left: 'center', bottom: '12%',
          style: { text: unit, font: `${unitFs}px sans-serif`, fill: text + 'bb', textAlign: 'center' } },
      ],
    };
  }

  // ── stat-spark ──
  if (type === 'stat-spark') {
    const val       = seriesData.length > 0 ? seriesData[seriesData.length - 1]?.value?.[1] ?? 0 : 0;
    const sparkData = seriesData.slice(-40).map((d) => d.value[1]);
    const { numFs, unitFs } = statFontSizes(type, dims.w, dims.h);
    return {
      backgroundColor: card,
      grid: { left: 0, right: 0, top: '56%', bottom: 0 },
      xAxis: { type: 'category', show: false, data: sparkData.map((_, i) => i) },
      yAxis: { type: 'value', show: false },
      series: [{
        type: 'line', data: sparkData, smooth: true, showSymbol: false,
        lineStyle: { color: primary, width: 1.5 },
        areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: primary + '55' }, { offset: 1, color: primary + '00' }]) },
      }],
      graphic: [
        { id: 'val',  type: 'text', left: 'center', top: '10%',
          style: { text: String(Number(val).toFixed(dec)), font: `bold ${numFs}px sans-serif`, fill: primary, textAlign: 'center' } },
        { id: 'unit', type: 'text', left: 'center', top: '42%',
          style: { text: unit, font: `${unitFs}px sans-serif`, fill: text + 'bb', textAlign: 'center' } },
      ],
    };
  }

  // ── stat-bg ──
  if (type === 'stat-bg') {
    const val = seriesData.length > 0 ? seriesData[seriesData.length - 1]?.value?.[1] ?? 0 : 0;
    const { numFs, unitFs } = statFontSizes(type, dims.w, dims.h);
    return {
      backgroundColor: { type: 'linear', x: 0, y: 0, x2: 1, y2: 1,
        colorStops: [{ offset: 0, color: primary + 'dd' }, { offset: 1, color: accent + 'aa' }] },
      xAxis: { show: false }, yAxis: { show: false }, series: [],
      graphic: [
        { id: 'val',  type: 'text', left: 'center', top: 'middle',
          style: { text: String(Number(val).toFixed(dec)), font: `bold ${numFs}px sans-serif`, fill: '#ffffff', textAlign: 'center' } },
        { id: 'unit', type: 'text', left: 'center', bottom: '12%',
          style: { text: unit, font: `${unitFs}px sans-serif`, fill: 'rgba(255,255,255,0.80)', textAlign: 'center' } },
      ],
    };
  }

  // ── stat-bar ──
  if (type === 'stat-bar') {
    const val           = seriesData.length > 0 ? seriesData[seriesData.length - 1]?.value?.[1] ?? 0 : 0;
    const { min, max }  = gaugeRange(config.measure);
    const pct           = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
    const { numFs, unitFs } = statFontSizes(type, dims.w, dims.h);
    return {
      backgroundColor: card,
      grid: { left: 16, right: 16, top: '64%', bottom: 10 },
      xAxis: { type: 'value', min: 0, max: 100, show: false },
      yAxis: { type: 'category', show: false, data: ['v'] },
      series: [{
        type: 'bar', data: [pct], barWidth: 8,
        showBackground: true, backgroundStyle: { color: border + '44', borderRadius: 4 },
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: accent }, { offset: 1, color: primary }]),
          borderRadius: 4,
        },
      }],
      graphic: [
        { id: 'val',  type: 'text', left: 'center', top: '8%',
          style: { text: String(Number(val).toFixed(dec)), font: `bold ${numFs}px sans-serif`, fill: primary, textAlign: 'center' } },
        { id: 'unit', type: 'text', left: 'center', top: '48%',
          style: { text: unit, font: `${unitFs}px sans-serif`, fill: text + 'bb', textAlign: 'center' } },
      ],
    };
  }

  // ── scatter ──
  if (type === 'scatter') {
    const xBoundsS = getXAxisBounds(config.timeRange);
    return {
      backgroundColor: card, textStyle: { color: text },
      grid: { left: 40, right: 8, top: 8, bottom: 36 },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(0,0,0,0.85)', borderColor: border,
        textStyle: { color: '#fff' },
        formatter: (p) => {
          const d = new Date(p.value[0]);
          return `${d.toLocaleTimeString()}<br/><b>${Number(p.value[1]).toFixed(dec)}${unit}</b>`;
        },
      },
      xAxis: { type: 'time', ...axisStyle, axisLabel: { ...axisStyle.axisLabel, rotate: 30 }, ...xBoundsS },
      yAxis: { type: 'value', ...axisStyle },
      series: [{ type: 'scatter', data: seriesData, symbolSize: 6, itemStyle: { color: primary, opacity: 0.75 } }],
    };
  }

  // ── barH ──
  if (type === 'barH') {
    const last = seriesData.slice(-15);
    return {
      backgroundColor: card, textStyle: { color: text },
      grid: { left: 52, right: 8, top: 6, bottom: 6 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(0,0,0,0.85)', borderColor: border, textStyle: { color: '#fff' } },
      xAxis: { type: 'value', ...axisStyle },
      yAxis: { type: 'category', data: last.map((d) => new Date(d.value[0]).toLocaleTimeString()),
        axisLine: { lineStyle: { color: border } }, axisLabel: { color: text, fontSize: 9 }, splitLine: { show: false } },
      series: [{
        type: 'bar', data: last.map((d) => d.value[1]), barMaxWidth: 18,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(1, 0, 0, 0, [
            { offset: 0, color: primary }, { offset: 1, color: accent + 'aa' }]),
          borderRadius: [0, 4, 4, 0],
        },
      }],
    };
  }

  // ── heatmap ──
  if (type === 'heatmap') {
    const hours = Array.from({ length: 24 }, (_, i) => `${i}h`);
    const days  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const buckets = {};
    seriesData.forEach((d) => {
      const dt  = new Date(d.value[0]);
      const key = `${dt.getDay()}-${dt.getHours()}`;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(d.value[1]);
    });
    const heatData = Object.entries(buckets).map(([k, vals]) => {
      const [day, hour] = k.split('-').map(Number);
      return [hour, day, +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(dec)];
    });
    const maxV = heatData.length > 0 ? Math.max(...heatData.map((d) => d[2])) : 100;
    const minV = heatData.length > 0 ? Math.min(...heatData.map((d) => d[2])) : 0;
    return {
      backgroundColor: card, textStyle: { color: text },
      tooltip: { position: 'top', formatter: (p) => `${days[p.data[1]]} ${p.data[0]}h: <b>${p.data[2]}${unit}</b>`,
        backgroundColor: 'rgba(0,0,0,0.85)', borderColor: border, textStyle: { color: '#fff' } },
      grid: { left: 36, right: 8, top: 6, bottom: 38 },
      xAxis: { type: 'category', data: hours, splitArea: { show: true },
        axisLabel: { color: text, fontSize: 8 }, axisLine: { lineStyle: { color: border } } },
      yAxis: { type: 'category', data: days, splitArea: { show: true },
        axisLabel: { color: text, fontSize: 9 }, axisLine: { lineStyle: { color: border } } },
      visualMap: { min: minV, max: maxV, calculable: true, orient: 'horizontal',
        left: 'center', bottom: 2, inRange: { color: [card, primary] },
        textStyle: { color: text }, itemHeight: 80, itemWidth: 10 },
      series: [{ type: 'heatmap', data: heatData, label: { show: false },
        emphasis: { itemStyle: { shadowBlur: 10, shadowColor: primary } } }],
    };
  }

  // ── line / area / bar / line-step (series de tiempo) ──
  const xBounds  = getXAxisBounds(config.timeRange);
  const fmtLabel = xAxisFormatter(config.timeRange);
  const fmtTip   = tooltipFormatter(config.timeRange, unit);

  const isStep   = type === 'line-step';
  // Para rangos cortos con muchos puntos: sampling + suavizado reducido
  const dense  = seriesData.length > 300;
  const smooth = (type === 'line' || type === 'area') ? (dense ? 0.1 : 0.35) : false;

  // Anclar primer punto al borde del rango para que area/line rellene desde la izquierda
  const plotData = anchorToRange(type, seriesData, xBounds);

  // Línea de umbral opcional
  const markLine = config.thresholdValue != null ? {
    silent: true, symbol: ['none', 'none'],
    lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
    label: { formatter: `Umbral: ${config.thresholdValue}`, color: '#ef4444', fontSize: 9, position: 'insideEndTop' },
    data: [{ yAxis: Number(config.thresholdValue) }],
  } : undefined;

  // zoom con click-drag (activado via dispatchAction tras init)
  const enableZoom = !!config.enableZoom;
  const gridBottom = enableZoom ? 54 : 40;
  const gridTop    = enableZoom ? 30 : 10;
  const gridRight  = enableZoom ? 68 : 10;

  // Toolbox: botones zoom-arrastrar + deshacer zoom + restablecer
  const toolbox = enableZoom ? {
    right: 8, top: 4, itemSize: 13, itemGap: 6,
    feature: {
      dataZoom: {
        yAxisIndex: 'none', filterMode: 'none',
        title: { zoom: 'Arrastrar → zoom', back: 'Deshacer zoom' },
      },
      restore: { title: 'Restablecer vista' },
    },
    iconStyle: { borderColor: border, color: 'transparent', borderWidth: 1.5 },
    emphasis: { iconStyle: { borderColor: primary, color: primary + '22' } },
  } : undefined;

  // Slider inferior para referencia visual del rango
  const dataZoom = enableZoom ? [
    {
      type: 'slider',
      xAxisIndex: 0,
      height: 16, bottom: 3,
      borderColor: border,
      backgroundColor: card,
      fillerColor: primary + '25',
      handleStyle: { color: primary, borderColor: primary },
      moveHandleStyle: { color: primary + 'aa' },
      textStyle: { color: text, fontSize: 8 },
      showDataShadow: true,
      dataBackground: {
        lineStyle: { color: primary + '44' },
        areaStyle: { color: primary + '18' },
      },
      selectedDataBackground: {
        lineStyle: { color: primary },
        areaStyle: { color: primary + '30' },
      },
    },
  ] : undefined;

  return {
    animation: true,
    animationDuration: 400,
    animationEasing: 'cubicOut',
    animationDurationUpdate: 200,
    animationEasingUpdate: 'linear',
    backgroundColor: card,
    textStyle: { color: text },
    toolbox,
    grid: { left: 44, right: gridRight, top: gridTop, bottom: gridBottom },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.88)',
      borderColor: border,
      textStyle: { color: '#fff', fontSize: 12 },
      axisPointer: { lineStyle: { color: primary + '88', width: 1 } },
      formatter: fmtTip,
    },
    xAxis: {
      type: 'time',
      ...axisStyle,
      axisLabel: { color: text, rotate: 30, fontSize: 9, formatter: fmtLabel },
      splitLine: { show: true, lineStyle: { color: border + '22', type: 'dashed' } },
      ...xBounds,
    },
    yAxis: {
      type: 'value',
      ...axisStyle,
      splitLine: { lineStyle: { color: border + '33', type: 'dashed' } },
    },
    dataZoom,
    series: [{
      type:        type === 'bar' ? 'bar' : 'line',
      data:        plotData,
      step:        isStep ? 'end' : undefined,
      smooth:      smooth,
      sampling:    dense ? 'lttb' : undefined,
      showSymbol:  !dense && plotData.length < 40,
      symbolSize:  5,
      lineStyle:   { width: isStep ? 1.5 : 2, color: primary },
      itemStyle: {
        color: primary,
        borderRadius: type === 'bar' ? [3, 3, 0, 0] : undefined,
      },
      areaStyle: type === 'area'
        ? { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: primary + '50' }, { offset: 1, color: primary + '08' }]) }
        : undefined,
      barMaxWidth: 20,
      markLine,
    }],
  };
}

// Activa el modo click-drag para hacer zoom (como Zabbix)
function activateZoom(inst) {
  if (!inst) return;
  inst.dispatchAction({ type: 'takeGlobalCursor', key: 'dataZoomSelect', dataZoomSelectActive: true });
}

// ─── component ───────────────────────────────────────────────────────────────

const STAT_TYPES = new Set(['stat', 'stat-bg', 'stat-spark', 'stat-bar']);

export default function ChartRenderer({ config, data, height }) {
  const chartRef         = useRef(null);
  const chartInstance    = useRef(null);
  const dimsRef          = useRef({ w: 0, h: 0 });
  const prevTimeRangeRef = useRef(null);
  const configRef        = useRef(config);
  const dataRef          = useRef(data);

  useEffect(() => { configRef.current = config; });
  useEffect(() => { dataRef.current   = data; });

  // useTheme para detectar cambios de modo/color
  const { themeMode, theme } = useTheme();
  const themeColorKey = `${themeMode}|${theme?.primaryColor}|${theme?.accentColor}`;

  const initKey      = `${config.chartType}|${config.sensorId}|${config.measure}`;
  const tr           = config.timeRange;
  const timeRangeKey = tr
    ? `${tr.kind}|${tr.unit ?? ''}|${tr.value ?? ''}|${tr.from ?? ''}|${tr.to ?? ''}`
    : 'all';

  // ── Effect 1: full init — solo cuando cambia tipo / sensor / medida ──
  useEffect(() => {
    if (!chartRef.current) return;

    if (chartInstance.current) {
      chartInstance.current.dispose();
      chartInstance.current = null;
    }
    chartInstance.current = echarts.init(chartRef.current, null, { renderer: 'canvas' });

    const cfg        = configRef.current;
    const colors     = getColors();
    const seriesData = applyTimeRange(
      (dataRef.current || []).filter((d) => d.sensorId === cfg.sensorId && d.tipo === cfg.measure),
      cfg.timeRange
    ).map((d) => ({ value: [toTs(d.timestamp), d.valor], unidad: d.unidad }));

    if (chartRef.current)
      dimsRef.current = { w: chartRef.current.offsetWidth, h: chartRef.current.offsetHeight };

    chartInstance.current.setOption(buildOption(cfg, seriesData, colors, dimsRef.current), { notMerge: true });
    if (cfg.enableZoom) {
      activateZoom(chartInstance.current);
      // Restaurar zoom guardado
      const zoomKey = `zoom_${cfg.sensorId}_${cfg.chartType}`;
      const saved = sessionStorage.getItem(zoomKey);
      if (saved) {
        try {
          const { start, end } = JSON.parse(saved);
          chartInstance.current.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, start, end });
        } catch { sessionStorage.removeItem(zoomKey); }
      }
      // Guardar zoom al cambiar
      chartInstance.current.on('datazoom', () => {
        const opts = chartInstance.current?.getOption();
        const dz = opts?.dataZoom?.[0];
        if (dz != null) {
          sessionStorage.setItem(zoomKey, JSON.stringify({ start: dz.start ?? 0, end: dz.end ?? 100 }));
        }
      });
    }

    const onResize = () => {
      if (!chartInstance.current || !chartRef.current) return;
      chartInstance.current.resize();
      const type = configRef.current?.chartType;
      if (STAT_TYPES.has(type)) {
        const w = chartRef.current.offsetWidth;
        const h = chartRef.current.offsetHeight;
        dimsRef.current = { w, h };
        const { numFs, unitFs } = statFontSizes(type, w, h);
        chartInstance.current.setOption(
          { graphic: [
            { id: 'val',  style: { font: `bold ${numFs}px sans-serif` } },
            { id: 'unit', style: { font: `${unitFs}px sans-serif` } },
          ] },
          { notMerge: false, silent: true }
        );
      }
    };

    const t = setTimeout(onResize, 60);
    window.addEventListener('resize', onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(chartRef.current);

    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', onResize);
      ro.disconnect();
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, [initKey]); // eslint-disable-line

  // ── Effect 2: actualización suave — datos nuevos o cambio de rango ──
  useEffect(() => {
    if (!chartInstance.current) return;

    const cfg        = configRef.current;
    const colors     = getColors();
    const seriesData = applyTimeRange(
      (data || []).filter((d) => d.sensorId === cfg.sensorId && d.tipo === cfg.measure),
      cfg.timeRange
    ).map((d) => ({ value: [toTs(d.timestamp), d.valor], unidad: d.unidad }));

    const type    = cfg.chartType;
    const unit    = cfg.unitOverride || (seriesData[0]?.unidad ?? '');
    const dec     = cfg.decimals ?? 1;
    const xBounds = getXAxisBounds(cfg.timeRange);

    const rangeChanged = prevTimeRangeRef.current !== timeRangeKey;
    prevTimeRangeRef.current = timeRangeKey;

    const statFonts = () => statFontSizes(type, dimsRef.current.w, dimsRef.current.h);

    if (type === 'gauge') {
      const val = seriesData.length > 0 ? seriesData[seriesData.length - 1]?.value?.[1] ?? 0 : 0;
      chartInstance.current.setOption(
        { series: [{ data: [{ value: +Number(val).toFixed(dec) }] }] }, { notMerge: false });
    } else if (type === 'stat' || type === 'stat-bg') {
      const val = seriesData.length > 0 ? seriesData[seriesData.length - 1]?.value?.[1] ?? 0 : 0;
      const { numFs, unitFs } = statFonts();
      chartInstance.current.setOption(
        { graphic: [
          { id: 'val',  style: { text: String(Number(val).toFixed(dec)), font: `bold ${numFs}px sans-serif` } },
          { id: 'unit', style: { text: unit, font: `${unitFs}px sans-serif` } },
        ] }, { notMerge: false });
    } else if (type === 'stat-spark') {
      const val       = seriesData.length > 0 ? seriesData[seriesData.length - 1]?.value?.[1] ?? 0 : 0;
      const sparkData = seriesData.slice(-40).map((d) => d.value[1]);
      const { numFs, unitFs } = statFonts();
      chartInstance.current.setOption({
        series: [{ data: sparkData }],
        graphic: [
          { id: 'val',  style: { text: String(Number(val).toFixed(dec)), font: `bold ${numFs}px sans-serif` } },
          { id: 'unit', style: { text: unit, font: `${unitFs}px sans-serif` } },
        ],
      }, { notMerge: false });
    } else if (type === 'stat-bar') {
      const val          = seriesData.length > 0 ? seriesData[seriesData.length - 1]?.value?.[1] ?? 0 : 0;
      const { min, max } = gaugeRange(cfg.measure);
      const pct          = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
      const { numFs, unitFs } = statFonts();
      chartInstance.current.setOption({
        series: [{ data: [pct] }],
        graphic: [
          { id: 'val',  style: { text: String(Number(val).toFixed(dec)), font: `bold ${numFs}px sans-serif` } },
          { id: 'unit', style: { text: unit, font: `${unitFs}px sans-serif` } },
        ],
      }, { notMerge: false });
    } else if (type === 'barH') {
      const last = seriesData.slice(-15);
      chartInstance.current.setOption({
        yAxis:  { data: last.map((d) => new Date(d.value[0]).toLocaleTimeString()) },
        series: [{ data: last.map((d) => d.value[1]) }],
      }, { notMerge: false });
    } else if (type === 'heatmap') {
      chartInstance.current.setOption(buildOption(cfg, seriesData, colors, dimsRef.current), { notMerge: true });
    } else {
      // line, area, bar, scatter, line-step
      if (rangeChanged) {
        if (cfg.enableZoom && cfg.sensorId)
          sessionStorage.removeItem(`zoom_${cfg.sensorId}_${cfg.chartType}`);
        chartInstance.current.setOption(
          buildOption(cfg, seriesData, colors, dimsRef.current),
          { notMerge: true }
        );
        if (cfg.enableZoom) activateZoom(chartInstance.current);
      } else {
        const anchored = anchorToRange(type, seriesData, xBounds);
        chartInstance.current.setOption({
          animationDurationUpdate: 200,
          animationEasingUpdate: 'linear',
          xAxis: xBounds,
          series: [{ data: anchored }],
        }, { notMerge: false });
      }
    }
  }, [data, timeRangeKey]);

  // ── Effect 3: tema cambió → esperar un tick para que ThemeProvider aplique CSS vars primero ──
  useEffect(() => {
    if (!chartInstance.current) return;
    const timer = setTimeout(() => {
      if (!chartInstance.current) return;
      const cfg        = configRef.current;
      const colors     = getColors();
      const seriesData = applyTimeRange(
        (dataRef.current || []).filter((d) => d.sensorId === cfg.sensorId && d.tipo === cfg.measure),
        cfg.timeRange
      ).map((d) => ({ value: [toTs(d.timestamp), d.valor], unidad: d.unidad }));
      chartInstance.current.setOption(
        buildOption(cfg, seriesData, colors, dimsRef.current),
        { notMerge: true }
      );
      if (cfg.enableZoom) activateZoom(chartInstance.current);
    }, 0);
    return () => clearTimeout(timer);
  }, [themeColorKey]); // eslint-disable-line

  return <div ref={chartRef} style={{ width: '100%', height: height ?? '100%' }} />;
}
