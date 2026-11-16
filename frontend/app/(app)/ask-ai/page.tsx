'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bot, Send, User as UserIcon } from 'lucide-react';
import { ActiveFilters } from '@/components/charts';
import { EngineBadge, Markdown, PageHeader } from '@/components/ui';
import { post } from '@/lib/api';
import { FILTER_LABELS, useApp } from '@/lib/store';
import type { ChatAnswer } from '@/lib/types';

interface Msg {
  role: 'user' | 'ai';
  text: string;
  meta?: ChatAnswer;
}

const SUGGESTED = [
  'What were the main safety topics for Erleada in 2025?',
  'Summarise what MAF asked LMS for in EMEA',
  'Which stakeholders did we engage most on Carvykti?',
  'What is being discussed about PML across countries?',
  'How many interactions were related to a product launch in 2025 Q4?',
  'Give me the highlights for Immunology',
];

export default function AskAIPage() {
  const { filters, me } = useApp();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [useFilters, setUseFilters] = useState(true);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' }); // braces: newer browsers return a Promise here
  }, [msgs]);

  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    setMsgs((m) => [...m, { role: 'user', text }]);
    setInput('');
    setBusy(true);
    try {
      const a = await post<ChatAnswer>('/api/ai/chat', { message: text, filters: useFilters ? filters : {} });
      setMsgs((m) => [...m, { role: 'ai', text: a.answer, meta: a }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'ai', text: `Sorry, that failed: ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 flex flex-col h-[calc(100vh-56px)]">
      <PageHeader title="Ask AI" subtitle="Ask in plain language. Answers use only the interactions you can see; numbers come from the same calculations as the dashboard." />
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <label className="text-sm flex items-center gap-1.5">
          <input type="checkbox" checked={useFilters} onChange={(e) => setUseFilters(e.target.checked)} /> Use my dashboard filters
        </label>
        {useFilters && <ActiveFilters />}
      </div>
      <div className="card flex-1 overflow-auto p-4 space-y-4">
        {msgs.length === 0 && (
          <div className="text-center py-8">
            <Bot className="w-10 h-10 text-brand mx-auto" />
            <div className="font-semibold mt-2">Hi {me?.name.split(' ').find((w) => !w.endsWith('.'))}, what would you like to know?</div>
            <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-3xl mx-auto">
              {SUGGESTED.map((s) => (
                <button key={s} onClick={() => ask(s)} className="text-sm border border-brand/30 text-brand rounded-full px-3 py-1.5 hover:bg-white/80 transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : ''}`}>
            {m.role === 'ai' && (
              <div className="w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
            )}
            <div className={`max-w-3xl rounded-2xl px-4 py-3 animate-fade-up ${m.role === 'user' ? 'bg-gradient-to-br from-[#ff4a2e] to-brand text-white rounded-br-md shadow-[0_8px_18px_-10px_rgb(235_23_0/0.8)]' : 'glass rounded-bl-md'}`}>
              {m.role === 'user' ? <div className="text-sm">{m.text}</div> : <Markdown text={m.text} />}
              {m.meta && (
                <div className="mt-3 pt-2 border-t flex flex-wrap items-center gap-2 text-[11px] text-ink-soft">
                  <EngineBadge engine={m.meta.engine} />
                  <span>Based on: {Object.keys(m.meta.filters_used).length ? Object.entries(m.meta.filters_used).map(([k, v]) => `${FILTER_LABELS[k] || k}: ${v.join(', ')}`).join(' · ') : 'all records you can see'}</span>
                  {m.meta.sources.length > 0 && (
                    <span>
                      · Sources:{' '}
                      {m.meta.sources.map((s) => (
                        <Link key={s} href={`/records/${s}`} className="text-brand underline mr-1">
                          #{s}
                        </Link>
                      ))}
                    </span>
                  )}
                </div>
              )}
            </div>
            {m.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                <UserIcon className="w-4 h-4" />
              </div>
            )}
          </div>
        ))}
        {busy && <div className="text-sm text-ink-soft pl-11">Thinking...</div>}
        <div ref={end} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input className="input" placeholder="e.g. What did HAs ask about Rybrevant this year?" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn-primary !px-4" disabled={busy || !input.trim()}>
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
