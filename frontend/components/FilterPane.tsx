'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { Bookmark, ChevronsLeft, ChevronsRight, Filter, Save, Trash2 } from 'lucide-react';
import { api, del, post } from '@/lib/api';
import { FILTER_LABELS, useApp, useLoad } from '@/lib/store';
import type { SavedView } from '@/lib/types';
import { Picker } from './ui';

export default function FilterPane() {
  const { reference, filters, setFilter, setFilters, userId } = useApp();
  const path = usePathname();
  const [open, setOpen] = useState(true);
  const [name, setName] = useState('');
  const views = useLoad(() => api<SavedView[]>('/api/views'), [userId]);

  if (!reference) return null;
  const d = reference.dropdowns;
  const clusters = Object.entries(d.hierarchy)
    .filter(([r]) => !filters.region?.length || filters.region.includes(r))
    .flatMap(([, c]) => Object.keys(c));
  const countries = Object.entries(d.hierarchy)
    .filter(([r]) => !filters.region?.length || filters.region.includes(r))
    .flatMap(([r, c]) =>
      Object.entries(c)
        .filter(([cl]) => !filters.cluster?.length || filters.cluster.includes(cl))
        .flatMap(([cl, cs]) => cs.map((x) => ({ value: x, group: `${r} · ${cl}` }))),
    );
  const products = d.products.map((p) => ({ value: p, hint: reference.product_ta[p] }));

  const fields: [string, (string | { value: string; group?: string; hint?: string })[]][] = [
    ['products', products],
    ['ta', d.tas],
    ['title', d.title],
    ['activity_level', d.activity_level],
    ['stakeholder_request', d.stakeholder_request],
    ['material_external', d.yes_no],
    ['region', Object.keys(d.hierarchy)],
    ['cluster', clusters],
    ['country', countries],
    ['year', d.year],
    ['quarter', d.quarter],
    ['activity_type', d.activity_type],
    ['content', d.content],
    ['stakeholders', d.stakeholders.map((s) => ({ value: s.code, hint: s.type }))],
    ['topic', d.topics],
  ];

  const save = async () => {
    if (!name.trim()) return;
    await post('/api/views', { name: name.trim(), page: path, filters });
    setName('');
    views.reload();
  };

  if (!open)
    return (
      <button onClick={() => setOpen(true)} className="hidden lg:flex flex-col items-center gap-2 w-10 m-3 ml-0 glass rounded-2xl py-3 text-brand hover:bg-white/80 transition h-fit sticky top-20" title="Show filters">
        <ChevronsLeft className="w-4 h-4" />
        <Filter className="w-4 h-4" />
        <span className="[writing-mode:vertical-rl] text-xs font-semibold">Filters</span>
      </button>
    );

  return (
    <aside className="w-full lg:w-76 shrink-0 p-3 lg:pl-0 lg:h-[calc(100vh-64px)] lg:sticky lg:top-16 animate-fade-in">
      <div className="glass rounded-2xl h-full overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/5">
        <div className="flex items-center gap-2 font-semibold text-ink">
          <Filter className="w-4 h-4" /> Filters
        </div>
        <button onClick={() => setOpen(false)} className="text-ink-soft hidden lg:block" title="Hide filters">
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-3 border-b border-black/5 bg-white/40">
        <div className="text-xs font-semibold text-ink-soft mb-2 flex items-center gap-1">
          <Bookmark className="w-3.5 h-3.5" /> Saved views
        </div>
        <div className="space-y-1 mb-2">
          {views.data?.length === 0 && <div className="text-xs text-ink-soft">No saved views yet.</div>}
          {views.data?.map((v) => (
            <div key={v.id} className="flex items-center gap-1">
              <button className="flex-1 text-left text-sm text-brand hover:underline truncate" onClick={() => setFilters(v.filters)} title={JSON.stringify(v.filters)}>
                {v.name}
              </button>
              <button
                className="text-gray-400 hover:text-accent"
                aria-label="Delete view"
                onClick={async () => {
                  await del(`/api/views/${v.id}`);
                  views.reload();
                }}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-1">
          <input className="input !py-1 !text-xs" placeholder="Name this view" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} />
          <button className="btn-primary !px-2" onClick={save} title="Save current filters">
            <Save className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-4 py-3 space-y-3">
        <div className="text-xs text-ink-soft">Filters stay applied as you move between pages.</div>
        {fields.map(([key, opts]) => (
          <div key={key}>
            <div className="text-xs font-semibold text-ink mb-1 flex justify-between">
              <span>{FILTER_LABELS[key]}</span>
              <span className="font-normal text-gray-400">{filters[key]?.length ? `${filters[key].length} selected` : 'is (All)'}</span>
            </div>
            <Picker compact multi options={opts} value={filters[key] || []} onChange={(v) => setFilter(key, v)} placeholder="All" />
          </div>
        ))}
      </div>
      </div>
    </aside>
  );
}
