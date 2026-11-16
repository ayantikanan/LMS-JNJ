'use client';

import { useParams } from 'next/navigation';
import RecordForm from '@/components/RecordForm';
import { ErrorBox, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useApp, useLoad } from '@/lib/store';
import type { RecordDoc } from '@/lib/types';

export default function EditRecordPage() {
  const { id } = useParams<{ id: string }>();
  const { userId } = useApp();
  const { data, loading, error } = useLoad(() => api<RecordDoc>(`/api/records/${id}`), [id, userId]);
  if (loading && !data) return <Spinner />;
  if (error) return <div className="p-4"><ErrorBox error={error} /></div>;
  return data ? <RecordForm key={data.id} initial={data} /> : null;
}
