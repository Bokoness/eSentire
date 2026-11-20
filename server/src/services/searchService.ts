import type { PrismaClient } from '@prisma/client';
import { normKey } from '../ingestion/normalize';
import { searchEntities } from '../repositories/searchRepository';
import { keyFact, type KeyFact } from './entityFacts';

export interface SearchQuery {
  q: string;
  type: string | null;
  originCountry: string | null;
  page: number;
  limit: number;
}

export interface SearchResult {
  id: string;
  externalId: string;
  name: string;
  type: string;
  description: string | null;
  matchedOn: string | null;
  matchedValue: string | null;
  score: number | null;
  keyFact: KeyFact | null;
}

export interface SearchResponse {
  query: { q: string; type: string | null; originCountry: string | null };
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
}

const SHORT_DESCRIPTION = 160;

export function shorten(text: string | null, max = SHORT_DESCRIPTION): string | null {
  if (!text) return null;
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** For description matches, show a window around the hit instead of the whole description. */
export function snippetAround(text: string, needle: string, radius = 50): string {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return shorten(text) ?? '';
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + needle.length + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

export async function search(prisma: PrismaClient, query: SearchQuery): Promise<SearchResponse> {
  const normalizedQuery = normKey(query.q);
  const params = {
    normalizedQuery,
    type: query.type,
    originCountry: query.originCountry,
    limit: query.limit,
    offset: (query.page - 1) * query.limit,
  };
  const rows = await searchEntities(prisma, params);

  // A page past the end has no rows to carry COUNT(*) OVER(); fetch the total separately.
  let total = rows[0]?.total ?? 0;
  if (rows.length === 0 && params.offset > 0) {
    total = (await searchEntities(prisma, { ...params, limit: 1, offset: 0 }))[0]?.total ?? 0;
  }

  return {
    query: { q: query.q, type: query.type, originCountry: query.originCountry },
    total: Number(total),
    page: query.page,
    limit: query.limit,
    results: rows.map((r) => ({
      id: r.id,
      externalId: r.externalId,
      name: r.name,
      type: r.type,
      description: shorten(r.description),
      matchedOn: r.matchedOn,
      matchedValue: r.matchedOn === 'description' && r.matchedValue ? snippetAround(r.matchedValue, normalizedQuery) : r.matchedValue,
      score: r.score === null ? null : Number(r.score),
      keyFact: keyFact(r.type, r.attributes ?? {}),
    })),
  };
}
