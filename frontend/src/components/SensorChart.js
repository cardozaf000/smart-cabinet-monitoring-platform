import React, { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

const SensorCharts = ({ lecturas, tipoSensor, data, tipo, maxPoints = 60 }) => {
  const elRef = useRef(null);
  const chartRef = useRef(null);

  // Inicializa ECharts con tema dinámico
  useEffect(() => {
    if (!chartRef.current && elRef.current) {
      chartRef.current = echarts.init(elRef.current, null, {
        renderer: 'canvas',
      });

      const onResize = () => chartRef.current && chartRef.current.resize();
      window.addEventListener('resize', onResize);
      return () => {
        window.removeEventListener('resize', onResize);
        chartRef.current && chartRef.current.dispose();
        chartRef.current = null;
      };
    }
  }, []);

  // Actualiza colores y datos
  useEffect(() => {
    if (!chartRef.current) return;

    const dataset = Array.isArray(lecturas)
      ? lecturas
      : Array.isArray(data)
      ? data
      : [];

    const tipoFinal = tipoSensor ?? tipo;

    const filtered = dataset
      .filter((item) => (item.tipo ?? item.type) === tipoFinal)
      .map((item) => ({
        time: item.timestamp ?? item.time ?? '—',
        value: Number(item.valor ?? item.value),
      }))
      .filter((d) => !Number.isNaN(d.value))
      .sort((a, b) => new Date(a.time) - new Date(b.time))
      .slice(-maxPoints);

    const isArea = tipoFinal === 'temperatura' || tipoFinal === 'humedad';

    // Variables CSS del tema activo
    const styles = getComputedStyle(document.documentElement);
    const textColor = styles.getPropertyValue('--text-color')?.trim() || '#ffffff';
    const axisColor = styles.getPropertyValue('--border-color')?.trim() || '#888888';
    const primaryColor = styles.getPropertyValue('--primary-color')?.trim() || '#3b82f6';
    const bgColor = styles.getPropertyValue('--card-color')?.trim() || '#1f2937';

    chartRef.current.setOption(
      {
        backgroundColor: bgColor,
        title: {
          text: `Lecturas de ${tipoFinal ?? '—'}`,
          textStyle: { color: textColor, fontWeight: 'bold' },
          subtext: filtered.length ? '' : 'Sin datos',
          subtextStyle: { color: axisColor },
        },
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 20, top: 50, bottom: 40 },
        xAxis: {
          type: 'category',
          data: filtered.map((d) => d.time),
          axisLabel: { color: textColor },
          axisLine: { lineStyle: { color: axisColor } },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: textColor },
          axisLine: { lineStyle: { color: axisColor } },
          splitLine: {
            lineStyle: {
              color: axisColor,
              type: 'dashed',
            },
          },
        },
        series: [
          {
            type: tipoFinal === 'luz' ? 'bar' : 'line',
            data: filtered.map((d) => d.value),
            smooth: true,
            itemStyle: {
              color: primaryColor,
            },
            lineStyle: {
              color: primaryColor,
              width: 3,
            },
            ...(isArea
              ? {
                  areaStyle: {
                    color: primaryColor,
                    opacity: 0.3,
                  },
                }
              : {}),
          },
        ],
      },
      { notMerge: true }
    );
  }, [lecturas, data, tipoSensor, tipo, maxPoints]);

  return (
    <div
      ref={elRef}
      style={{
        width: '100%',
        height: 400,
        borderRadius: '1rem',
        overflow: 'hidden',
      }}
    />
  );
};

export default SensorCharts;
