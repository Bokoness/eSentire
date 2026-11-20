import type { GraphEdge } from '../api/types';

export interface ClaimGroup {
  key: string;
  fromId: string;
  toId: string;
  type: string;
  claims: GraphEdge[];
  allRetracted: boolean;
}

/** A "weak" claim as stated by its source. Used only by the optional display filter. */
export function isWeak(claim: GraphEdge): boolean {
  return claim.confidence.strength === 'low' || claim.confidence.assessment === 'suspected';
}

/**
 * Group claims that share from/to/type for display (a single list row / a single graph line).
 * Grouping is visual only: every claim inside keeps its own source and confidence.
 */
export function groupClaims(edges: GraphEdge[]): ClaimGroup[] {
  const groups = new Map<string, ClaimGroup>();
  for (const edge of edges) {
    const key = `${edge.fromId}|${edge.type}|${edge.toId}`;
    const group = groups.get(key) ?? { key, fromId: edge.fromId, toId: edge.toId, type: edge.type, claims: [], allRetracted: true };
    group.claims.push(edge);
    group.allRetracted = group.allRetracted && edge.status === 'retracted';
    groups.set(key, group);
  }
  return [...groups.values()];
}
