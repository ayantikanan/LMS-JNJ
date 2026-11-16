'use client';

import { useEffect, useRef } from 'react';
import type { ECharts, EChartsOption } from 'echarts';

export interface ChartClick {
  name: string;
  seriesName?: string;
  value?: unknown;
  dataIndex: number;
  componentType?: string;
}

interface Props {
  option: EChartsOption;
  height?: number | string;
  onClick?: (p: ChartClick) => void;
  wordcloud?: boolean;
  className?: string;
}

export const COLORS = {
  Discussion: '#004585',
  Material: '#eb1700',
  Presentation: '#6e6159',
  Internal: '#eb1700',
  External: '#004585',
  brand: '#eb1700',
  accent: '#b31200',
  navy: '#004585',
  // J&J deck palette: red, navy, warm grey, sky, then tints
  palette: ['#eb1700', '#004585', '#a39992', '#69d0ff', '#6e6159', '#ff7a66', '#2e7db5', '#d5cfc9', '#b31200', '#9fdcff'],
};

/** Shared look: glassy tooltip, smooth enter + update animations. */
const BASE = {
  backgroundColor: 'transparent',
  animationDuration: 700,
  animationEasing: 'cubicOut',
  animationDurationUpdate: 550,
  animationEasingUpdate: 'cubicInOut',
  tooltip: {
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1,
    padding: [8, 12],
    textStyle: { color: '#1a1a1a', fontSize: 12 },
    extraCssText: 'backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-radius: 12px; box-shadow: 0 12px 30px -12px rgba(40,20,10,0.35);',
  },
};

function withBase(option: EChartsOption): EChartsOption {
  const tip = (option as { tooltip?: object }).tooltip;
  return { ...BASE, ...option, tooltip: tip ? { ...BASE.tooltip, ...tip } : BASE.tooltip } as EChartsOption;
}

/** Thin ECharts wrapper: hover tooltips, click events, legend toggles, save-as-image, responsive. */
export default function EChart({ option, height = 300, onClick, wordcloud, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;
  const optionRef = useRef(option);
  optionRef.current = option;

  useEffect(() => {
    let disposed = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const echarts = await import('echarts');
      if (wordcloud) await import('echarts-wordcloud');
      if (disposed || !ref.current) return;
      const c = echarts.init(ref.current, undefined, { renderer: 'canvas' });
      chart.current = c;
      c.setOption(withBase(optionRef.current), true); // latest option, not the one from the first render
      c.on('click', (p: unknown) => clickRef.current?.(p as ChartClick));
      ro = new ResizeObserver(() => c.resize());
      ro.observe(ref.current);
    })();
    return () => {
      disposed = true;
      ro?.disconnect();
      chart.current?.dispose();
      chart.current = null;
    };
    // init once; option updates handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordcloud]);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    // Hide any open tooltip first, then replace the whole option. A partial merge (replaceMerge) left the
    // axis tooltip pointing at series that no longer exist, which crashed on hover ("getDataParams").
    c.dispatchAction({ type: 'hideTip' });
    c.setOption(withBase(option), { notMerge: true });
  }, [option]);

  return <div ref={ref} className={className} style={{ width: '100%', height, cursor: onClick ? 'pointer' : 'default' }} />;
}
