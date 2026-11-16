import type { EChartsOption } from 'echarts';
import { COLORS } from '@/components/EChart';
import type { Dashboard, NameCount } from './types';

const ACT = ['Discussion', 'Material', 'Presentation'] as const;
const toolbox = { show: true, right: 4, top: 0, itemSize: 12, feature: { saveAsImage: { title: 'Save image', pixelRatio: 2 } } };
const font = { fontFamily: 'Segoe UI, system-ui, sans-serif' };

export function evolutionOption(d: Dashboard, mode: 'year' | 'period'): EChartsOption {
  const yearColor = (y: string) => {
    const i = d.evolution.years.indexOf(y);
    return COLORS.palette[(i < 0 ? 0 : i) % COLORS.palette.length];
  };
  const cats = mode === 'year' ? d.evolution.years : d.evolution.periods;
  const vals = mode === 'year' ? d.evolution.by_year : d.evolution.counts;
  return {
    textStyle: font,
    toolbox,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p: any) => `${p[0].name}<br/><b>${p[0].value}</b> activities${mode === 'year' ? '<br/><i>Click to drill into quarters</i>' : ''}` },
    grid: { left: 36, right: 12, top: 34, bottom: 42 },
    legend: {
      top: 0,
      left: 0,
      data: d.evolution.years,
      selectedMode: false,
      itemWidth: 8,
      itemHeight: 8,
      icon: 'circle',
      textStyle: { fontSize: 10 },
    },
    xAxis: { type: 'category', data: cats, axisLabel: { fontSize: 10, interval: 0, rotate: cats.length > 8 ? 35 : 0 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dotted' } } },
    series: [
      ...d.evolution.years.map((y) => ({ name: y, type: 'bar' as const, data: [], itemStyle: { color: yearColor(y) } })),
      {
        name: 'Activities',
        type: 'bar',
        barMaxWidth: 26,
        data: vals.map((v, i) => ({ value: v, itemStyle: { color: yearColor(cats[i].split(' - ')[0]) } })),
        label: { show: true, position: 'top', fontSize: 11 },
        itemStyle: { borderRadius: [6, 6, 0, 0] },
      },
    ],
  };
}

export function stackedBarOption(categories: string[], series: Record<string, number[]>, opts: { percentOfRow?: boolean; pctLabels?: Record<string, number[]>; totals?: number[] } = {}): EChartsOption {
  const rowTotal = categories.map((_, i) => ACT.reduce((s, a) => s + (series[a]?.[i] || 0), 0));
  return {
    textStyle: font,
    toolbox,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (ps: any) =>
        `<b>${ps[0].name}</b><br/>` +
        ps.map((p: any) => `${p.marker} ${p.seriesName}: ${opts.percentOfRow ? `${p.value}%` : p.value}`).join('<br/>') +
        '<br/><i>Click to filter</i>',
    },
    legend: { bottom: 0, data: [...ACT], itemWidth: 10, itemHeight: 10, textStyle: { fontSize: 11 } },
    grid: { left: 8, right: opts.totals ? 44 : 16, top: 22, bottom: 30, containLabel: true },
    xAxis: { type: 'value', show: false, max: opts.percentOfRow ? 100 : undefined },
    yAxis: { type: 'category', data: categories, inverse: true, axisLabel: { fontSize: 11, width: 120, overflow: 'truncate' }, axisTick: { show: false } },
    series: ACT.map((a) => ({
      name: a,
      type: 'bar' as const,
      stack: 'total',
      barMaxWidth: 22,
      itemStyle: { color: COLORS[a] },
      data: categories.map((_, i) => {
        const raw = series[a]?.[i] || 0;
        return opts.percentOfRow ? (rowTotal[i] ? Math.round((1000 * raw) / rowTotal[i]) / 10 : 0) : raw;
      }),
      label: {
        show: true,
        fontSize: 10,
        color: '#fff',
        formatter: (p: any) => {
          if (!p.value) return '';
          if (opts.pctLabels) {
            const v = opts.pctLabels[a]?.[p.dataIndex] || 0;
            return v >= 3 ? `${Math.round(v)}%` : '';
          }
          return opts.percentOfRow ? (p.value >= 10 ? `${p.value}%` : '') : String(p.value);
        },
      },
    })).concat(
      opts.totals
        ? [
            {
              name: 'total',
              type: 'bar' as const,
              stack: 'total',
              itemStyle: { color: 'transparent' } as any,
              data: categories.map(() => 0),
              label: { show: true, position: 'right', color: '#333', fontSize: 11, formatter: (p: any) => `${Math.round(opts.totals![p.dataIndex])}%` } as any,
              tooltip: { show: false },
            } as any,
          ]
        : [],
    ),
  };
}

