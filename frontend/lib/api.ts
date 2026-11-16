import type { Filters } from './types';

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8010';

let currentUser: string | null = null;
export function setApiUser(id: string | null) {
  currentUser = id;
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === 'string' ? detail : (detail as { message?: string })?.message || `Request failed (${status})`);
    this.status = status;
    this.detail = detail;
  }
}

export function qs(filters: Filters = {}, extra: Record<string, string | number | undefined> = {}): string {
  const p = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => v && v.length && p.set(k, v.join('|')));
  Object.entries(extra).forEach(([k, v]) => v !== undefined && v !== '' && p.set(k, String(v)));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
  if (currentUser) headers['X-Bridge-User'] = currentUser;
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, `Cannot reach the backend at ${API_BASE}. Is it running?`);
  }
  if (!res.ok) {
    let detail: unknown = res.statusText;
    try {
      detail = (await res.json()).detail;
    } catch {}
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const post = <T>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const put = <T>(path: string, body: unknown) => api<T>(path, { method: 'PUT', body: JSON.stringify(body) });
export const del = <T>(path: string) => api<T>(path, { method: 'DELETE' });

/** Download a file (report export) with the user header, then save it in the browser. */
export async function download(path: string, fallbackName: string) {
  const res = await fetch(`${API_BASE}${path}`, { headers: currentUser ? { 'X-Bridge-User': currentUser } : {} });
  if (!res.ok) throw new ApiError(res.status, 'Export failed');
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
