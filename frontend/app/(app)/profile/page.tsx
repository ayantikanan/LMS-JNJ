'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Save } from 'lucide-react';
import { ErrorBox, PageHeader, Picker } from '@/components/ui';
import { put } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { User } from '@/lib/types';

export default function ProfilePage() {
  const { me, reference, refreshMe, setFilters } = useApp();
  const [p, setP] = useState<User | null>(me);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setP(me);
  }, [me]);
  if (!p || !reference) return null;
  const h = reference.dropdowns.hierarchy;
  const clusters = Object.entries(h)
    .filter(([r]) => !p.regions.length || p.regions.includes(r))
    .flatMap(([, c]) => Object.keys(c));
  const countries = Object.entries(h).flatMap(([r, c]) => Object.entries(c).flatMap(([cl, cs]) => cs.map((x) => ({ value: x, group: `${r} · ${cl}` }))));

  const save = async () => {
    setErr(null);
    try {
      const updated = await put<User>('/api/me', {
        title: p.title, role: p.role, scope_level: p.scope_level, regions: p.regions, clusters: p.clusters, countries: p.countries, tas: p.tas, products: p.products,
      });
      await refreshMe();
      setFilters(updated.default_filters || {});
      setMsg('Profile saved. Your dashboards now open with your default view.');
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const row = (label: string, help: string, node: React.ReactNode) => (
    <div className="grid md:grid-cols-[220px_1fr] gap-2 md:gap-6 py-4 border-b last:border-b-0">
      <div>
        <div className="label">{label}</div>
        <div className="text-xs text-ink-soft mt-0.5">{help}</div>
      </div>
      <div>{node}</div>
    </div>
  );

  return (
    <div className="p-4 max-w-4xl">
      <PageHeader title="My profile" subtitle="Your therapeutic areas, products, role and scope decide what you see by default, your alerts and your recommended materials." />
      <ErrorBox error={err} />
      {msg && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm p-3 mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {msg}
        </div>
      )}
      <div className="card px-5">
        {row('Name', 'Demo profile', <div className="text-sm font-semibold py-2">{p.name}</div>)}
        {row('Title', '', <input className="input" value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} />)}
        {row('Role', 'e.g. LMS Local, Regional Head, Global RML', <input className="input" value={p.role} onChange={(e) => setP({ ...p, role: e.target.value })} />)}
        {row('Therapeutic areas', 'Your dashboards open filtered to these TAs.', <Picker multi options={reference.dropdowns.tas} value={p.tas} onChange={(v) => setP({ ...p, tas: v })} placeholder="All TAs" />)}
        {row('Products', 'Optional: narrow your default view further.', <Picker multi options={reference.dropdowns.products.map((x) => ({ value: x, hint: reference.product_ta[x] }))} value={p.products} onChange={(v) => setP({ ...p, products: v })} placeholder="All products" />)}
        {row(
          'Scope',
          'Local = your countries · Regional = your regions / clusters · Global = everything. In production this would be set by an admin.',
          <div className="flex gap-2">
            {(['Local', 'Regional', 'Global'] as const).map((s) => (
              <button key={s} className={p.scope_level === s ? 'btn-primary' : 'btn-outline'} onClick={() => setP({ ...p, scope_level: s })}>
                {s}
              </button>
            ))}
          </div>,
        )}
        {p.scope_level === 'Regional' &&
          row('Regions', '', <Picker multi options={Object.keys(h)} value={p.regions} onChange={(v) => setP({ ...p, regions: v })} />)}
        {p.scope_level === 'Regional' &&
          row('Clusters', 'Optional: limit to specific clusters.', <Picker multi options={clusters} value={p.clusters} onChange={(v) => setP({ ...p, clusters: v })} placeholder="All clusters in the region" />)}
        {p.scope_level === 'Local' && row('Countries', '', <Picker multi options={countries} value={p.countries} onChange={(v) => setP({ ...p, countries: v })} />)}
        {row('Access rule', 'Demo access rules pending LMS confirmation', <div className="text-sm text-ink py-2">{me?.access_rule}<br />{me?.edit_rule}</div>)}
      </div>
      <button className="btn-primary mt-4 !px-5 !py-2" onClick={save}>
        <Save className="w-4 h-4" /> Save profile
      </button>
    </div>
  );
}
