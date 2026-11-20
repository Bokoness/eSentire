// Mirrors the server responses (see server/src/services/*). Kept by hand: the API is small.

export const ENTITY_TYPES = [
  'threat_actor',
  'vulnerability',
  'campaign',
  'malware',
  'tool',
  'software',
  'sector',
  'infrastructure',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface KeyFact {
  label: string;
  value: string;
}

export type MatchedOn = 'exact_name' | 'exact_alias' | 'partial_name' | 'partial_alias' | 'description';

export interface SearchResult {
  id: string;
  externalId: string;
  name: string;
  type: string;
  description: string | null;
  matchedOn: MatchedOn | null;
  matchedValue: string | null;
  score: number | null;
  keyFact: KeyFact | null;
}

export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  limit: number;
}

export interface SourceRef {
  externalId: string;
  name: string;
  type: string;
  reliability: string | null;
}

export interface EntityDetail {
  id: string;
  externalId: string;
  name: string;
  type: string;
  description: string | null;
  aliases: string[];
  isLegacy: boolean;
  keyFact: KeyFact | null;
  attributes: Record<string, unknown>;
  recordConfidence: string | number | null;
  recordSources: SourceRef[];
  unresolvedClaims: {
    recordId: string;
    issueType: string;
    relationshipType: string | null;
    direction: 'outgoing' | 'incoming' | null;
    reference: string | null;
    sourceExternalId: string | null;
  }[];
}

export interface ConfidenceView {
  raw: Record<string, unknown> | null;
  strength: 'high' | 'medium' | 'low' | null;
  assessment: 'confirmed' | 'reported' | 'suspected' | null;
  score: number | null;
  unknown: boolean;
}

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
  derivation: { method: string; recordId: string; field: string; rule: string } | null;
  warnings: { type: 'temporal_anomaly'; message: string }[];
  source: SourceRef & { id: string; lowReliability: boolean };
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
