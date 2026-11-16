'use client';

import { useMemo, useState } from 'react';
import { Sparkles, Star } from 'lucide-react';
import { ErrorBox, PageHeader, Picker, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useApp, useLoad } from '@/lib/store';
import type { Material } from '@/lib/types';

export default function MaterialsPage() {
  const { userId, reference, me } = useApp();
  const { data, loading, error } = useLoad(() => api<Material[]>('/api/materials'), [userId]);
  const [ta, setTa] = useState<string[]>([]);
  const [type, setType] = useState<string[]>([]);
  const [onlyNew, setOnlyNew] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [q, setQ] = useState('');

  const items = useMemo(
    () =>
      (data || []).filter(
        (m) =>
          (!ta.length || m.ta.some((t) => ta.includes(t))) &&
          (!type.length || type.includes(m.content_type)) &&
          (!onlyNew || m.is_new) &&
          (!onlyMine || m.relevant) &&
          (!q || `${m.title} ${m.products.join(' ')}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [data, ta, type, onlyNew, onlyMine, q],
  );
  if (!reference) return null;

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Local Medical Safety materials"
        subtitle={`Demo list standing in for the LMS Learn channel. Recommended for you based on your profile${me?.tas.length ? ` (${me.tas.join(', ')})` : ''}, newness and how often colleagues used each one.`}
      />
      <div className="card p-3 grid md:grid-cols-4 gap-3 items-center">
        <input className="input" placeholder="Search materials..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Picker compact multi options={reference.dropdowns.tas} value={ta} onChange={setTa} placeholder="Therapeutic area" />
        <Picker compact multi options={reference.dropdowns.content} value={type} onChange={setType} placeholder="Content type" />
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> New only
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> For my TAs
          </label>
        </div>
      </div>
      <ErrorBox error={error} />
      {loading && !data && <Spinner />}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {items.map((m, i) => (
          <div key={m.id} className="card p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              {m.is_new && <span className="text-[10px] font-bold bg-accent text-white rounded px-1.5 py-0.5">NEW</span>}
              {m.relevant && i < 6 && !onlyNew && (
                <span className="text-[10px] font-bold bg-brand-soft text-brand rounded px-1.5 py-0.5 inline-flex items-center gap-0.5">
                  <Star className="w-3 h-3" /> Recommended
                </span>
              )}
              <span className="text-[11px] text-gray-400 ml-auto">{m.id}</span>
            </div>
            <div className="font-semibold text-ink">{m.title}</div>
            <div className="text-xs text-ink-soft mt-1">
              {m.products.join(', ')} · {m.ta.join(', ')}
            </div>
            <div className="flex-1" />
            <div className="flex items-center justify-between text-xs text-ink-soft mt-3 pt-2 border-t">
              <span>{m.content_type}</span>
              <span>Added {m.date_added}</span>
              <span className="inline-flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> used {m.times_used}x
              </span>
            </div>
            {m.external_use && <div className="text-[11px] text-emerald-700 mt-1">Approved for external use</div>}
          </div>
        ))}
        {data && items.length === 0 && <div className="text-sm text-ink-soft">No materials match.</div>}
      </div>
    </div>
  );
}
