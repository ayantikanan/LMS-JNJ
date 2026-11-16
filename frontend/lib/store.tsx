'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setApiUser } from './api';
import type { Filters, Reference, User } from './types';

export const FILTER_LABELS: Record<string, string> = {
  products: 'Product/TA',
  ta: 'TA',
  title: 'Title',
  activity_level: 'Activity Level',
  stakeholder_request: 'Stakeholder Request',
  material_external: 'Material for external use',
  product_launch: 'Product launch',
  region: 'Region',
  cluster: 'Cluster',
  country: 'Country',
  year: 'Year',
  quarter: 'Quarter',
  activity_type: 'Activity Type',
  content: 'Content',
  stakeholders: 'Stakeholder',
  stakeholder_type: 'Stakeholder type',
  topic: 'Hot topic',
  impact_category: 'Impact',
  stakeholder_status: 'Stakeholder status',
  follow_up: 'Follow-up',
  quality_band: 'Data quality',
  q: 'Search',
};

interface Ctx {
  userId: string | null;
  me: User | null;
  reference: Reference | null;
  filters: Filters;
  ready: boolean;
  error: string | null;
  login: (id: string) => void;
  logout: () => void;
  refreshMe: () => Promise<void>;
  setFilters: (f: Filters) => void;
  setFilter: (key: string, values: string[]) => void;
  toggleFilter: (key: string, value: string) => void;
  clearFilters: () => void;
  applyMyView: () => void;
  dataVersion: number;
  bumpData: () => void;
}

const AppContext = createContext<Ctx | null>(null);

const USER_KEY = 'bridge:user';
const filterKey = (uid: string) => `bridge:filters:${uid}`;

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [reference, setReference] = useState<Reference | null>(null);
  const [filters, setFiltersState] = useState<Filters>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const uid = safeGet(USER_KEY);
    setUserId(uid);
    setApiUser(uid);
    if (!uid) setReady(true);
  }, []);

  const refreshMe = useCallback(async () => {
    if (!userId) return;
    const m = await api<User>('/api/me');
    setMe(m);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, ref] = await Promise.all([api<User>('/api/me'), api<Reference>('/api/reference')]);
        if (cancelled) return;
        setMe(m);
        setReference(ref);
        // filters persist per user across pages and sessions; first visit = the user's own default view
        const saved = safeGet(filterKey(userId));
        setFiltersState(saved ? JSON.parse(saved) : m.default_filters || {});
        setError(null);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setFilters = useCallback(
    (f: Filters) => {
      const clean: Filters = {};
      Object.entries(f).forEach(([k, v]) => v && v.length && (clean[k] = v));
      setFiltersState(clean);
      if (userId) safeSet(filterKey(userId), JSON.stringify(clean));
    },
    [userId],
  );

  const setFilter = useCallback(
    (key: string, values: string[]) => setFilters({ ...filters, [key]: values }),
    [filters, setFilters],
  );

  const toggleFilter = useCallback(
    (key: string, value: string) => {
      const cur = filters[key] || [];
      const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
      setFilters({ ...filters, [key]: next });
    },
    [filters, setFilters],
  );

  const value = useMemo<Ctx>(
    () => ({
      userId,
      me,
      reference,
      filters,
      ready,
      error,
      login: (id: string) => {
        safeSet(USER_KEY, id);
        setApiUser(id);
        setReady(false);
        setMe(null);
        setUserId(id);
        try {
          sessionStorage.removeItem('bridge:alerts-shown');
        } catch {}
      },
      logout: () => {
        safeSet(USER_KEY, null);
        setApiUser(null);
        setUserId(null);
        setMe(null);
      },
      refreshMe,
      setFilters,
      setFilter,
      toggleFilter,
      clearFilters: () => setFilters({}),
      applyMyView: () => setFilters(me?.default_filters || {}),
      dataVersion,
      bumpData: () => setDataVersion((v) => v + 1),
    }),
    [userId, me, reference, filters, ready, error, refreshMe, setFilters, setFilter, toggleFilter, dataVersion],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Small data-loading hook: re-runs when deps change; exposes loading / error. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fn()
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}
