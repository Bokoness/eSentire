import { normKey } from './normalize';
import type { NormalizedEntity } from './types';

export type Resolution =
  | { status: 'resolved'; externalId: string; via: 'external_id' | 'name' | 'alias' }
  | { status: 'ambiguous'; via: 'name' | 'alias'; candidates: string[] }
  | { status: 'unresolved' };

export interface Resolver {
  resolve(reference: string): Resolution;
  /** All normalized names + aliases, longest first (used by text extraction for prefix matching). */
  knownTerms: string[];
}

function pushUnique(map: Map<string, string[]>, key: string, externalId: string) {
  const list = map.get(key) ?? [];
  if (!list.includes(externalId)) list.push(externalId);
  map.set(key, list);
}

/**
 * Endpoint resolution, in strict order:
 *   1. exact external id  2. exact primary name  3. exact alias.
 * Matching is case/whitespace-insensitive but never contains/prefix/fuzzy.
 * More than one candidate at a level => ambiguous; we never guess.
 * Name-before-alias is a technical precedence rule, not proof that two records are the same actor.
 */
export function buildResolver(entities: NormalizedEntity[]): Resolver {
  const byExternalId = new Set(entities.map((e) => e.externalId));
  const byName = new Map<string, string[]>();
  const byAlias = new Map<string, string[]>();
  for (const entity of entities) {
    pushUnique(byName, normKey(entity.name), entity.externalId);
    for (const alias of entity.aliases) pushUnique(byAlias, normKey(alias), entity.externalId);
  }

  const knownTerms = [...new Set([...byName.keys(), ...byAlias.keys()])].sort((a, b) => b.length - a.length || a.localeCompare(b));

  return {
    knownTerms,
    resolve(reference: string): Resolution {
      const trimmed = reference.trim();
      if (byExternalId.has(trimmed)) return { status: 'resolved', externalId: trimmed, via: 'external_id' };
      const key = normKey(trimmed);
      for (const [via, map] of [['name', byName], ['alias', byAlias]] as const) {
        const candidates = map.get(key);
        if (!candidates || candidates.length === 0) continue;
        if (candidates.length === 1) return { status: 'resolved', externalId: candidates[0], via };
        return { status: 'ambiguous', via, candidates: [...candidates].sort() };
      }
      return { status: 'unresolved' };
    },
  };
}
