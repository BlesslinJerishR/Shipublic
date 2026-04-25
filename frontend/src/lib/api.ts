export const API_BASE =
  (typeof window !== 'undefined' && (window as any).__API_BASE) ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000';

import { handleDemoRequest, isDemoMode } from './demo';

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any, message?: string) {
    super(message || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  if (isDemoMode()) {
    return (await handleDemoRequest(path, init)) as T;
  }
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new ApiError(res.status, data, data?.message || res.statusText);
  return data as T;
}

export const api = {
  me: () => apiFetch('/api/auth/me'),
  logout: () => apiFetch('/api/auth/logout'),
  projects: {
    list: () => apiFetch('/api/projects'),
    available: () => apiFetch('/api/projects/available'),
    add: (githubRepoId: number) =>
      apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ githubRepoId }),
      }),
    get: (id: string) => apiFetch(`/api/projects/${id}`),
    remove: (id: string) => apiFetch(`/api/projects/${id}`, { method: 'DELETE' }),
    setAutoSync: (id: string, enabled: boolean) =>
      apiFetch(`/api/projects/${id}/auto-sync`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    contributions: (id: string, from?: string, to?: string) => {
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      return apiFetch(`/api/projects/${id}/contributions?${q.toString()}`);
    },
  },
  commits: {
    list: (projectId: string, params: { from?: string; to?: string; take?: number } = {}) => {
      const q = new URLSearchParams();
      if (params.from) q.set('from', params.from);
      if (params.to) q.set('to', params.to);
      if (params.take) q.set('take', String(params.take));
      return apiFetch(`/api/projects/${projectId}/commits?${q.toString()}`);
    },
    sync: (projectId: string, body: any = {}) =>
      apiFetch(`/api/projects/${projectId}/commits/sync`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    aggregates: (projectId: string, from?: string, to?: string) => {
      const q = new URLSearchParams();
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      return apiFetch(`/api/projects/${projectId}/commits/aggregates?${q.toString()}`);
    },
    detail: (projectId: string, sha: string) =>
      apiFetch(`/api/projects/${projectId}/commits/${sha}`),
  },
  posts: {
    list: (projectId?: string) =>
      apiFetch(`/api/posts${projectId ? `?projectId=${projectId}` : ''}`),
    get: (id: string) => apiFetch(`/api/posts/${id}`),
    generate: (body: any) =>
      apiFetch('/api/posts/generate', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: any) =>
      apiFetch(`/api/posts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    remove: (id: string) => apiFetch(`/api/posts/${id}`, { method: 'DELETE' }),
  },
};
