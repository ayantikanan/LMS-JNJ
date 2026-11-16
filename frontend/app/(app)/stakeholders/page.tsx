'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, BookOpen, CalendarClock, Flame, GitPullRequestArrow, PlusCircle, Repeat } from 'lucide-react';
import EChart, { COLORS } from '@/components/EChart';
import FilterPane from '@/components/FilterPane';
import { ActiveFilters, ChartCard } from '@/components/charts';
import { ErrorBox, PageHeader, QualityBadge, Spinner } from '@/components/ui';
import { api, qs } from '@/lib/api';
import { simpleBarOption } from '@/lib/chartOptions';
import { useApp, useLoad } from '@/lib/store';
import type { BRRequest, Material, Quality } from '@/lib/types';

interface Summary {
  code: string;
  name: string;
  type: string;
  count: number;
  last_interaction: string;
  days_since: number;
  gap_alert_days: number;
  overdue: boolean;
  top_products: string[];
  top_topics: string[];
  follow_ups: number;
}
interface Brief {
  id: number;
  year: string;
  quarter: string;
  country: string;
  activity_type: string;
  products: string[];
  comments: string;
  created_date: string;
  quality: Quality;
}
interface Detail {
  code: string;
  name: string;
  type: string;
  summary: Summary;
  recent: Brief[];
  materials: (Material & { times_used: number })[];
  topics: { name: string; count: number }[];
  follow_ups: Brief[];
  requests: BRRequest[];
  by_period: Record<string, number>;
}

