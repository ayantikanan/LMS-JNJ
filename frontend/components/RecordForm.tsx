'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Eye, Home, Lock, RotateCcw, Save, Sparkles, Wand2 } from 'lucide-react';
import { ApiError, post, put } from '@/lib/api';
import { useApp } from '@/lib/store';
import type { Material, Quality, RecordDoc } from '@/lib/types';
import { EngineBadge, ErrorBox, Info, Picker, QualityBadge } from './ui';

type Form = Omit<RecordDoc, 'id'> & { id?: number };

interface Assist {
  suggestions: Partial<Record<keyof Form, string | string[]>>;
  topics: string[];
  materials: Material[];
  quality: Quality;
  quality_if_applied: Quality;
  missing: string[];
  engine: string;
  tips: string[];
  notes: string;
  fallback_reason: string;
}

const EMPTY: Form = {
  title: 'PV Insights', year: '', quarter: '', region: '', cluster: '', country: '', activity_type: '', content: [], specific_icsr: '',
  stakeholder_request: '', stakeholders: [], products: [], comments: '', feedback: '', material_external: '', product_launch: '',
  materials: [], stakeholder_status: '', follow_up: '', impact_category: '', outcomes: [],
};

const LABELS: Record<string, string> = {
  year: 'Year', quarter: 'Quarter', region: 'Region', cluster: 'Cluster / Sub Region', country: 'Country/Location/Territory',
  products: 'Product/TA', stakeholders: 'Stakeholder(s)', activity_type: 'Activity Type', content: 'Content',
  material_external: 'Material for external use?', stakeholder_request: 'Stakeholder Request', product_launch: 'Related to product launch/line ext.?',
  comments: 'Comments', feedback: 'Feedback', specific_icsr: 'Specific ICSR/AE/SS/Signal', materials: 'LMS material(s) used',
  stakeholder_status: 'Stakeholder (new / established)', follow_up: 'Follow-up interaction', impact_category: 'Impact category', outcomes: 'Outcomes',
};

const FieldCtx = createContext<{ missing: string[]; help: Record<string, string>; flash: string | null }>({ missing: [], help: {}, flash: null });

/** Defined outside the form so inputs keep focus while typing. */
function Field({ k, req, children, hint, info }: { k: string; req?: boolean; children: React.ReactNode; hint?: string; info?: string }) {
  const { missing, help, flash } = useContext(FieldCtx);
  return (
    <div id={`field-${k}`} className="scroll-mt-28">
      <div className="flex items-end justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="w-3 text-brand text-lg leading-none">{req ? '*' : ''}</span>
          <span className={`label ${missing.includes(k) ? '!text-accent' : ''}`}>{LABELS[k]}</span>
          <Info text={info ?? help[k]} />
        </div>
        {hint && <span className="text-[11px] text-ink-soft text-right">{hint}</span>}
      </div>
      <div className={`rounded-xl transition-shadow duration-500 ${missing.includes(k) ? 'ring-2 ring-brand/60 animate-pop' : ''} ${flash === k ? 'ring-4 ring-emerald-400/60 shadow-[0_0_0_6px_rgb(16_185_129/0.12)]' : ''}`}>{children}</div>
    </div>
  );
}

