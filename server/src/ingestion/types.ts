// Shapes produced by the pure ingestion "plan" step. Nothing here touches the database;
// endpoints are expressed as external ids so the whole plan can be unit-tested.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export interface NormalizedSource {
  externalId: string;
  name: string;
  type: string;
  reliability: string | null;
}

export interface NormalizedEntity {
  externalId: string;
  name: string;
  type: string;
  description: string | null;
  aliases: string[];
  attributes: JsonObject;
  raw: JsonObject;
  isLegacy: boolean;
}

export interface ConfidenceFields {
  confidenceRaw: JsonObject | null;
  confidenceScore: number | null;
  qualifier: string | null;
}

export interface PlannedRelationship extends ConfidenceFields {
  externalId: string;
  fromExternalId: string;
  toExternalId: string;
  sourceExternalId: string;
  type: string;
  status: string | null;
  note: string | null;
  asOfRaw: string | null;
  evidence: string | null;
  derivation: JsonObject | null;
  raw: JsonObject;
}

export type IssueType = 'ambiguous_reference' | 'unresolved_reference' | 'temporal_anomaly' | 'invalid_record';

export interface PlannedIssue {
  recordId: string;
  issueType: IssueType;
  field: string;
  details: JsonObject;
}

export interface SkippedSentence {
  recordId: string;
  field: string;
  rule: string;
  sentence: string;
  reason: 'duplicate_of_existing_claim' | 'target_not_found' | 'ambiguous_target' | 'target_type_mismatch' | 'self_reference';
  details?: string;
}

export interface IngestionPlan {
  sources: NormalizedSource[];
  entities: NormalizedEntity[];
  relationships: PlannedRelationship[];
  issues: PlannedIssue[];
  extraction: { created: PlannedRelationship[]; skipped: SkippedSentence[] };
  counts: {
    entities: { input: number; accepted: number; invalid: number };
    relationships: { input: number; accepted: number; unresolved: number; ambiguous: number; invalid: number };
    sources: { input: number; accepted: number };
  };
}
