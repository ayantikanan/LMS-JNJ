'use client';

import Link from 'next/link';
import { Eye, GraduationCap, Users } from 'lucide-react';
import EChart, { COLORS } from '@/components/EChart';
import FilterPane from '@/components/FilterPane';
import { ActiveFilters, ChartCard, ClickHint, useRecordsDrawer } from '@/components/charts';
import { DashboardSkeleton, ErrorBox, Info } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { donutOption, geoOption, simpleBarOption, stakeholderOption } from '@/lib/chartOptions';
import { useApp, useLoad } from '@/lib/store';
import type { Dashboard } from '@/lib/types';
import type { EChartsOption } from 'echarts';

function allActivitiesOption(d: Dashboard): EChartsOption {
  return {
    toolbox: { right: 4, itemSize: 12, feature: { saveAsImage: { title: 'Save image', pixelRatio: 2 } } },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0, left: 0, data: ['PV Insights'], icon: 'circle', itemWidth: 8, textStyle: { fontSize: 10 } },
    grid: { left: 36, right: 12, top: 30, bottom: 46 },
    xAxis: { type: 'category', data: d.evolution.periods, axisLabel: { fontSize: 10, rotate: d.evolution.periods.length > 8 ? 35 : 0 } },
    yAxis: { type: 'value', splitLine: { lineStyle: { type: 'dotted' } } },
    dataZoom: d.evolution.periods.length > 12 ? [{ type: 'slider', height: 14, bottom: 4 }, { type: 'inside' }] : [],
    series: [{ name: 'PV Insights', type: 'bar', barMaxWidth: 60, data: d.evolution.counts, itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#ff4a2e' }, { offset: 1, color: '#eb1700' }] }, borderRadius: [8, 8, 0, 0] }, label: { show: true, position: 'inside', color: '#fff', fontSize: 11 } }],
  };
}

export default function StatisticsPage() {
  const { filters, toggleFilter, setFilters, userId, dataVersion } = useApp();
  const { data: d, loading, error } = useLoad(() => api<Dashboard>(`/api/dashboard${qs(filters)}`), [JSON.stringify(filters), userId, dataVersion]);
  const drawer = useRecordsDrawer();

  const geoKey = d?.geo.level || 'region';
  const drillGeo = (name: string) => setFilters({ ...filters, [geoKey]: [name] });
  const geoBack =
    geoKey === 'country' ? () => setFilters({ ...filters, cluster: [], country: [] }) : geoKey === 'cluster' ? () => setFilters({ ...filters, region: [], cluster: [], country: [] }) : undefined;

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1 min-w-0 p-4 space-y-4">
        <div className="card px-5 py-4 flex flex-wrap items-center gap-4">
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">LMS Benefit-Risk Interaction Dashboard</div>
            <div className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">Statistics</div>
          </div>
          <Link href="/" className="btn-primary">PV Insights</Link>
        </div>
        <ErrorBox error={error} />
        {loading && !d && <DashboardSkeleton />}
        {d && (
          <>
            <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-4 stagger">
              <div className="flex items-center gap-3">
                <Eye className="w-9 h-9 text-accent" />
                <div>
                  <div className="text-xs font-semibold">PV Insights Activities</div>
                  <div className="text-xl font-bold">{d.tiles.total}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <GraduationCap className="w-9 h-9 text-accent" />
                <div>
                  <div className="text-xs font-semibold flex items-center gap-1">
                    Training &amp; Education Activities <Info text="The sample data only contains PV Insights records, so this stays blank until Training & Education records are added." />
                  </div>
                  <div className="text-xl font-bold">{d.tiles.training ?? '(Blank)'}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-9 h-9" style={{ color: COLORS.Internal }} />
                <div>
                  <div className="text-xs font-semibold"><span className="text-internal">Internal</span> Stakeholder(s) Activities</div>
                  <div className="text-xl font-bold text-internal">{d.tiles.internal_pct}%</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Users className="w-9 h-9" style={{ color: COLORS.External }} />
                <div>
                  <div className="text-xs font-semibold"><span className="text-external">External</span> Stakeholder(s) Activities</div>
                  <div className="text-xl font-bold text-external">{d.tiles.external_pct}%</div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <ActiveFilters />
              <ClickHint />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 stagger">
              <ChartCard className="xl:col-span-8" title="Evolution of All Activities per Quarter" onRecords={() => drawer.open('All activities')}>
                <EChart
                  height={300}
                  option={allActivitiesOption(d)}
                  onClick={(p) => {
                    const [y, q] = p.name.split(' - ');
                    setFilters({ ...filters, year: [y], quarter: [q] });
                  }}
                />
              </ChartCard>
              <ChartCard className="xl:col-span-4 xl:row-span-2" title="Overall Stakeholder(s) Split" onRecords={() => drawer.open('Overall stakeholder split')}>
                <EChart height={640} option={stakeholderOption(d)} onClick={(p) => p.componentType === 'series' && toggleFilter('stakeholders', p.name)} />
              </ChartCard>
              <ChartCard
                className="xl:col-span-8"
                title={`Region-wise Overall Activities per Quarter (by ${geoKey})`}
                onBack={geoBack}
                backLabel="Up"
                onRecords={() => drawer.open('Region-wise activities')}
                footer="Click a region to drill into clusters, then countries."
              >
                <div className="grid md:grid-cols-5 gap-2">
                  <div className="md:col-span-2">
                    <EChart height={300} option={simpleBarOption(d.geo.items, COLORS.navy)} onClick={(p) => drillGeo(p.name)} />
                  </div>
                  <div className="md:col-span-3">
                    <EChart height={300} option={geoOption(d)} onClick={(p) => p.seriesName && drillGeo(p.seriesName)} />
                  </div>
                </div>
              </ChartCard>
              <ChartCard className="xl:col-span-6" title="Activity Level" onRecords={() => drawer.open('Activity level')}>
                <EChart height={260} option={donutOption(d.activity_level, { Global: COLORS.External, Regional: COLORS.Internal, Local: COLORS.Presentation })} onClick={(p) => toggleFilter('activity_level', p.name)} />
              </ChartCard>
              <ChartCard className="xl:col-span-6" title="Activities per Therapeutic Area" onRecords={() => drawer.open('Therapeutic area')}>
                <EChart height={260} option={simpleBarOption(d.ta, COLORS.accent)} onClick={(p) => toggleFilter('ta', p.name)} />
              </ChartCard>
            </div>
          </>
        )}
      </div>
      <FilterPane />
      {drawer.node}
    </div>
  );
}
