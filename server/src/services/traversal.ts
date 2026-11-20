import type { GraphEdgeRow, GraphRepository } from '../repositories/graphRepository';
import { deriveConfidence, type ConfidenceView } from './confidence';

export const MAX_DEPTH = 3;
export const MAX_NODES = 50;
export const MAX_EDGES = 150;

export interface GraphNode {
  id: string;
  name: string;
  type: string;
  hop: number;
}

export interface GraphEdge {
  id: string;
  externalId: string;
  fromId: string;
  toId: string;
  type: string;
  confidence: ConfidenceView;
  qualifier: string | null;
  status: string | null;
  note: string | null;
  asOf: string | null;
  evidence: string | null;
  derivation: unknown;
  warnings: { type: 'temporal_anomaly'; message: string }[];
  source: { id: string; externalId: string; name: string; type: string; reliability: string | null; lowReliability: boolean };
}

export interface RelationshipGraph {
  rootId: string;
  depth: number;
  includeRetracted: boolean;
  nodes: GraphNode[];
  edges: GraphEdge[];
  truncated: boolean;
  hiddenRetractedCount: number;
  limits: { maxNodes: number; maxEdges: number };
}

export interface TraversalOptions {
  depth: number;
  includeRetracted: boolean;
  maxNodes?: number;
  maxEdges?: number;
}

const LOW_RELIABILITY = new Set(['E', 'F']);

/**
 * Breadth-first traversal over claims in BOTH directions (incoming and outgoing), one query per hop.
 * Direction is never rewritten: an edge always keeps its original from/to.
 * Reachability is computed only through edges that may be traversed, so with includeRetracted=false
 * an entity reachable only via a retracted claim does not appear at all.
 * The `visited` map prevents cycles (A→B→A) from being expanded twice.
 */
export async function traverse(repo: GraphRepository, rootId: string, opts: TraversalOptions): Promise<RelationshipGraph | null> {
  const maxNodes = opts.maxNodes ?? MAX_NODES;
  const maxEdges = opts.maxEdges ?? MAX_EDGES;
  if (!(await repo.entityExists(rootId))) return null;

  const hopById = new Map<string, number>([[rootId, 0]]);
  const edgesById = new Map<string, GraphEdgeRow>();
  let frontier = [rootId];
  let truncated = false;

  for (let hop = 1; hop <= opts.depth && frontier.length > 0; hop++) {
    const rows = await repo.findEdgesTouching(frontier, opts.includeRetracted);
    const next: string[] = [];
    for (const row of rows) {
      edgesById.set(row.id, row);
      for (const endpoint of [row.fromEntityId, row.toEntityId]) {
        if (!hopById.has(endpoint)) {
          hopById.set(endpoint, hop);
          next.push(endpoint);
        }
      }
    }
    frontier = next.sort();
    // Stop expanding once we already exceed the node budget; the result is truncated anyway.
    if (hopById.size > maxNodes && hop < opts.depth && frontier.length > 0) {
      truncated = true;
      break;
    }
  }

  // Stable order: hop, then name, then id. Keep the first maxNodes.
  const nodeRows = await repo.findNodes([...hopById.keys()]);
  const allNodes = nodeRows
    .map((n) => ({ ...n, hop: hopById.get(n.id)! }))
    .sort((a, b) => a.hop - b.hop || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const nodes = allNodes.slice(0, maxNodes);
  if (allNodes.length > maxNodes) truncated = true;
  const kept = new Map(nodes.map((n) => [n.id, n]));

  // Only edges whose both endpoints are kept; stable order by nearest hop, then external id.
  const candidateEdges = [...edgesById.values()]
    .filter((e) => kept.has(e.fromEntityId) && kept.has(e.toEntityId))
    .sort((a, b) => {
      const ha = Math.min(kept.get(a.fromEntityId)!.hop, kept.get(a.toEntityId)!.hop);
      const hb = Math.min(kept.get(b.fromEntityId)!.hop, kept.get(b.toEntityId)!.hop);
      return ha - hb || a.externalId.localeCompare(b.externalId);
    });
  const edgeRows = candidateEdges.slice(0, maxEdges);
  if (candidateEdges.length > maxEdges || candidateEdges.length < edgesById.size) truncated = true;

  const warnings = await repo.findTemporalWarnings(edgeRows.map((e) => e.externalId));
  const warningsByRecord = new Map<string, string[]>();
  for (const w of warnings) warningsByRecord.set(w.recordId, [...(warningsByRecord.get(w.recordId) ?? []), w.message]);

  const hiddenRetractedCount = opts.includeRetracted ? 0 : await repo.countRetractedTouching(nodes.map((n) => n.id));

  return {
    rootId,
    depth: opts.depth,
    includeRetracted: opts.includeRetracted,
    nodes,
    edges: edgeRows.map((e) => ({
      id: e.id,
      externalId: e.externalId,
      fromId: e.fromEntityId,
      toId: e.toEntityId,
      type: e.type,
      confidence: deriveConfidence(e.confidenceRaw, e.confidenceScore, e.qualifier),
      qualifier: e.qualifier,
      status: e.status,
      note: e.note,
      asOf: e.asOfRaw,
      evidence: e.evidence,
      derivation: e.derivation,
      warnings: (warningsByRecord.get(e.externalId) ?? []).map((message) => ({ type: 'temporal_anomaly' as const, message })),
      source: { ...e.source, lowReliability: e.source.reliability !== null && LOW_RELIABILITY.has(e.source.reliability) },
    })),
    truncated,
    hiddenRetractedCount,
    limits: { maxNodes, maxEdges },
  };
}
