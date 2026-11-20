import type { EntityDetail, RelationshipGraph, SearchResponse } from './types';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function getJson<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const url = query.size ? `${path}?${query}` : path;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const api = {
  search(params: { q?: string; type?: string; origin_country?: string; page?: number; limit?: number }, signal?: AbortSignal) {
    return getJson<SearchResponse>('/api/entities/search', params, signal);
  },
  entity(id: string, signal?: AbortSignal) {
    return getJson<EntityDetail>(`/api/entities/${encodeURIComponent(id)}`, {}, signal);
  },
  relationships(id: string, params: { depth: number; includeRetracted: boolean }, signal?: AbortSignal) {
    return getJson<RelationshipGraph>(`/api/entities/${encodeURIComponent(id)}/relationships`, params, signal);
  },
};

/** Tiny in-memory cache for entity names used by breadcrumbs (avoids refetching on every hop). */
const nameCache = new Map<string, Promise<string>>();
export function entityName(id: string): Promise<string> {
  if (!nameCache.has(id)) {
    nameCache.set(
      id,
      api.entity(id).then(
        (e) => e.name,
        () => {
          nameCache.delete(id);
          return 'Unknown entity';
        },
      ),
    );
  }
  return nameCache.get(id)!;
}
export function rememberName(id: string, name: string) {
  nameCache.set(id, Promise.resolve(name));
}