export default function RecordForm({ initial }: { initial?: RecordDoc }) {
  const { reference, me, bumpData } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const isNew = !initial;
  const readOnly = !!initial && !initial.can_edit;

  const defaults = useMemo<Form>(() => {
    if (initial) return { ...EMPTY, ...initial };
    const ref = reference?.reference_date ? new Date(reference.reference_date) : new Date();
    const country = me?.countries?.length === 1 ? me.countries[0] : '';
    return { ...EMPTY, year: String(ref.getFullYear()), quarter: `Q${Math.floor(ref.getMonth() / 3) + 1}`, country };
  }, [initial, reference, me]);

  const [form, setForm] = useState<Form>(defaults);
  const [saved, setSaved] = useState<string>(JSON.stringify(defaults));
  const [missing, setMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(initial && params.get('saved') ? `Saved as record #${initial.id}.` : null);
  const [quality, setQuality] = useState<Quality | null>(initial?.quality || null);
  const [assist, setAssist] = useState<Assist | null>(null);
  const [assisting, setAssisting] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [logRequest, setLogRequest] = useState(true);

  useEffect(() => {
    setForm(defaults);
    setSaved(JSON.stringify(defaults));
  }, [defaults]);

  const dirty = JSON.stringify(form) !== saved;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // region & cluster follow the country
  const hierarchy = reference?.dropdowns.hierarchy || {};
  useEffect(() => {
    for (const [region, clusters] of Object.entries(hierarchy))
      for (const [cluster, countries] of Object.entries(clusters))
        if (countries.includes(form.country)) {
          if (form.region !== region || form.cluster !== cluster) setForm((f) => ({ ...f, region, cluster }));
          return;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.country, reference]);

  // live quality score
  useEffect(() => {
    const t = setTimeout(() => post<Quality>('/api/quality', form).then(setQuality).catch(() => {}), 350);
    return () => clearTimeout(t);
  }, [form]);

  if (!reference || !me) return null;
  const d = reference.dropdowns;
  const help = reference.help_text;

  const countryOptions = Object.entries(hierarchy).flatMap(([region, clusters]) =>
    Object.entries(clusters).flatMap(([cluster, countries]) =>
      countries
        .filter((c) => {
          if (me.is_admin || me.scope_level === 'Global') return true;
          if (me.scope_level === 'Regional') return me.clusters.length ? me.clusters.includes(cluster) : me.regions.includes(region);
          return me.countries.includes(c);
        })
        .map((c) => ({ value: c, group: `${region} · ${cluster}` })),
    ),
  );
  const materialOptions = reference.materials
    .filter((m) => !form.products.length || m.products.some((p) => form.products.includes(p)) || form.materials.includes(m.id))
    .map((m) => ({ value: m.id, label: m.title, hint: m.date_added }));

  const runAssist = async () => {
    setAssisting(true);
    try {
      setApplied([]);
      setAssist(await post<Assist>('/api/assist', form));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAssisting(false);
    }
  };

  const applySuggestion = (k: keyof Form, scroll = true) => {
    const v = assist?.suggestions[k];
    if (v === undefined) return;
    setForm((f) => ({
      ...f,
      [k]: Array.isArray(f[k]) ? Array.from(new Set([...(f[k] as string[]), ...(v as string[])])) : v,
    }));
    setApplied((a) => (a.includes(k as string) ? a : [...a, k as string]));
    // show the user where the value went: scroll to the field and highlight it briefly
    setFlash(k as string);
    setTimeout(() => setFlash((cur) => (cur === k ? null : cur)), 1600);
    if (scroll) document.getElementById(`field-${String(k)}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMissing([]);
    try {
      const rec = isNew ? await post<RecordDoc>('/api/records', form) : await put<RecordDoc>(`/api/records/${initial!.id}`, form);
      if (isNew && form.stakeholder_request === 'Yes' && logRequest) {
        await post('/api/requests', { title: form.comments.split(/(?<=[.?!])\s/)[0].slice(0, 150), record_id: rec.id, note: 'Logged from the data entry form.' });
      }
      bumpData();
      const next = { ...EMPTY, ...rec };
      setForm(next);
      setSaved(JSON.stringify(next));
      setOkMsg(isNew ? `Saved as record #${rec.id}.` : 'Changes saved.');
      if (isNew) router.replace(`/records/${rec.id}?saved=1`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422 && typeof e.detail === 'object') {
        const det = e.detail as { message: string; missing: string[] };
        setMissing(det.missing || []);
        setError(det.message);
      } else setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const pick = (k: keyof Form, options: Parameters<typeof Picker>[0]['options'], multi = false) => (
    <Picker
      multi={multi}
      disabled={readOnly}
      options={options}
      value={multi ? (form[k] as string[]) : form[k] ? [form[k] as string] : []}
      onChange={(v) => set(k, (multi ? v : v[0] || '') as never)}
    />
  );

  return (
    <FieldCtx.Provider value={{ missing, help, flash }}>
    <div className="p-4">
      <div className="card overflow-hidden">
        <div className="relative px-5 py-4 flex items-center gap-4 bg-gradient-to-r from-brand-soft/70 via-white/40 to-transparent">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#ff4a2e] to-brand text-white flex items-center justify-center shadow-[0_10px_20px_-10px_rgb(235_23_0/0.9)]">
            <Eye className="w-6 h-6" />
          </div>
          <div className="flex-1 font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
            PV Insights {initial ? <span className="text-sm font-normal">· record #{initial.id}</span> : <span className="text-sm font-normal">· new interaction</span>}
          </div>
          <Link href="/records" title="All records" className="p-2.5 rounded-xl bg-white/70 text-ink hover:text-brand hover:-translate-y-0.5 transition">
            <ClipboardList className="w-5 h-5" />
          </Link>
          <Link href="/" title="Home" className="p-2.5 rounded-xl bg-white/70 text-ink hover:text-brand hover:-translate-y-0.5 transition">
            <Home className="w-5 h-5" />
          </Link>
          <button title="Undo changes" className="p-2.5 rounded-xl bg-white/70 text-ink hover:text-brand hover:-translate-y-0.5 transition disabled:opacity-40" onClick={() => setForm(JSON.parse(saved))} disabled={readOnly}>
            <RotateCcw className="w-5 h-5" />
          </button>
          <button title="Save" className="p-2.5 rounded-xl bg-gradient-to-b from-[#ff3b1f] to-brand text-white shadow-[0_6px_14px_-6px_rgb(235_23_0/0.7)] hover:-translate-y-0.5 transition disabled:opacity-40" onClick={save} disabled={readOnly || saving}>
            <Save className="w-5 h-5" />
          </button>
        </div>
        <div className="text-center py-2.5 border-y border-black/5 text-sm bg-white/30">
          {readOnly ? (
            <span className="text-ink-soft inline-flex items-center gap-1">
              <Lock className="w-4 h-4" /> View only: {me.edit_rule}
            </span>
          ) : okMsg && !dirty ? (
            <span className="text-emerald-700 inline-flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> {okMsg}
            </span>
          ) : (
            <span className="text-brand font-medium inline-flex items-center gap-1.5"><span className={`w-1.5 h-1.5 rounded-full bg-brand ${dirty ? 'animate-ping' : ''}`} />Please save your entries.</span>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px]">
          <div className="p-5 space-y-6">
            <ErrorBox error={error} />
            <div className="grid md:grid-cols-2 gap-x-12 gap-y-5">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-3" />
                  <span className="label">Title</span>
                </div>
                <input className="input" value={form.title} disabled />
              </div>
              <Field k="year" req>{pick('year', d.year)}</Field>
              <Field k="quarter" req>{pick('quarter', d.quarter)}</Field>
              <Field k="country" req info="Pick the country; region and cluster are filled in for you.">{pick('country', countryOptions)}</Field>
              <Field k="region" req info="Filled automatically from the country.">
                <input className="input" value={form.region} disabled placeholder="Auto" />
              </Field>
              <Field k="cluster" req>
                <input className="input" value={form.cluster} disabled placeholder="Auto" />
              </Field>
              <Field k="products" req>{pick('products', d.products.map((p) => ({ value: p, hint: reference.product_ta[p] })), true)}</Field>
              <Field k="stakeholders" req>{pick('stakeholders', d.stakeholders.map((s) => ({ value: s.code, label: `${s.code} - ${s.name}`, hint: s.type })), true)}</Field>
              <Field k="activity_type" req>{pick('activity_type', d.activity_type)}</Field>
              <Field k="content" req>{pick('content', d.content, true)}</Field>
              <Field k="material_external" req>{pick('material_external', d.yes_no)}</Field>
              <Field k="stakeholder_request" req>{pick('stakeholder_request', d.stakeholder_request)}</Field>
              <Field k="product_launch" req>{pick('product_launch', d.yes_no)}</Field>
              <Field k="specific_icsr" hint="Please write which ICSR/AE/SS/Signal the interaction is related to">
                <input className="input" disabled={readOnly} value={form.specific_icsr} onChange={(e) => set('specific_icsr', e.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field k="materials" hint="From the Local Medical Safety materials list (demo list)">{pick('materials', materialOptions, true)}</Field>
              </div>
            </div>

            <Field k="comments" req hint="Describe the interaction: what was provided, who was involved, and why the interaction occurred.">
              <textarea className="input min-h-24" disabled={readOnly} value={form.comments} onChange={(e) => set('comments', e.target.value)} />
            </Field>
            <Field k="feedback" hint="Include here any feedback received and/or information related to potential interaction impact.">
              <textarea className="input min-h-24" disabled={readOnly} value={form.feedback} onChange={(e) => set('feedback', e.target.value)} />
            </Field>

            <div className="rounded-2xl border border-dashed border-brand/30 bg-brand-soft/25 p-4">
              <div className="text-sm font-bold text-brand mb-3">
                Value indicators <span className="font-normal text-ink-soft">(demo fields pending the final KPI list)</span>
              </div>
              <div className="grid md:grid-cols-2 gap-x-12 gap-y-5">
                <Field k="stakeholder_status">{pick('stakeholder_status', d.kpi.stakeholder_status)}</Field>
                <Field k="follow_up" info="Will there be a follow-up interaction?">{pick('follow_up', d.kpi.follow_up)}</Field>
                <Field k="impact_category">{pick('impact_category', d.kpi.impact_category)}</Field>
                <Field k="outcomes" info="What did the interaction lead to?">{pick('outcomes', d.kpi.outcomes, true)}</Field>
              </div>
            </div>
            {initial?.demo_values && (
              <p className="text-[11px] text-ink-soft">This record came from the sample export. Its value indicators and material links are demo values.</p>
            )}
            {initial && (
              <p className="text-[11px] text-ink-soft">
                Created {initial.created?.replace('T', ' ')} by {initial.created_by} · Modified {initial.modified?.replace('T', ' ')} by {initial.modified_by}
              </p>
            )}
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn-primary !px-5 !py-2" onClick={save} disabled={saving}>
                  <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
                </button>
                {isNew && form.stakeholder_request === 'Yes' && (
                  <label className="text-sm flex items-center gap-2">
                    <input type="checkbox" checked={logRequest} onChange={(e) => setLogRequest(e.target.checked)} />
                    Also log it as a Benefit-Risk request (workflow)
                  </label>
                )}
              </div>
            )}
          </div>

          <aside className="border-t xl:border-t-0 xl:border-l border-black/5 bg-white/25 p-4 space-y-4 stagger">
            <div className="card p-4">
              <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">Data quality score</div>
              {quality && (
                <>
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-bold text-brand">{quality.score}</div>
                    <QualityBadge q={quality} />
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ease-out ${quality.band === 'High' ? 'bg-emerald-500' : quality.band === 'Medium' ? 'bg-amber-500' : 'bg-brand'}`}
                      style={{ width: `${quality.score}%` }}
                    />
                  </div>
                  {quality.tips.length > 0 ? (
                    <ul className="mt-3 space-y-1 text-xs text-ink-soft list-disc pl-4">
                      {quality.tips.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs text-emerald-700">Great entry: everything is complete.</p>
                  )}
                </>
              )}
            </div>

            {!readOnly && (
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" /> AI assist
                  </div>
                  {assist && <EngineBadge engine={assist.engine} />}
                </div>
                <p className="text-xs text-ink-soft mb-2">Write the comments first, then let the assistant suggest the remaining fields.</p>
                <button className="btn-outline w-full justify-center" onClick={runAssist} disabled={assisting || !form.comments.trim()}>
                  <Wand2 className="w-4 h-4" /> {assisting ? 'Reading...' : 'Suggest from comments'}
                </button>
                {assist && (
                  <div className="mt-3 space-y-2">
                    {assist.engine === 'rules' && (
                      <p className="text-[11px] text-ink-soft bg-amber-50 border border-amber-200 rounded-lg p-2" title={assist.fallback_reason}>
                        No AI model is connected, so these are keyword-based suggestions. Add a Gemini key (GOOGLE_API_KEY) to backend/.env or run
                        Ollama to get AI suggestions.
                      </p>
                    )}
                    {assist.notes && <p className="text-xs text-ink bg-white/70 rounded-lg p-2">{assist.notes}</p>}
                    {Object.keys(assist.suggestions).length === 0 && <p className="text-xs text-ink-soft">No field suggestions from this comment.</p>}
                    {Object.entries(assist.suggestions).map(([k, v]) => (
                      <div key={k} className="flex items-start gap-2 text-xs">
                        <div className="flex-1">
                          <div className="font-semibold text-ink">{LABELS[k] || k}</div>
                          <div className="text-ink-soft">{Array.isArray(v) ? v.join(', ') : v}</div>
                        </div>
                        {applied.includes(k) ? (
                          <span className="text-emerald-600 font-semibold inline-flex items-center gap-0.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Applied
                          </span>
                        ) : (
                          <button className="text-brand font-semibold hover:underline" onClick={() => applySuggestion(k as keyof Form)}>
                            Apply
                          </button>
                        )}
                      </div>
                    ))}
                    {Object.keys(assist.suggestions).length > 1 && (
                      <button
                        className="btn-primary w-full justify-center !text-xs"
                        disabled={applied.length === Object.keys(assist.suggestions).length}
                        onClick={() => Object.keys(assist.suggestions).forEach((k) => applySuggestion(k as keyof Form, false))}
                      >
                        Apply all (score {assist.quality.score} → {assist.quality_if_applied.score})
                      </button>
                    )}
                    {assist.tips.length > 0 && (
                      <div className="text-xs">
                        <div className="font-semibold text-ink mt-2">Make the comment stronger</div>
                        <ul className="list-disc pl-4 mt-1 space-y-0.5 text-ink-soft">
                          {assist.tips.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {assist.topics.length > 0 && (
                      <div className="text-xs">
                        <div className="font-semibold text-ink mt-2">Safety topics detected</div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {assist.topics.map((t) => (
                            <span key={t} className="chip">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="card p-4">
              <div className="text-xs font-semibold text-ink-soft uppercase tracking-wide mb-2">Recommended LMS materials</div>
              {(form.products.length ? reference.materials.filter((m) => form.products.some((p) => m.products.includes(p))).slice(0, 5) : assist?.materials || []).map((m) => (
                <div key={m.id} className="flex items-start gap-2 py-1.5 border-t first:border-t-0 text-xs">
                  <div className="flex-1">
                    <div className="font-medium text-ink">{m.title}</div>
                    <div className="text-ink-soft">
                      {m.content_type} · added {m.date_added}
                    </div>
                  </div>
                  {!readOnly && !form.materials.includes(m.id) && (
                    <button className="text-brand font-semibold hover:underline" onClick={() => set('materials', [...form.materials, m.id])}>
                      Add
                    </button>
                  )}
                </div>
              ))}
              {!form.products.length && !assist?.materials.length && <p className="text-xs text-ink-soft">Pick a product to see materials.</p>}
            </div>
          </aside>
        </div>
      </div>
    </div>
    </FieldCtx.Provider>
  );
}
