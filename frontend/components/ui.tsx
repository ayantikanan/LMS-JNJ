'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Info as InfoIcon, Loader2, X } from 'lucide-react';
import type { Quality } from '@/lib/types';

export function Info({ text }: { text?: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="More information" onClick={() => setOpen((o) => !o)} className="text-warm-400 hover:text-brand transition">
        <InfoIcon className="w-4 h-4" />
      </button>
      {open && (
        <span className="absolute z-50 left-6 top-0 w-72 rounded-xl bg-ink/90 backdrop-blur text-white text-xs p-3 shadow-xl leading-relaxed font-normal animate-pop">
          {text}
        </span>
      )}
    </span>
  );
}

interface Opt {
  value: string;
  label?: string;
  group?: string;
  hint?: string;
}

const toOpts = (options: (string | Opt)[]): Opt[] => options.map((o) => (typeof o === 'string' ? { value: o } : o));

/** "Find items" dropdown like the current Power Apps form; multi or single select, searchable. */
export function Picker({
  options,
  value,
  onChange,
  multi = false,
  placeholder = 'Find items',
  disabled = false,
  compact = false,
}: {
  options: (string | Opt)[];
  value: string[];
  onChange: (v: string[]) => void;
  multi?: boolean;
  placeholder?: string;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const opts = useMemo(() => toOpts(options), [options]);
  const shown = opts.filter((o) => (o.label || o.value).toLowerCase().includes(q.toLowerCase()) || (o.group || '').toLowerCase().includes(q.toLowerCase()));

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (v: string) => {
    if (multi) onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
    else {
      onChange(value[0] === v ? [] : [v]);
      setOpen(false);
    }
  };
  const label = (v: string) => opts.find((o) => o.value === v)?.label || v;
  let lastGroup = '';

  return (
    <div ref={box} className={`relative ${open ? 'z-50' : ''}`}>
      <div
        className={`group flex items-stretch rounded-xl border bg-white/75 transition-all duration-200 ${open ? 'border-brand/50 ring-4 ring-brand/10 bg-white' : 'border-black/10 hover:border-black/20 hover:bg-white'} ${disabled ? '!bg-warm-100/70 opacity-80 cursor-not-allowed' : 'cursor-pointer'}`}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <div className={`flex-1 flex flex-wrap gap-1 items-center px-2 ${compact ? 'py-1 min-h-8' : 'py-1.5 min-h-10'}`}>
          {value.length === 0 && <span className="text-warm-400 text-sm">{placeholder}</span>}
          {value.map((v) =>
            multi ? (
              <span key={v} className="chip">
                {label(v)}
                {!disabled && (
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      pick(v);
                    }}
                  />
                )}
              </span>
            ) : (
              <span key={v} className="text-sm">{label(v)}</span>
            ),
          )}
        </div>
        <button type="button" disabled={disabled} className="px-3 flex items-center text-ink-soft group-hover:text-brand transition" aria-label="Open list">
          <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180 text-brand' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 mt-1.5 w-full bg-white rounded-xl border border-black/10 shadow-[0_20px_45px_-15px_rgb(40_20_10/0.35)] max-h-72 overflow-auto animate-pop origin-top">
          <input autoFocus className="sticky top-0 w-full px-3.5 py-2.5 text-sm border-b border-black/5 outline-none bg-white" placeholder="Search..." value={q} onChange={(e) => setQ(e.target.value)} />
          {shown.length === 0 && <div className="px-3 py-2 text-sm text-ink-soft">No matches</div>}
          {shown.map((o) => {
            const header = o.group && o.group !== lastGroup ? ((lastGroup = o.group), o.group) : null;
            return (
              <div key={o.value}>
                {header && <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-gray-400">{header}</div>}
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className="w-full text-left px-3.5 py-2 text-sm hover:bg-brand-soft/60 flex items-center gap-2 transition-colors"
                >
                  <span className={`w-4 h-4 border rounded-md flex items-center justify-center transition-colors ${value.includes(o.value) ? 'bg-brand border-brand text-white' : 'border-warm-400 bg-white'}`}>
                    {value.includes(o.value) && <Check className="w-3 h-3" />}
                  </span>
                  <span className="flex-1">{o.label || o.value}</span>
                  {o.hint && <span className="text-[11px] text-gray-400">{o.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function QualityBadge({ q, size = 'sm' }: { q?: Quality; size?: 'sm' | 'lg' }) {
  if (!q) return null;
  const tone = q.band === 'High' ? 'bg-emerald-100 text-emerald-800' : q.band === 'Medium' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700';
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ${tone} ${size === 'lg' ? 'text-base px-3 py-1' : 'text-xs px-2 py-0.5'}`} title={q.tips.join('\n')}>
      {q.score} · {q.band}
    </span>
  );
}

export function EngineBadge({ engine }: { engine: string }) {
  const map: Record<string, [string, string]> = {
    gemini: ['Gemini', 'bg-blue-100 text-blue-800'],
    ollama: ['Local model', 'bg-teal-100 text-teal-800'],
    rules: ['Rules-based', 'bg-gray-200 text-ink'],
  };
  const [label, tone] = map[engine] || [engine, 'bg-gray-200 text-ink'];
  return <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${tone}`}>{label}</span>;
}

export function Spinner({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-ink-soft p-6">
      <Loader2 className="w-4 h-4 animate-spin text-brand" /> {text}
    </div>
  );
}

export function ErrorBox({ error }: { error: string | null }) {
  if (!error) return null;
  return <div className="rounded-xl bg-brand-soft/80 border border-brand/20 text-brand-dark text-sm p-3 animate-fade-in">{error}</div>;
}

/** Minimal markdown: **bold**, "- " bullets, blank-line paragraphs and [#123] record links. */
export function Markdown({ text }: { text: string }) {
  const inline = (s: string, key: number) => {
    const parts = s.split(/(\*\*[^*]+\*\*|\[#\d+\])/g);
    return (
      <span key={key}>
        {parts.map((p, i) => {
          if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
          const m = /^\[#(\d+)\]$/.exec(p);
          if (m)
            return (
              <Link key={i} href={`/records/${m[1]}`} className="text-brand underline font-medium">
                #{m[1]}
              </Link>
            );
          return p;
        })}
      </span>
    );
  };
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={blocks.length} className="list-disc pl-5 space-y-1 my-1">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b, i)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  text.split('\n').forEach((line) => {
    const t = line.trim();
    if (/^[-*•]\s+/.test(t)) bullets.push(t.replace(/^[-*•]\s+/, ''));
    else {
      flush();
      if (t) blocks.push(<p key={blocks.length} className="my-1">{inline(t.replace(/^#+\s*/, ''), 0)}</p>);
    }
  });
  flush();
  return <div className="text-sm leading-relaxed">{blocks}</div>;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-ink">
          {title}
          <span className="text-brand">.</span>
        </h1>
        {subtitle && <p className="text-sm text-ink-soft mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-72" />
        ))}
      </div>
    </div>
  );
}
