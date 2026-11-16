'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, ListFilter, MousePointerClick, X } from 'lucide-react';
import { api, qs } from '@/lib/api';
import { FILTER_LABELS, useApp, useLoad } from '@/lib/store';
import type { Filters, RecordDoc } from '@/lib/types';
import { QualityBadge, Spinner } from './ui';

export function ChartCard({
  title,
  children,
  onRecords,
  onBack,
  backLabel,
  className = '',
  footer,
}: {
  title: string;
  children: React.ReactNode;
  onRecords?: () => void;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`card card-hover flex flex-col ${className}`}>
      <div className="card-title">
        <span className="flex-1 leading-snug">{title}</span>
        {onBack && (
          <button onClick={onBack} className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-soft hover:text-brand rounded-full px-2 py-1 hover:bg-brand-soft/60 transition" title="Drill up">
            <ArrowLeft className="w-3.5 h-3.5" /> {backLabel || 'Back'}
          </button>
        )}
        {onRecords && (
          <button onClick={onRecords} className="p-1.5 rounded-full text-ink-soft hover:text-brand hover:bg-brand-soft/60 transition" title="See the records behind this chart" aria-label="See records">
            <ListFilter className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="p-2 flex-1">{children}</div>
      {footer && <div className="px-4 pb-3 text-[11px] text-ink-soft">{footer}</div>}
    </div>
  );
}

export function ClickHint() {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
      <MousePointerClick className="w-3 h-3" /> Click any bar or slice to filter every chart · hover for details · legend toggles series
    </span>
  );
}

export function ActiveFilters() {
  const { filters, setFilter, clearFilters, applyMyView, me } = useApp();
  const keys = Object.keys(filters).filter((k) => filters[k]?.length);
  return (
    <div className="flex flex-wrap items-center gap-2 min-h-8">
      {keys.length === 0 && <span className="text-xs text-ink-soft">No filters: showing everything you have access to.</span>}
      {keys.map((k) =>
        filters[k].map((v) => (
          <span key={k + v} className="chip animate-pop">
            <span className="opacity-70">{FILTER_LABELS[k] || k}:</span> {v}
            <X className="w-3 h-3 cursor-pointer hover:scale-125 transition" onClick={() => setFilter(k, filters[k].filter((x) => x !== v))} />
          </span>
        )),
      )}
      {keys.length > 0 && (
        <button className="text-xs font-semibold text-brand hover:underline underline-offset-2" onClick={clearFilters}>
          Clear all
        </button>
      )}
      {me?.default_filters && Object.keys(me.default_filters).length > 0 && (
        <button className="text-xs text-ink-soft hover:text-brand hover:underline underline-offset-2" onClick={applyMyView}>
          My default view
        </button>
      )}
    </div>
  );
}

export function RecordsDrawer({ filters, title, onClose }: { filters: Filters; title: string; onClose: () => void }) {
  const { data, loading } = useLoad(() => api<{ total: number; items: RecordDoc[] }>(`/api/records${qs(filters, { size: 100 })}`), [JSON.stringify(filters)]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20 backdrop-blur-[2px] animate-fade-in" onClick={onClose}>
      <div className="w-full max-w-2xl h-full glass-strong !rounded-none !rounded-l-3xl flex flex-col animate-slide-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5">
          <div>
            <div className="font-[family-name:var(--font-display)] text-lg font-bold">{title}</div>
            <div className="text-xs text-ink-soft">{data ? `${data.total} records` : 'Loading'}</div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-full hover:bg-black/5">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-3 space-y-2 stagger">
          {loading && <Spinner />}
          {data?.items.map((r) => (
            <Link key={r.id} href={`/records/${r.id}`} className="block px-4 py-3 rounded-xl bg-white/70 hover:bg-white hover:shadow-sm transition">
              <div className="flex items-center gap-2 text-xs text-ink-soft">
                <span className="font-semibold text-brand">#{r.id}</span>
                <span>
                  {r.year} {r.quarter}
                </span>
                <span>· {r.country}</span>
                <span>· {r.activity_type}</span>
                <span className="ml-auto">
                  <QualityBadge q={r.quality} />
                </span>
              </div>
              <div className="text-sm mt-1 line-clamp-2">{r.comments}</div>
              <div className="text-xs text-ink-soft mt-1">
                {r.products.join(', ')} · {r.stakeholders.join(', ')}
              </div>
            </Link>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-black/5 text-xs text-ink-soft">Click a record to open and edit it.</div>
      </div>
    </div>
  );
}

/** Hook to open the records drawer for a chart (current filters + optional extra filter). */
export function useRecordsDrawer() {
  const { filters } = useApp();
  const [state, setState] = useState<{ title: string; filters: Filters } | null>(null);
  const open = (title: string, extra: Filters = {}) => setState({ title, filters: { ...filters, ...extra } });
  const node = state ? <RecordsDrawer title={state.title} filters={state.filters} onClose={() => setState(null)} /> : null;
  return { open, node };
}