export function stakeholderOption(d: Dashboard): EChartsOption {
  const rows = d.stakeholders;
  return {
    textStyle: font,
    toolbox,
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const s = rows[p.dataIndex];
        return `<b>${s.code}</b> - ${s.name}<br/>${s.type} · ${s.count} activities (${s.pct}%)<br/><i>Click to filter</i>`;
      },
    },
    legend: { bottom: 0, data: ['External', 'Internal'], itemWidth: 10, itemHeight: 10, icon: 'circle', selectedMode: false },
    grid: { left: 8, right: 52, top: 10, bottom: 28, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', data: rows.map((r) => r.code), inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 11, fontWeight: 'bold', color: '#1a1a1a' } },
    series: [
      {
        type: 'bar',
        barMaxWidth: 12,
        data: rows.map((r) => ({ value: r.pct, itemStyle: { color: r.type === 'External' ? COLORS.External : COLORS.Internal, borderRadius: [0, 6, 6, 0] } })),
        label: { show: true, position: 'right', formatter: '{c}%', fontSize: 11, fontWeight: 'bold' },
      },
      { name: 'External', type: 'bar', data: [], itemStyle: { color: COLORS.External } },
      { name: 'Internal', type: 'bar', data: [], itemStyle: { color: COLORS.Internal } },
    ],
  };
}

export function donutOption(items: NameCount[], colors?: Record<string, string>, legendBottom = true): EChartsOption {
  return {
    textStyle: font,
    toolbox,
    tooltip: { trigger: 'item', formatter: '<b>{b}</b><br/>{c} activities ({d}%)<br/><i>Click to filter</i>' },
    legend: legendBottom ? { bottom: 0, itemWidth: 10, itemHeight: 10, icon: 'circle', textStyle: { fontSize: 11 } } : { show: false },
    color: COLORS.palette,
    series: [
      {
        type: 'pie',
        radius: ['46%', '70%'],
        padAngle: 2,
        itemStyle: { borderRadius: 8, borderColor: 'rgba(255,255,255,0.9)', borderWidth: 2 },
        emphasis: { scaleSize: 6 },
        center: ['50%', '46%'],
        avoidLabelOverlap: true,
        label: { formatter: '{d}%', fontSize: 11 },
        data: items.filter((i) => i.count).map((i) => ({ name: i.name, value: i.count, itemStyle: colors?.[i.name] ? { color: colors[i.name] } : undefined })),
      },
    ],
  };
}

