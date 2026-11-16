'use client';

import { useState } from 'react';
import { FileSpreadsheet, FileText, Presentation, Save, Trash2 } from 'lucide-react';
import { ActiveFilters } from '@/components/charts';
import { ErrorBox, PageHeader, Spinner } from '@/components/ui';
import { api, del, download, post, qs } from '@/lib/api';
import { FILTER_LABELS, useApp, useLoad } from '@/lib/store';
import type { Filters, Report } from '@/lib/types';

const SECTIONS: [string, string][] = [
  ['kpis', 'Key indicators'],
  ['trend', 'Trend & activity type'],
  ['stakeholders', 'Stakeholder split'],
  ['content', 'Contents per activity type'],
  ['hot_topics', 'Safety hot topics'],
  ['ai_summary', 'AI summary'],
  ['records', 'Recent interactions'],
];

const describe = (f: Filters) =>
  Object.entries(f)
    .filter(([, v]) => v?.length)
    .map(([k, v]) => `${FILTER_LABELS[k] || k}: ${v.join(', ')}`)
    .join(' · ') || 'Everything in your access scope';

function Exports({ base, name }: { base: string; name: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = async (fmt: string) => {
    setBusy(fmt);
    setErr(null);
    try {
      const sep = base.includes('?') ? '&' : '?';
      await download(`${base}${sep}format=${fmt}`, `${name}.${fmt}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button className="btn-outline" onClick={() => go('pptx')} disabled={!!busy}>
        <Presentation className="w-4 h-4" /> {busy === 'pptx' ? 'Building...' : 'PowerPoint'}
      </button>
      <button className="btn-outline" onClick={() => go('pdf')} disabled={!!busy}>
        <FileText className="w-4 h-4" /> {busy === 'pdf' ? 'Building...' : 'PDF'}
      </button>
      <button className="btn-outline" onClick={() => go('xlsx')} disabled={!!busy}>
        <FileSpreadsheet className="w-4 h-4" /> {busy === 'xlsx' ? 'Building...' : 'Excel'}
      </button>
      {err && <span className="text-xs text-accent">{err}</span>}
    </div>
  );
}

export default function ReportsPage() {
  const { filters, userId, me } = useApp();
  const reports = useLoad(() => api<Report[]>('/api/reports'), [userId]);
  const [name, setName] = useState('');
  const [audience, setAudience] = useState('');
  const [sections, setSections] = useState<string[]>(SECTIONS.map((s) => s[0]));

  const save = async () => {
    if (!name.trim()) return;
    await post('/api/reports', { name: name.trim(), audience, filters, sections });
    setName('');
    setAudience('');
    reports.reload();
  };

  return (
    <div className="p-4 space-y-5">
      <PageHeader title="Reports & export" subtitle="Personal, role-relevant reports. Every report only contains data you are allowed to see." />

      <div className="card p-4 space-y-3">
        <div className="font-semibold text-brand">Export the current view</div>
        <ActiveFilters />
        <Exports base={`/api/export${qs(filters, { title: 'PV Insights view' })}`} name="pv_insights_view" />
      </div>

      <div className="card p-4 space-y-3">
        <div className="font-semibold text-brand">Save a personalised report from the current filters</div>
        <div className="text-xs text-ink-soft">{describe(filters)}</div>
        <div className="grid md:grid-cols-2 gap-3">
          <input className="input" placeholder="Report name, e.g. EMEA interactions for the Safety Head" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" placeholder="Audience (optional)" value={audience} onChange={(e) => setAudience(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          {SECTIONS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="checkbox" checked={sections.includes(k)} onChange={(e) => setSections(e.target.checked ? [...sections, k] : sections.filter((s) => s !== k))} />
              {label}
            </label>
          ))}
        </div>
        <button className="btn-primary" onClick={save} disabled={!name.trim()}>
          <Save className="w-4 h-4" /> Save report
        </button>
      </div>

      <div>
        <h2 className="text-sm font-bold text-brand uppercase tracking-wide mb-2">My reports</h2>
        <ErrorBox error={reports.error} />
        {reports.loading && !reports.data && <Spinner />}
        <div className="grid lg:grid-cols-2 gap-3">
          {reports.data?.map((r) => (
            <div key={r.id} className="card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-ink-soft">
                    {r.audience && `${r.audience} · `}
                    {describe(r.filters)}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1">Sections: {r.sections.map((s) => SECTIONS.find((x) => x[0] === s)?.[1] || s).join(', ')}</div>
                </div>
                {(r.owner === me?.id || me?.is_admin) && (
                  <button
                    className="text-gray-400 hover:text-accent"
                    aria-label="Delete report"
                    onClick={async () => {
                      await del(`/api/reports/${r.id}`);
                      reports.reload();
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <Exports base={`/api/reports/${r.id}/export`} name={r.name} />
            </div>
          ))}
          {reports.data?.length === 0 && <div className="text-sm text-ink-soft">No reports yet. Set your filters and save one above.</div>}
        </div>
      </div>
    </div>
  );
}
