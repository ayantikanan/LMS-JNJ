'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  BarChart3, Bell, BookOpen, ClipboardList, Eye, FileBarChart, Flame, GitPullRequestArrow, Home, LogOut,
  Menu, MessageSquareText, PlusCircle, UserCog, Users, X,
} from 'lucide-react';
import { api, post } from '@/lib/api';
import { useApp, useLoad } from '@/lib/store';
import type { Notification } from '@/lib/types';
import { ErrorBox, Spinner } from './ui';

const NAV = [
  { href: '/', label: 'PV Insights', Icon: Eye },
  { href: '/statistics', label: 'Statistics', Icon: BarChart3 },
  { href: '/hot-topics', label: 'Safety hot topics', Icon: Flame },
  { href: '/records', label: 'Details (records)', Icon: ClipboardList },
  { href: '/records/new', label: 'Add interaction', Icon: PlusCircle },
  { href: '/stakeholders', label: 'Stakeholders', Icon: Users },
  { href: '/requests', label: 'B/R requests', Icon: GitPullRequestArrow },
  { href: '/materials', label: 'LMS materials', Icon: BookOpen },
  { href: '/reports', label: 'Reports & export', Icon: FileBarChart },
  { href: '/ask-ai', label: 'Ask AI', Icon: MessageSquareText },
  { href: '/profile', label: 'My profile', Icon: UserCog },
];

const SEVERITY: Record<string, string> = {
  high: 'bg-brand',
  medium: 'bg-amber-500',
  info: 'bg-navy',
};

