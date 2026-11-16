'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, ChevronRight, Circle, Clock, PlusCircle, X } from 'lucide-react';
import { ErrorBox, PageHeader, Picker, Spinner } from '@/components/ui';
import { api, post } from '@/lib/api';
import { useApp, useLoad } from '@/lib/store';
import type { BRRequest } from '@/lib/types';

const STAGE_TONE: Record<string, string> = {
  logged: 'bg-gray-100 text-ink',
  escalated: 'bg-amber-100 text-amber-800',
  follow_up: 'bg-blue-100 text-blue-800',
  resolved: 'bg-emerald-100 text-emerald-800',
};

function daysBetween(iso: string, ref: string) {
  return Math.max(0, Math.round((new Date(ref).getTime() - new Date(iso.slice(0, 10)).getTime()) / 86400000));
}

export default function RequestsPage() {
  const { reference, userId, me } = useApp();
  const router = useRouter();
  const selectedId = useSearchParams().get('id');
  const { data, loading, error, reload } = useLoad(() => api<BRRequest[]>('/api/requests'), [userId]);
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState(0);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ title: '', product: '', country: me?.countries?.[0] || '', stakeholders: [] as string[], note: '' });
  const [formErr, setFormErr] = useState<string | null>(null);

  if (!reference) return null;
  const stages = reference.workflow.stages;
  const order = stages.map((s) => s.id);
  const sel = data?.find((q) => q.id === selectedId) || null;
  const refDate = reference.reference_date;

  const advance = async (q: BRRequest) => {
    setBusy(true);
    try {
      await post(`/api/requests/${q.id}/advance`, { note, assignee_index: q.stage === 'logged' ? assignee : undefined });
      setNote('');
      reload();
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    setFormErr(null);
    try {
      const q = await post<BRRequest>('/api/requests', draft);
      setCreating(false);
      setDraft({ ...draft, title: '', note: '' });
      reload();
      router.push(`/requests?id=${q.id}`);
    } catch (e) {
      setFormErr((e as Error).message);
    }
  };

  const countries = Object.values(reference.dropdowns.hierarchy).flatMap((c) => Object.values(c).flat());
  const contacts = sel ? reference.workflow.escalation_contacts[sel.ta] || reference.workflow.escalation_contacts['Cross-TA (General)'] : [];

  return (
    <div className="p-4 space-y-4">
      <PageHeader title="Benefit-Risk stakeholder requests" subtitle="Log the query → escalate to the core team / Risk Management Lead → follow up → confirm it was resolved.">
        <button className="btn-primary" onClick={() => setCreating(true)}>
          <PlusCircle className="w-4 h-4" /> New request
        </button>
      </PageHeader>
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
        {stages.map((s, i) => (
          <span key={s.id} className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 font-semibold ${STAGE_TONE[s.id]}`}>
              {i + 1}. {s.label}
            </span>
            {s.sla_days > 0 && <span className="text-gray-400">target {s.sla_days}d</span>}
            {i < stages.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300" />}
          </span>
        ))}
        <span className="text-gray-400">· contacts and targets are demo values</span>
      </div>
      <ErrorBox error={error} />
      {loading && !data && <Spinner />}

      {creating && (
        <div className="card p-4 space-y-3 border-l-4 border-l-brand">
          <div className="flex justify-between items-center">
            <div className="font-semibold text-brand">Log a new Benefit-Risk request</div>
            <button onClick={() => setCreating(false)} aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>
          <ErrorBox error={formErr} />
          <input className="input" placeholder="What is the stakeholder asking?" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <div className="grid md:grid-cols-3 gap-3">
            <Picker options={reference.dropdowns.products.map((p) => ({ value: p, hint: reference.product_ta[p] }))} value={draft.product ? [draft.product] : []} onChange={(v) => setDraft({ ...draft, product: v[0] || '' })} placeholder="Product" />
            <Picker options={countries} value={draft.country ? [draft.country] : []} onChange={(v) => setDraft({ ...draft, country: v[0] || '' })} placeholder="Country" />
            <Picker multi options={reference.dropdowns.stakeholders.map((s) => ({ value: s.code, hint: s.type }))} value={draft.stakeholders} onChange={(v) => setDraft({ ...draft, stakeholders: v })} placeholder="Stakeholder(s)" />
          </div>
          <textarea className="input" placeholder="Notes (optional)" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          <button className="btn-primary" onClick={create} disabled={!draft.title.trim() || !draft.country}>
            Log request
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <div className="grid sm:grid-cols-2 2xl:grid-cols-4 gap-3">
          {stages.map((s) => {
            const items = (data || []).filter((q) => q.stage === s.id);
            return (
              <div key={s.id} className="glass rounded-2xl p-2.5">
                <div className="flex items-center justify-between px-1 pb-2">
                  <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${STAGE_TONE[s.id]}`}>{s.label}</span>
                  <span className="text-xs text-ink-soft">{items.length}</span>
                </div>
                <div className="space-y-2 stagger">
                  {items.map((q) => {
                    const last = q.events[q.events.length - 1];
                    const idx = order.indexOf(q.stage);
                    const nextSla = idx < order.length - 1 ? stages[idx + 1].sla_days : null;
                    const waited = daysBetween(last.at, refDate);
                    const late = nextSla !== null && waited > nextSla;
                    return (
                      <button
                        key={q.id}
                        onClick={() => router.push(`/requests?id=${q.id}`)}
                        className={`w-full text-left bg-white/85 rounded-xl p-3 shadow-sm border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${q.id === selectedId ? 'border-brand ring-4 ring-brand/15' : 'border-transparent'} hover:border-brand/30`}
                      >
                        <div className="flex items-center justify-between text-[11px] text-ink-soft">
                          <span className="font-bold text-brand">{q.id}</span>
                          {late && (
                            <span className="text-accent font-semibold inline-flex items-center gap-0.5">
                              <Clock className="w-3 h-3" /> {waited}d waiting
                            </span>
                          )}
                        </div>
                        <div className="text-sm mt-1 line-clamp-3">{q.title}</div>
                        <div className="text-[11px] text-ink-soft mt-1.5">
                          {q.product || q.ta} · {q.country}
                        </div>
                        <div className="text-[11px] text-ink-soft">→ {q.assignee.name}</div>
                      </button>
                    );
                  })}
                  {items.length === 0 && <div className="text-xs text-gray-400 px-1 py-3">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>

        <div className="card p-5 h-fit xl:sticky xl:top-20 animate-fade-up" key={selectedId || 'none'}>
          {!sel && <div className="text-sm text-ink-soft">Select a request to see its history and move it forward.</div>}
          {sel && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-brand">{sel.id}</span>
                  <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${STAGE_TONE[sel.stage]}`}>{stages.find((s) => s.id === sel.stage)?.label}</span>
                </div>
                <div className="text-sm font-semibold mt-1">{sel.title}</div>
                <div className="text-xs text-ink-soft mt-1">
                  {sel.product} ({sel.ta}) · {sel.country} · {sel.stakeholders.join(', ')}
                </div>
                {sel.record_id && (
                  <Link href={`/records/${sel.record_id}`} className="text-xs text-brand underline">
                    Linked interaction #{sel.record_id}
                  </Link>
                )}
                <div className="text-xs mt-2">
                  Assigned to <b>{sel.assignee.name}</b>, {sel.assignee.role}
                </div>
              </div>
              <ol className="relative border-l-2 border-brand/20 ml-2 space-y-3">
                {stages.map((s) => {
                  const ev = sel.events.find((e) => e.stage === s.id);
                  return (
                    <li key={s.id} className="ml-4">
                      <span className="absolute -left-[9px] bg-white">
                        {ev ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4 text-gray-300" />}
                      </span>
                      <div className={`text-sm font-semibold ${ev ? 'text-ink' : 'text-gray-400'}`}>{s.label}</div>
                      {ev && (
                        <div className="text-xs text-ink-soft">
                          {ev.at.replace('T', ' ').slice(0, 16)} · {ev.by}
                          <div className="text-ink">{ev.note}</div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {sel.stage !== 'resolved' ? (
                <div className="space-y-2 border-t pt-3">
                  <div className="text-xs font-semibold text-ink">
                    Next step: {stages[order.indexOf(sel.stage) + 1].label}
                  </div>
                  {sel.stage === 'logged' && (
                    <select className="input" value={assignee} onChange={(e) => setAssignee(Number(e.target.value))}>
                      {contacts.map((c, i) => (
                        <option key={c.name} value={i}>
                          {c.name}, {c.role}
                        </option>
                      ))}
                    </select>
                  )}
                  <textarea className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
                  <button className="btn-primary w-full justify-center" disabled={busy} onClick={() => advance(sel)}>
                    {sel.stage === 'follow_up' ? 'Confirm resolved with stakeholder' : `Move to: ${stages[order.indexOf(sel.stage) + 1].label}`}
                  </button>
                </div>
              ) : (
                <div className="text-sm text-emerald-700 flex items-center gap-1 border-t pt-3">
                  <CheckCircle2 className="w-4 h-4" /> Resolved and confirmed.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
