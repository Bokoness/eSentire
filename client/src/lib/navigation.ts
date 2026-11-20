import type { LocationQuery, LocationQueryRaw, RouteLocationRaw } from 'vue-router';

// All navigation context lives in the URL so it survives refresh and can be shared:
//   q / type / origin / page   — the search that started the investigation
//   trail                      — comma-separated entity UUIDs visited before the current one
//   depth / retracted          — relationship view settings

export const SEARCH_KEYS = ['q', 'type', 'origin', 'page'] as const;
export const MAX_TRAIL = 10;

const first = (v: LocationQuery[string]): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? '')) as string;

export function readString(query: LocationQuery, key: string): string {
  return first(query[key]);
}

export function readTrail(query: LocationQuery): string[] {
  return readString(query, 'trail')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
}

export function searchContext(query: LocationQuery): LocationQueryRaw {
  const ctx: LocationQueryRaw = {};
  for (const key of SEARCH_KEYS) {
    const value = readString(query, key);
    if (value) ctx[key] = value;
  }
  return ctx;
}

/** Link back to the search screen with the original query restored. */
export function searchLink(query: LocationQuery): RouteLocationRaw {
  return { name: 'search', query: searchContext(query) };
}

/**
 * Link from the current entity to a related one. The current entity is appended to the trail;
 * if the target is already in the trail we cut back to it instead of creating a loop.
 */
export function entityLink(targetId: string, currentId: string | null, query: LocationQuery): RouteLocationRaw {
  let trail = readTrail(query);
  if (currentId) trail = [...trail, currentId];
  const existing = trail.indexOf(targetId);
  if (existing !== -1) trail = trail.slice(0, existing);
  trail = trail.slice(-MAX_TRAIL);

  const next: LocationQueryRaw = { ...searchContext(query) };
  if (trail.length) next.trail = trail.join(',');
  for (const key of ['depth', 'retracted'] as const) {
    const value = readString(query, key);
    if (value) next[key] = value;
  }
  return { name: 'entity', params: { id: targetId }, query: next };
}

/** Link to a breadcrumb entry: everything after it is dropped from the trail. */
export function breadcrumbLink(index: number, query: LocationQuery): RouteLocationRaw {
  const trail = readTrail(query);
  const targetId = trail[index];
  const next: LocationQueryRaw = { ...searchContext(query) };
  if (index > 0) next.trail = trail.slice(0, index).join(',');
  return { name: 'entity', params: { id: targetId }, query: next };
}