export function additionalOption(d: Dashboard): EChartsOption {
  const rows: [string, keyof Dashboard['additional']][] = [
    ['Stakeholder request', 'stakeholder_request'],
    ['Material for external use', 'material_external'],
    ['Related to a product launch', 'product_launch'],
  ];
  const tone: Record<string, string> = { Yes: '#eb1700', No: '#d5cfc9', 'N/A': '#6e6159' };
  return {
    textStyle: font,
    toolbox,
    tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}<br/>${p.seriesName}: <b>${p.value}%</b><br/><i>Click to filter</i>` },
    legend: { bottom: 0, data: ['Yes', 'No', 'N/A'], itemWidth: 10, itemHeight: 10, icon: 'circle' },
    grid: { left: 8, right: 16, top: 6, bottom: 30, containLabel: true },
    xAxis: { type: 'value', max: 100, show: false },
    yAxis: { type: 'category', data: rows.map((r) => r[0]), inverse: true, axisTick: { show: false }, axisLabel: { fontSize: 11 } },
    series: ['Yes', 'No', 'N/A'].map((v) => ({
      name: v,
      type: 'bar' as const,
      stack: 's',
      barMaxWidth: 18,
      itemStyle: { color: tone[v] },
      data: rows.map(([, k]) => d.additional[k].find((x) => x.value === v)?.pct || 0),
      label: { show: true, color: '#fff', fontSize: 10, formatter: (p: any) => (p.value >= 8 ? `${p.value}%` : '') },
    })),
  };
}

export function simpleBarOption(items: NameCount[], color = COLORS.brand, horizontal = true, clickable = true): EChartsOption {
  return {
    textStyle: font,
    toolbox,
    tooltip: { trigger: 'item', formatter: `<b>{b}</b><br/>{c} activities${clickable ? '<br/><i>Click to filter</i>' : ''}` },
    grid: { left: 8, right: 36, top: 10, bottom: 10, containLabel: true },
    [horizontal ? 'xAxis' : 'yAxis']: { type: 'value', show: !horizontal, splitLine: { lineStyle: { type: 'dotted' } } },
    [horizontal ? 'yAxis' : 'xAxis']: {
      type: 'category',
      data: items.map((i) => i.name),
      inverse: horizontal,
      axisTick: { show: false },
      axisLabel: { fontSize: 11, width: 170, overflow: 'truncate', interval: 0 },
    },
    series: [{ type: 'bar', barMaxWidth: 16, data: items.map((i) => i.count), itemStyle: { color, borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0] }, label: { show: true, position: horizontal ? 'right' : 'top', fontSize: 11 } }],
  } as EChartsOption;
}

export function geoOption(d: Dashboard): EChartsOption {
  const names = Object.keys(d.geo.series);
  return {
    textStyle: font,
    toolbox,
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, type: 'scroll', textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
    grid: { left: 36, right: 12, top: 34, bottom: 46 },
    xAxis: { type: 'category', data: d.geo.periods, axisLabel: { fontSize: 10, rotate: d.geo.periods.length > 6 ? 35 : 0 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dotted' } } },
    color: COLORS.palette,
    series: names.map((n) => ({ name: n, type: 'bar' as const, stack: 'geo', barMaxWidth: 34, data: d.geo.series[n], emphasis: { focus: 'series' } })),
  };
}

export function trendOption(periods: string[], series: Record<string, number[]>): EChartsOption {
  return {
    textStyle: font,
    toolbox,
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 10 } },
    grid: { left: 30, right: 16, top: 16, bottom: 60 },
    color: COLORS.palette,
    xAxis: { type: 'category', data: periods, axisLabel: { fontSize: 10, rotate: periods.length > 6 ? 35 : 0 } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { type: 'dotted' } } },
    series: Object.entries(series).map(([name, data]) => ({ name, type: 'line' as const, smooth: true, symbolSize: 6, data })),
  };
}

export function wordcloudOption(items: { name: string; count: number }[]): EChartsOption {
  return {
    tooltip: { formatter: '<b>{b}</b><br/>{c} interactions<br/><i>Click to filter</i>' },
    series: [
      {
        type: 'wordCloud',
        shape: 'circle',
        gridSize: 10,
        sizeRange: [13, 44],
        rotationRange: [0, 0],
        width: '100%',
        height: '100%',
        textStyle: { fontFamily: 'Segoe UI, sans-serif', fontWeight: 'bold', color: (p: any) => COLORS.palette[(p?.dataIndex ?? 0) % 8] },
        emphasis: { textStyle: { color: '#b31200' } },
        data: items.map((i) => ({ name: i.name, value: i.count })),
      } as any,
    ],
  };
}