function List() {
  const { filters, userId, dataVersion } = useApp();
  const { data, loading, error } = useLoad(() => api<Summary[]>(`/api/stakeholders${qs(filters)}`), [JSON.stringify(filters), userId, dataVersion]);
  return (
    <>
      <PageHeader title="Stakeholders" subtitle="One page per stakeholder function: last interactions, materials used, hot topics and follow-ups." />
      <ActiveFilters />
      <ErrorBox error={error} />
      {loading && !data && <Spinner />}
      <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4 mt-3">
        {data?.map((s) => (
          <Link key={s.code} href={`/stakeholders?code=${encodeURIComponent(s.code)}`} className="card p-4 hover:shadow-md transition block">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-lg font-bold" style={{ color: s.type === 'External' ? COLORS.External : COLORS.Internal }}>
                  {s.code}
                </div>
                <div className="text-xs text-ink-soft">
                  {s.name} · {s.type}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-brand">{s.count}</div>
                <div className="text-[11px] text-ink-soft">interactions</div>
              </div>
            </div>
            <div className={`mt-3 text-xs flex items-center gap-1.5 ${s.overdue ? 'text-accent font-semibold' : 'text-ink-soft'}`}>
              {s.overdue ? <AlertTriangle className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />}
              Last interaction {s.last_interaction} ({s.days_since} days ago{s.overdue ? `, over the ${s.gap_alert_days}-day target` : ''})
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {s.top_products.map((p) => (
                <span key={p} className="chip !bg-red-50 !text-accent">{p}</span>
              ))}
              {s.top_topics.map((t) => (
                <span key={t} className="chip">{t}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function DetailView({ code }: { code: string }) {
  const { filters, userId, dataVersion } = useApp();
  const router = useRouter();
  const { data: d, loading, error } = useLoad(() => api<Detail>(`/api/stakeholders/${encodeURIComponent(code)}${qs(filters)}`), [code, JSON.stringify(filters), userId, dataVersion]);
  if (loading && !d) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!d) return null;
  const s = d.summary;
  const periods = Object.keys(d.by_period).sort();
  return (
    <div className="space-y-4">
      <button className="btn-ghost !px-0" onClick={() => router.push('/stakeholders')}>
        <ArrowLeft className="w-4 h-4" /> All stakeholders
      </button>
      <div className="card p-5 flex flex-wrap items-center gap-6">
        <div>
          <div className="text-3xl font-bold" style={{ color: d.type === 'External' ? COLORS.External : COLORS.Internal }}>
            {d.code}
          </div>
          <div className="text-sm text-ink-soft">
            {d.name} · {d.type} stakeholder
          </div>
        </div>
        {s && (
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <div className="text-2xl font-bold text-brand">{s.count}</div>
              <div className="text-xs text-ink-soft">interactions</div>
            </div>
            <div>
              <div className={`text-2xl font-bold ${s.overdue ? 'text-accent' : 'text-brand'}`}>{s.days_since}d</div>
              <div className="text-xs text-ink-soft">since last ({s.last_interaction})</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-brand">{s.follow_ups}</div>
              <div className="text-xs text-ink-soft">follow-ups planned</div>
            </div>
          </div>
        )}
        <div className="flex-1" />
        <Link href="/records/new" className="btn-primary">
          <PlusCircle className="w-4 h-4" /> Log interaction
        </Link>
      </div>
      {s?.overdue && (
        <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm flex gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
          <div>
            It&apos;s been {Math.round(s.days_since / 30)} months since the last interaction with {d.code} (target: every {s.gap_alert_days} days). Suggested next interaction: share the latest
            material on {s.top_products[0] || 'your products'}{s.top_topics[0] ? ` about ${s.top_topics[0].toLowerCase()}` : ''}.
          </div>
        </div>
      )}
      <div className="grid xl:grid-cols-3 gap-4">
        <ChartCard title="Interactions per quarter" className="xl:col-span-2">
          <EChart height={240} option={simpleBarOption(periods.map((p) => ({ name: p, count: d.by_period[p] })), COLORS.Internal, false, false)} />
        </ChartCard>
        <div className="card">
          <div className="card-title">
            <Flame className="w-4 h-4" /> Insights: topics discussed
          </div>
          <ul className="p-3 space-y-1.5 text-sm">
            {d.topics.map((t) => (
              <li key={t.name} className="flex justify-between">
                <span>{t.name}</span>
                <span className="chip">{t.count}</span>
              </li>
            ))}
            {d.topics.length === 0 && <li className="text-ink-soft">No topics recognised.</li>}
          </ul>
        </div>
        <div className="card xl:col-span-2">
          <div className="card-title">Last interactions</div>
          <div className="divide-y max-h-[460px] overflow-auto">
            {d.recent.map((r) => (
              <Link key={r.id} href={`/records/${r.id}`} className="block px-4 py-2.5 hover:bg-white/80 transition">
                <div className="flex gap-2 text-xs text-ink-soft">
                  <span className="font-semibold text-brand">#{r.id}</span> {r.year} {r.quarter} · {r.country} · {r.activity_type} · {r.products.join(', ')}
                  <span className="ml-auto">
                    <QualityBadge q={r.quality} />
                  </span>
                </div>
                <div className="text-sm line-clamp-2">{r.comments}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="card">
            <div className="card-title">
              <BookOpen className="w-4 h-4" /> Materials used
            </div>
            <ul className="p-3 space-y-2 text-sm">
              {d.materials.map((m) => (
                <li key={m.id} className="flex justify-between gap-2">
                  <span>{m.title}</span>
                  <span className="text-xs text-ink-soft whitespace-nowrap">{m.times_used}x</span>
                </li>
              ))}
              {d.materials.length === 0 && <li className="text-ink-soft">No materials linked yet.</li>}
            </ul>
          </div>
          <div className="card">
            <div className="card-title">
              <Repeat className="w-4 h-4" /> Follow-ups
            </div>
            <ul className="p-3 space-y-2 text-sm">
              {d.follow_ups.map((r) => (
                <li key={r.id}>
                  <Link href={`/records/${r.id}`} className="text-brand font-semibold">#{r.id}</Link> <span className="text-ink-soft line-clamp-2">{r.comments}</span>
                </li>
              ))}
              {d.follow_ups.length === 0 && <li className="text-ink-soft">No follow-ups flagged.</li>}
            </ul>
          </div>
          <div className="card">
            <div className="card-title">
              <GitPullRequestArrow className="w-4 h-4" /> Open B/R requests
            </div>
            <ul className="p-3 space-y-2 text-sm">
              {d.requests.map((q) => (
                <li key={q.id}>
                  <Link href={`/requests?id=${q.id}`} className="text-brand font-semibold">{q.id}</Link> {q.title}
                </li>
              ))}
              {d.requests.length === 0 && <li className="text-ink-soft">None open.</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StakeholdersPage() {
  const code = useSearchParams().get('code');
  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1 min-w-0 p-4">{code ? <DetailView code={code} /> : <List />}</div>
      <FilterPane />
    </div>
  );
}