function NotificationList({
  items,
  onDismiss,
  onNavigate,
  grid = false,
}: {
  items: Notification[];
  onDismiss: (id: string) => void;
  onNavigate: () => void;
  grid?: boolean;
}) {
  if (!items.length) return <div className="p-4 text-sm text-ink-soft">You're all caught up.</div>;
  return (
    <div className={grid ? 'p-2 grid gap-2 lg:grid-cols-2' : 'p-2 space-y-1.5'}>
      {items.map((n) => (
        <div key={n.id} className="relative pl-5 pr-4 py-3 rounded-xl bg-white/70 hover:bg-white transition">
          <span className={`absolute left-2 top-3.5 bottom-3.5 w-1 rounded-full ${SEVERITY[n.severity]}`} />
          <div className="text-sm font-semibold text-ink">{n.title}</div>
          <div className="text-xs text-ink-soft mt-0.5">{n.body}</div>
          <div className="flex gap-3 mt-2">
            <Link href={n.action.href} onClick={onNavigate} className="text-xs font-semibold text-brand hover:underline underline-offset-2">
              {n.action.label}
            </Link>
            <button onClick={() => onDismiss(n.id)} className="text-xs text-ink-soft hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { me, reference, ready, error, userId, logout } = useApp();
  const router = useRouter();
  const path = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [popup, setPopup] = useState(false);
  const notes = useLoad(() => (userId ? api<Notification[]>('/api/notifications') : Promise.resolve([])), [userId, path]);
  const active = (notes.data || []).filter((n) => !n.dismissed);

  useEffect(() => {
    if (ready && !userId) router.replace('/login');
  }, [ready, userId, router]);

  // pop-up alerts once per session, right after login
  useEffect(() => {
    if (!notes.data || !active.length) return;
    try {
      if (sessionStorage.getItem('bridge:alerts-shown')) return;
      sessionStorage.setItem('bridge:alerts-shown', '1');
    } catch {}
    setPopup(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.data]);

  const dismiss = async (id: string) => {
    await post(`/api/notifications/${encodeURIComponent(id)}/dismiss`, {});
    notes.reload();
  };

  if (!ready || (userId && !me && !error))
    return (
      <>
        <div className="app-backdrop"><i /></div>
        <Spinner text="Loading..." />
      </>
    );
  if (!userId) return null;
  const initials = me?.name.split(' ').filter((w) => /^[A-Z]/.test(w) && !w.endsWith('.')).map((w) => w[0]).slice(0, 2).join('');

  return (
    <div className="min-h-screen">
      <div className="app-backdrop"><i /></div>
      <header className="sticky top-0 z-40 h-16 px-3 md:px-5 flex items-center gap-3 bg-white/55 backdrop-blur-xl border-b border-white/70 shadow-[0_1px_0_rgb(0_0_0/0.04)]">
        <button className="lg:hidden p-2 rounded-full hover:bg-black/5" onClick={() => setNavOpen((o) => !o)} aria-label="Menu">
          {navOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#ff4a2e] to-brand text-white flex items-center justify-center shadow-[0_6px_14px_-6px_rgb(235_23_0/0.7)] transition-transform group-hover:scale-105">
            <Eye className="w-4.5 h-4.5" />
          </span>
          <span className="leading-tight">
            <span className="block font-[family-name:var(--font-display)] font-bold text-[15px] md:text-base tracking-tight">LMS Benefit-Risk Interaction Dashboard</span>
            <span className="block text-[11px] text-ink-soft">Local Medical Safety</span>
          </span>
        </Link>
        <div className="flex-1" />
        {reference && (
          <div className="hidden md:block text-right text-[11px] leading-tight text-ink-soft">
            <div>Data refreshed {reference.data_refreshed.replace('T', ' ').slice(0, 16)}</div>
            <div title="Alerts are calculated as of this date because the sample data ends in Jan 2026">Demo date {reference.reference_date}</div>
          </div>
        )}
        <div className="relative">
          <button onClick={() => setBellOpen((o) => !o)} className="relative p-2.5 rounded-full hover:bg-black/5 transition" aria-label="Notifications">
            <Bell className="w-5 h-5" />
            {active.length > 0 && (
              <span className="absolute top-1 right-1 bg-brand text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center ring-2 ring-white">{active.length}</span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 mt-2 w-96 max-h-[70vh] overflow-auto glass-strong rounded-2xl animate-pop origin-top-right">
              <div className="px-4 py-3 border-b border-black/5 font-semibold text-sm">Notifications</div>
              <NotificationList items={active} onDismiss={dismiss} onNavigate={() => setBellOpen(false)} />
            </div>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2.5 pl-3 ml-1 border-l border-black/10">
          <div className="w-9 h-9 rounded-full bg-white/80 border border-black/10 text-brand flex items-center justify-center text-xs font-bold">{initials}</div>
          <div className="text-xs leading-tight">
            <div className="font-semibold">{me?.name}</div>
            <div className="text-ink-soft">{me?.title}</div>
          </div>
        </div>
        <button onClick={logout} title="Switch user" className="p-2.5 rounded-full hover:bg-black/5 transition">
          <LogOut className="w-4 h-4" />
        </button>
      </header>

      <div className="flex">
        <nav className={`${navOpen ? 'block animate-fade-in' : 'hidden'} lg:block fixed lg:sticky top-16 z-30 w-60 h-[calc(100vh-64px)] p-3 shrink-0`}>
          <div className="glass rounded-2xl h-full flex flex-col overflow-y-auto">
            <div className="p-2 space-y-0.5">
              {NAV.map(({ href, label, Icon }) => {
                const on = href === '/' ? path === '/' : href === '/records' ? path === '/records' || /^\/records\/\d+/.test(path) : path.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setNavOpen(false)}
                    className={`relative flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-200 ${
                      on ? 'bg-gradient-to-r from-brand to-[#ff4a2e] text-white font-semibold shadow-[0_6px_14px_-8px_rgb(235_23_0/0.8)]' : 'text-ink hover:bg-white/80 hover:translate-x-0.5'
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {label}
                  </Link>
                );
              })}
            </div>
            <div className="mt-auto m-2 p-3 rounded-xl bg-white/60 text-[11px] text-ink-soft leading-relaxed">
              <Home className="w-3 h-3 inline mr-1" />
              {me?.scope_level} access · {me?.role}
              <br />
              TA mapping, materials, KPIs and contacts are demo lists pending LMS input.
            </div>
          </div>
        </nav>
        <main key={path} className="flex-1 min-w-0 animate-fade-up">
          {error && (
            <div className="p-4">
              <ErrorBox error={error} />
            </div>
          )}
          {children}
        </main>
      </div>

      {popup && (
        <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in" onClick={() => setPopup(false)}>
          <div className="glass-strong rounded-3xl w-full max-w-5xl overflow-hidden animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-brand-soft via-white/40 to-transparent">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#ff4a2e] to-brand text-white flex items-center justify-center shadow-[0_8px_18px_-8px_rgb(235_23_0/0.8)] mb-3">
                <Bell className="w-5 h-5" />
              </div>
              <div className="font-[family-name:var(--font-display)] text-xl font-bold">Welcome back, {me?.is_admin ? me?.name : me?.name.split(' ').find((w) => !w.endsWith('.'))}</div>
              <div className="text-sm text-ink-soft">{active.length} things need your attention</div>
              <button onClick={() => setPopup(false)} aria-label="Close" className="absolute top-4 right-4 p-2 rounded-full hover:bg-black/5">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto px-3 stagger">
              <NotificationList items={active} onDismiss={dismiss} onNavigate={() => setPopup(false)} grid />
            </div>
            <div className="px-6 py-4 flex justify-end">
              <button className="btn-primary" onClick={() => setPopup(false)}>
                Go to dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
