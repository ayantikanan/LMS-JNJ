'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Globe2, Sparkles } from 'lucide-react';
import EChart, { COLORS } from '@/components/EChart';
import FilterPane from '@/components/FilterPane';
import { ActiveFilters, ChartCard, ClickHint, useRecordsDrawer } from '@/components/charts';
import { EngineBadge, ErrorBox, Markdown, PageHeader, Spinner } from '@/components/ui';
import { api, post, qs } from '@/lib/api';
import { simpleBarOption, trendOption, wordcloudOption } from '@/lib/chartOptions';
import { useApp, useLoad } from '@/lib/store';

interface Topics {
  topics: { name: string; count: number; products: string[]; countries: number }[];
  trend: { periods: string[]; series: Record<string, number[]> };
  examples: Record<string, { id: number; country: string; products: string[]; period: string; text: string }[]>;
  untagged: number;
  elsewhere?: { name: string; count: number; countries: number }[];
}

export default function HotTopicsPage() {
  const { filters, toggleFilter, userId, me, dataVersion } = useApp();
  const { data, loading, error } = useLoad(() => api<Topics>(`/api/hot-topics${qs(filters)}`), [JSON.stringify(filters), userId, dataVersion]);
  const [summary, setSummary] = useState<{ text: string; engine: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const drawer = useRecordsDrawer();
  const selected = filters.topic?.[0];

  const summarise = async () => {
    setBusy(true);
    try {
      setSummary(await post<{ text: string; engine: string }>(`/api/hot-topics/summary${qs(filters)}`, {}));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1 min-w-0 p-4 space-y-4">
        <PageHeader title="Safety hot topics" subtitle="Recurring safety topics pulled from the Comments field of logged interactions, per TA, product and quarter.">
          <button className="btn-primary" onClick={summarise} disabled={busy}>
            <Sparkles className="w-4 h-4" /> {busy ? 'Summarising...' : 'AI summary of these topics'}
          </button>
        </PageHeader>
        <div className="flex flex-wrap justify-between gap-2">
          <ActiveFilters />
          <ClickHint />
        </div>
        <ErrorBox error={error} />
        {summary && (
          <div className="card p-4 border-l-4 border-l-brand">
            <div className="flex items-center gap-2 mb-1 font-semibold text-brand">
              AI summary <EngineBadge engine={summary.engine} />
            </div>
            <Markdown text={summary.text} />
          </div>
        )}
        {loading && !data && <Spinner />}
        {data && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
            <ChartCard className="xl:col-span-7" title="Hot topics word cloud" footer={`Bigger = discussed in more interactions. ${data.untagged} interactions had no recognised safety topic.`}>
              {data.topics.length ? (
                <EChart wordcloud height={330} option={wordcloudOption(data.topics)} onClick={(p) => toggleFilter('topic', p.name)} />
              ) : (
                <div className="p-6 text-sm text-ink-soft">No topics for these filters.</div>
              )}
            </ChartCard>
            <ChartCard className="xl:col-span-5" title="Top topics (interactions)" onRecords={() => drawer.open('Hot topics')}>
              <EChart height={330} option={simpleBarOption(data.topics.slice(0, 12), COLORS.brand)} onClick={(p) => toggleFilter('topic', p.name)} />
            </ChartCard>
            <ChartCard className="xl:col-span-7" title="Topic trend per quarter (top 6)">
              <EChart height={300} option={trendOption(data.trend.periods, data.trend.series)} />
            </ChartCard>
            <div className="xl:col-span-5 card">
              <div className="card-title">
                <Globe2 className="w-4 h-4" /> Discussed elsewhere on the same products
              </div>
              <div className="p-3">
                {data.elsewhere ? (
                  <>
                    <p className="text-xs text-ink-soft mb-2">
                      Topics other countries and regions logged for your focus products. You see counts only, not their records ({me?.scope_level} access).
                    </p>
                    <ul className="space-y-1.5">
                      {data.elsewhere.map((t) => (
                        <li key={t.name} className="flex items-center gap-2 text-sm">
                          <span className="flex-1">{t.name}</span>
                          <span className="text-xs text-ink-soft">{t.countries} {t.countries === 1 ? "country" : "countries"}</span>
                          <span className="chip">{t.count}</span>
                        </li>
                      ))}
                      {data.elsewhere.length === 0 && <li className="text-sm text-ink-soft">Nothing logged elsewhere for these products.</li>}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-ink-soft">You have global access, so the charts already include every country.</p>
                )}
              </div>
            </div>
            <div className="xl:col-span-12 card">
              <div className="card-title">What colleagues logged {selected ? `on "${selected}"` : '(top topics)'}</div>
              <div className="p-3 grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {(selected ? [selected] : data.topics.slice(0, 6).map((t) => t.name)).map((t) => (
                  <div key={t} className="rounded-xl bg-white/60 p-3">
                    <div className="font-semibold text-sm text-brand mb-1">{t}</div>
                    <div className="text-xs text-ink-soft mb-2">
                      {data.topics.find((x) => x.name === t)?.products.join(', ')} · {data.topics.find((x) => x.name === t)?.countries} {data.topics.find((x) => x.name === t)?.countries === 1 ? 'country' : 'countries'}
                    </div>
                    {(data.examples[t] || []).map((e) => (
                      <Link key={e.id} href={`/records/${e.id}`} className="block text-xs py-1 border-t hover:bg-white/80 transition">
                        <span className="font-semibold text-brand">#{e.id}</span> {e.period} · {e.country}: {e.text}
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <FilterPane />
      {drawer.node}
    </div>
  );
}
