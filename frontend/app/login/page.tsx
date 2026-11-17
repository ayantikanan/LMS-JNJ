'use client';

import { useRouter } from 'next/navigation';
import { ArrowUpRight, Eye, Globe2, MapPin, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { useApp, useLoad } from '@/lib/store';
import type { User } from '@/lib/types';
import { ErrorBox, Skeleton } from '@/components/ui';

const ICON: Record<string, typeof Globe2> = { Local: MapPin, Regional: Users, Global: Globe2 };

// soft gradient banners for the profile cards (J&J red, warm)
const BANNERS = [
  'from-[#ff8a7a] via-[#fce6e3] to-[#eb1700]',
  'from-[#f1efed] via-[#ffd9d2] to-[#ff7a66]',
  'from-[#a39992] via-[#f1efed] to-[#eb1700]',
];

// Profiles not offered on the login page (the users still exist in the backend).
const HIDDEN_PROFILES = new Set(['u_emea_head', 'u_apac_sea']);

export default function LoginPage() {
  const { login } = useApp();
  const router = useRouter();
  const { data, loading, error } = useLoad(() => api<User[]>('/api/users'), []);

  const pick = (id: string) => {
    login(id);
    router.push('/');
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-6 py-14">
      <div className="app-backdrop">
        <i />
      </div>
      <div className="w-full max-w-5xl">
        <div className="flex flex-col items-center text-center animate-fade-up">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#ff4a2e] to-brand text-white flex items-center justify-center shadow-[0_18px_36px_-14px_rgb(235_23_0/0.8)]">
            <Eye className="w-8 h-8" />
          </div>
          <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Local Medical Safety</div>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl md:text-5xl font-bold tracking-tight">
            LMS Benefit-Risk Interaction Dashboard
          </h1>
          <p className="mt-3 text-ink-soft max-w-2xl">
            One shared source of truth for every benefit-risk interaction. Pick a demo profile: each one sees different data, defaults and alerts.
          </p>
        </div>

        <div className="mt-10">
          <div className="text-sm font-medium text-ink mb-3 px-1">Choose a profile</div>
          <ErrorBox error={error} />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
            {loading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
            {data?.filter((u) => !HIDDEN_PROFILES.has(u.id)).map((u, i) => {
              const Icon = u.is_admin ? ShieldCheck : ICON[u.scope_level] || Users;
              const scope = u.countries.length ? u.countries.join(', ') : u.clusters.length ? u.clusters.join(', ') : u.regions.length ? u.regions.join(', ') : 'All regions';
              return (
                <button
                  key={u.id}
                  onClick={() => pick(u.id)}
                  className="group text-left glass-strong rounded-3xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_28px_50px_-20px_rgb(60_30_20/0.4)] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30"
                >
                  <div className={`relative h-28 bg-gradient-to-br ${BANNERS[i % BANNERS.length]} flex items-center justify-center`}>
                    <div className="absolute inset-0 bg-white/10 backdrop-blur-[2px]" />
                    <div className="relative w-16 h-16 rounded-2xl bg-white/45 backdrop-blur-md border border-white/70 flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-110">
                      <Icon className="w-7 h-7 text-white drop-shadow" />
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="font-semibold text-ink">{u.name}</div>
                    <div className="text-xs text-ink-soft mt-0.5">{u.title}</div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      <span className="chip !bg-black/5 !text-ink">{u.scope_level}</span>
                      <span className="chip !bg-black/5 !text-ink">{scope}</span>
                      {u.tas.map((t) => (
                        <span key={t} className="chip">{t}</span>
                      ))}
                    </div>
                    <span className="mt-4 inline-flex items-center gap-1 rounded-full border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-medium transition group-hover:border-brand/40 group-hover:text-brand">
                      Sign in as {u.name.split(' ').find((w) => !w.endsWith('.'))} <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-ink-soft text-xs mt-8 text-center">
            Demo sign-in only. Profiles, TA mapping, materials list, KPI values and escalation contacts are demo data pending LMS input.
          </p>
        </div>
      </div>
    </div>
  );
}
