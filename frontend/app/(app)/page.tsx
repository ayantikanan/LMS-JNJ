'use client';

import Link from 'next/link';
import { Download, Eye, FileText, MessageCircle, Presentation, Users } from 'lucide-react';
import EChart, { COLORS } from '@/components/EChart';
import FilterPane from '@/components/FilterPane';
import { ActiveFilters, ChartCard, ClickHint, useRecordsDrawer } from '@/components/charts';
import { DashboardSkeleton, ErrorBox } from '@/components/ui';
import { api, download, qs } from '@/lib/api';
import { additionalOption, donutOption, evolutionOption, simpleBarOption, stackedBarOption, stakeholderOption } from '@/lib/chartOptions';
import { useApp, useLoad } from '@/lib/store';
import type { Dashboard } from '@/lib/types';

function Tile({ icon, label, value, color, sub }: { icon: React.ReactNode; label: React.ReactNode; value: React.ReactNode; color: string; sub?: string }) {
  return (
    <div className="group flex items-center gap-3 min-w-0">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0 shadow-[0_8px_16px_-8px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-110" style={{ background: `linear-gradient(135deg, ${color}cc, ${color})` }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-ink truncate">{label}</div>
        <div className="text-2xl font-bold tracking-tight tabular-nums" style={{ color }}>
          {value}
        </div>
        {sub && <div className="text-[10px] text-ink-soft">{sub}</div>}
      </div>
    </div>
  );
}

export default function PVInsightsPage() {
  const { filters, toggleFilter, setFilters, userId, dataVersion } = useApp();
  const { data: d, loading, error } = useLoad(() => api<Dashboard>(`/api/dashboard${qs(filters)}`), [JSON.stringify(filters), userId, dataVersion]);
  const drawer = useRecordsDrawer();

  const yearSel = filters.year || [];
  const evoMode: 'year' | 'period' = d && yearSel.length === 0 && d.evolution.periods.length > 8 ? 'year' : 'period';

  const onEvolution = (name: string) => {
    if (evoMode === 'year') setFilters({ ...filters, year: [name] });
    else {
      const [y, q] = name.split(' - ');
      setFilters({ ...filters, year: [y], quarter: (filters.quarter || []).includes(q) ? (filters.quarter || []).filter((x) => x !== q) : [q] });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1 min-w-0 p-4 space-y-4">
        <div className="card relative overflow-hidden px-5 py-4 flex flex-wrap items-center gap-4">
          <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-gradient-to-br from-brand/25 to-transparent blur-2xl pointer-events-none" />
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff4a2e] to-brand text-white flex items-center justify-center shadow-[0_10px_20px_-10px_rgb(235_23_0/0.9)]">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">LMS Benefit-Risk Interaction Dashboard</div>
              <div className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">PV Insights</div>
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex gap-2">
            <Link href="/records" className="btn-primary">Details</Link>
            <Link href="/statistics" className="btn-outline">Statistics</Link>
            <button className="btn-outline" onClick={() => download(`/api/export${qs(filters, { format: 'xlsx', title: 'PV Insights view' })}`, 'pv_insights.xlsx')} title="Export this view to Excel">
              <Download className="w-4 h-4" /> Excel
            </button>
          </div>
        </div>

        <ErrorBox error={error} />
        {loading && !d && <DashboardSkeleton />}
        {d && (
          <>
            <div className="card p-4 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 stagger">
              <Tile icon={<Eye className="w-5 h-5" />} label="PV Insights Activities" value={d.tiles.total} color={COLORS.brand} />
              <Tile icon={<MessageCircle className="w-5 h-5" />} label="Discussion(s)" value={d.tiles.discussion} color={COLORS.Discussion} />
              <Tile icon={<Presentation className="w-5 h-5" />} label="Presentation(s)" value={d.tiles.presentation} color={COLORS.Presentation} />
              <Tile icon={<FileText className="w-5 h-5" />} label="Material(s)" value={d.tiles.material} color={COLORS.Material} />
              <Tile icon={<Users className="w-5 h-5" />} label={<><span className="text-internal">Internal</span> Stakeholder(s)</>} value={`${d.tiles.internal_pct}%`} color={COLORS.Internal} />
              <Tile icon={<Users className="w-5 h-5" />} label={<><span className="text-external">External</span> Stakeholder(s)</>} value={`${d.tiles.external_pct}%`} color={COLORS.External} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 stagger">
              {[
                ['Avg data quality score', `${d.tiles.avg_quality}/100`, 'quality_band'],
                ['Follow-up planned', `${d.tiles.follow_up_pct}%`, 'follow_up'],
                ['New stakeholders', `${d.tiles.new_stakeholder_pct}%`, 'stakeholder_status'],
                ['Stakeholder requests', d.tiles.stakeholder_requests, 'stakeholder_request'],
              ].map(([label, value]) => (
                <div key={label as string} className="card card-hover px-4 py-3">
                  <div className="text-[11px] text-ink-soft uppercase tracking-wide">{label}</div>
                  <div className="text-xl font-bold text-ink tabular-nums">{value}</div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap justify-between gap-2">
              <ActiveFilters />
              <ClickHint />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 stagger">
              <ChartCard
                className="xl:col-span-5"
                title="Evolution of PV Insights Activities"
                onBack={yearSel.length ? () => setFilters({ ...filters, year: [], quarter: [] }) : undefined}
                backLabel="All years"
                onRecords={() => drawer.open('Evolution of PV Insights Activities')}
                footer={evoMode === 'year' ? 'Click a year to drill into its quarters.' : 'Click a quarter to filter by it.'}
              >
                <EChart height={290} option={evolutionOption(d, evoMode)} onClick={(p) => p.seriesName === 'Activities' && onEvolution(p.name)} />
              </ChartCard>
              <ChartCard className="xl:col-span-3" title="Focused Product/TA per PV Insight" onRecords={() => drawer.open('Focused Product/TA')}>
                <EChart
                  height={300}
                  option={stackedBarOption(d.products.categories, d.products.series, { percentOfRow: true })}
                  onClick={(p) => p.seriesName !== 'total' && toggleFilter('products', p.name)}
                />
              </ChartCard>
              <ChartCard className="xl:col-span-4" title="PV Insights per Stakeholder(s) activities Split" onRecords={() => drawer.open('Stakeholder split')}>
                <EChart height={300} option={stakeholderOption(d)} onClick={(p) => p.componentType === 'series' && toggleFilter('stakeholders', p.name)} />
              </ChartCard>

              <ChartCard className="xl:col-span-3" title="PV Insights Activity Type" onRecords={() => drawer.open('Activity type')}>
                <EChart height={290} option={donutOption(d.activity_type, COLORS as unknown as Record<string, string>)} onClick={(p) => toggleFilter('activity_type', p.name)} />
              </ChartCard>
              <ChartCard className="xl:col-span-5" title="Contents Per Activity Type" onRecords={() => drawer.open('Contents per activity type')}>
                <EChart
                  height={290}
                  option={stackedBarOption(d.content.categories, d.content.series, { pctLabels: d.content.pct, totals: d.content.total_pct })}
                  onClick={(p) => p.seriesName !== 'total' && toggleFilter('content', p.name)}
                />
              </ChartCard>
              <ChartCard className="xl:col-span-4" title="Additional Details" onRecords={() => drawer.open('Additional details')}>
                <EChart
                  height={290}
                  option={additionalOption(d)}
                  onClick={(p) => {
                    const key = { 'Stakeholder request': 'stakeholder_request', 'Material for external use': 'material_external', 'Related to a product launch': 'product_launch' }[p.name];
                    if (key && p.seriesName) toggleFilter(key, p.seriesName);
                  }}
                />
              </ChartCard>
            </div>

            <div>
              <h2 className="text-sm font-bold text-ink uppercase tracking-wide mb-2"><span className="text-brand">●</span> Value indicators <span className="font-normal normal-case text-ink-soft">(demo values on existing records, pending the final KPI list)</span></h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 stagger">
                <ChartCard title="Impact category" onRecords={() => drawer.open('Impact category')}>
                  <EChart height={230} option={simpleBarOption(d.impact, COLORS.brand)} onClick={(p) => toggleFilter('impact_category', p.name)} />
                </ChartCard>
                <ChartCard title="Interaction outcomes">
                  <EChart height={230} option={simpleBarOption(d.outcomes, COLORS.Presentation, true, false)} />
                </ChartCard>
                <ChartCard title="Data quality" onRecords={() => drawer.open('Data quality')}>
                  <EChart height={230} option={donutOption(d.quality_bands, { High: '#2e9e6b', Medium: '#f2a900', Low: '#eb1700' })} onClick={(p) => toggleFilter('quality_band', p.name)} />
                </ChartCard>
                <ChartCard title="Therapeutic area" onRecords={() => drawer.open('Therapeutic area')}>
                  <EChart height={230} option={donutOption(d.ta)} onClick={(p) => toggleFilter('ta', p.name)} />
                </ChartCard>
              </div>
            </div>
          </>
        )}
      </div>
      <FilterPane />
      {drawer.node}
    </div>
  );
}
