'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Download, Lock, Pencil, PlusCircle, Search } from 'lucide-react';
import FilterPane from '@/components/FilterPane';
import { ActiveFilters } from '@/components/charts';
import { ErrorBox, PageHeader, QualityBadge, Spinner } from '@/components/ui';
import { api, download, qs } from '@/lib/api';
import { useApp, useLoad } from '@/lib/store';
import type { RecordDoc } from '@/lib/types';

const SIZE = 20;

export default function RecordsPage() {
  const { filters, setFilters, userId, dataVersion } = useApp();
  const params = useSearchParams();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-created');
  const [q, setQ] = useState(filters.q?.join(' ') || '');

  // links from notifications, e.g. /records?quality_band=Low
  useEffect(() => {
    const band = params.get('quality_band');
    if (band) setFilters({ ...filters, quality_band: [band] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    setPage(1);
  }, [JSON.stringify(filters)]);

  const { data, loading, error } = useLoad(
    () => api<{ total: number; items: RecordDoc[] }>(`/api/records${qs(filters, { page, size: SIZE, sort })}`),
    [JSON.stringify(filters), page, sort, userId, dataVersion],
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / SIZE)) : 1;

  const th = (key: string, label: string) => (
    <th className="px-3 py-2 text-left font-semibold cursor-pointer select-none whitespace-nowrap" onClick={() => setSort(sort === `-${key}` ? key : `-${key}`)}>
      {label} {sort.replace('-', '') === key ? (sort.startsWith('-') ? '↓' : '↑') : ''}
    </th>
  );

  return (
    <div className="flex flex-col lg:flex-row">
      <div className="flex-1 min-w-0 p-4 space-y-3">
        <PageHeader title="Details" subtitle="Every logged interaction you have access to. Filter, search, open and edit.">
          <button className="btn-outline" onClick={() => download(`/api/export${qs(filters, { format: 'xlsx', title: 'Records' })}`, 'records.xlsx')}>
            <Download className="w-4 h-4" /> Export to Excel
          </button>
          <Link href="/records/new" className="btn-primary">
            <PlusCircle className="w-4 h-4" /> Add interaction
          </Link>
        </PageHeader>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setFilters({ ...filters, q: q.trim() ? [q.trim()] : [] });
          }}
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input className="input !pl-9" placeholder="Search comments, feedback, products, countries..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn-primary">Search</button>
        </form>
        <ActiveFilters />
        <ErrorBox error={error} />
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-ink-soft text-[11px] uppercase tracking-wide border-b border-black/5">
              <tr>
                {th('id', 'ID')}
                {th('year', 'Period')}
                {th('country', 'Country')}
                <th className="px-3 py-2 text-left font-semibold">Product/TA</th>
                {th('activity_type', 'Activity')}
                <th className="px-3 py-2 text-left font-semibold">Stakeholders</th>
                <th className="px-3 py-2 text-left font-semibold min-w-72">Comments</th>
                {th('quality', 'Quality')}
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 stagger">
              {loading && !data && (
                <tr>
                  <td colSpan={9}>
                    <Spinner />
                  </td>
                </tr>
              )}
              {data?.items.map((r) => (
                <tr key={r.id} className="hover:bg-white/70 transition-colors align-top">
                  <td className="px-3 py-2 font-semibold text-brand">
                    <Link href={`/records/${r.id}`}>#{r.id}</Link>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.year} {r.quarter}
                  </td>
                  <td className="px-3 py-2">
                    {r.country}
                    <div className="text-[11px] text-ink-soft">{r.activity_level}</div>
                  </td>
                  <td className="px-3 py-2">{r.products.join(', ')}</td>
                  <td className="px-3 py-2">{r.activity_type}</td>
                  <td className="px-3 py-2">{r.stakeholders.join(', ')}</td>
                  <td className="px-3 py-2">
                    <div className="line-clamp-2">{r.comments}</div>
                  </td>
                  <td className="px-3 py-2">
                    <QualityBadge q={r.quality} />
                  </td>
                  <td className="px-3 py-2">
                    <Link href={`/records/${r.id}`} className="text-brand inline-flex items-center gap-1 text-xs font-semibold" title={r.can_edit ? 'Edit' : 'View only'}>
                      {r.can_edit ? <Pencil className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5 text-gray-400" />}
                      {r.can_edit ? 'Edit' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
              {data && data.items.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-ink-soft">
                    No records match these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-soft">{data.total} records</span>
            <div className="flex items-center gap-2">
              <button className="btn-outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                Page {page} of {pages}
              </span>
              <button className="btn-outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
      <FilterPane />
    </div>
  );
}
