import { SEED_TEXT_SOURCE_ID, extractFromText } from './extract';
import { InvalidRecordError, extractConfidence, normKey, normalizeEntity, normalizeSource, readRelationship } from './normalize';
import { buildResolver } from './resolve';
import { findTemporalAnomaly } from './temporal';
import type { IngestionPlan, JsonObject, NormalizedEntity, NormalizedSource, PlannedIssue, PlannedRelationship } from './types';

export const SEED_TEXT_SOURCE: NormalizedSource = {
  externalId: SEED_TEXT_SOURCE_ID,
  name: 'Seed dataset text (derived)',
  type: 'derived',
  reliability: null,
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function invalidIssue(err: InvalidRecordError): PlannedIssue {
  return { recordId: err.recordId, issueType: 'invalid_record', field: err.field, details: { message: err.message } };
}

/**
 * Pure step: turns the raw seed into everything that should exist in the database.
 * No I/O, so it is fully unit-testable against the real intel.json.
 */
export function planIngestion(data: unknown): IngestionPlan {
  const root = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const issues: PlannedIssue[] = [];

  // Sources
  const sources: NormalizedSource[] = [];
  asArray(root.sources).forEach((record, i) => {
    try {
      sources.push(normalizeSource(record, i));
    } catch (err) {
      if (err instanceof InvalidRecordError) issues.push(invalidIssue(err));
      else throw err;
    }
  });
  const sourceIds = new Set(sources.map((s) => s.externalId));
  const allSources = [...sources, SEED_TEXT_SOURCE];

  // Entities
  const entities: NormalizedEntity[] = [];
  const seenEntityIds = new Set<string>();
  const entityInput = asArray(root.entities);
  entityInput.forEach((record, i) => {
    try {
      const entity = normalizeEntity(record, i);
      if (seenEntityIds.has(entity.externalId)) {
        throw new InvalidRecordError(entity.externalId, 'id', 'Duplicate entity id in seed');
      }
      seenEntityIds.add(entity.externalId);
      entities.push(entity);
    } catch (err) {
      if (err instanceof InvalidRecordError) issues.push(invalidIssue(err));
      else throw err;
    }
  });
  const byExternalId = new Map(entities.map((e) => [e.externalId, e]));
  const resolver = buildResolver(entities);

  // Relationships
  const relationships: PlannedRelationship[] = [];
  const relInput = asArray(root.relationships);
  const counts = { input: relInput.length, accepted: 0, unresolved: 0, ambiguous: 0, invalid: 0 };
  relInput.forEach((record, i) => {
    let raw;
    try {
      raw = readRelationship(record, i);
    } catch (err) {
      if (!(err instanceof InvalidRecordError)) throw err;
      issues.push(invalidIssue(err));
      counts.invalid++;
      return;
    }
    if (!sourceIds.has(raw.source)) {
      issues.push({ recordId: raw.externalId, issueType: 'unresolved_reference', field: 'source', details: { reference: raw.source } });
      counts.unresolved++;
      return;
    }

    const results = { from: resolver.resolve(raw.from), to: resolver.resolve(raw.to) };
    const endpoints: Partial<Record<'from' | 'to', string>> = {};
    let failed: 'unresolved' | 'ambiguous' | null = null;
    for (const field of ['from', 'to'] as const) {
      const result = results[field];
      if (result.status === 'resolved') {
        endpoints[field] = result.externalId;
        continue;
      }
      const other = results[field === 'from' ? 'to' : 'from'];
      const details: JsonObject = {
        reference: raw[field],
        relationshipType: raw.type,
        direction: field === 'to' ? 'outgoing' : 'incoming',
        // The endpoint that DID resolve, so its entity page can list "claims we could not attach".
        resolvedEndpoint: other.status === 'resolved' ? other.externalId : null,
        sourceExternalId: raw.source,
      };
      if (result.status === 'ambiguous') {
        details.matchedVia = result.via;
        details.candidates = result.candidates;
        issues.push({ recordId: raw.externalId, issueType: 'ambiguous_reference', field, details });
        failed = failed ?? 'ambiguous';
      } else {
        issues.push({ recordId: raw.externalId, issueType: 'unresolved_reference', field, details });
        failed = failed ?? 'unresolved';
      }
    }
    if (failed) {
      counts[failed]++;
      return;
    }

    const rec = raw.record;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
    const rel: PlannedRelationship = {
      externalId: raw.externalId,
      fromExternalId: endpoints.from!,
      toExternalId: endpoints.to!,
      sourceExternalId: raw.source,
      type: normKey(raw.type),
      ...extractConfidence(rec),
      status: str(rec.status)?.toLowerCase() ?? null,
      note: str(rec.note),
      asOfRaw: str(rec.as_of),
      evidence: null,
      derivation: null,
      raw: rec,
    };
    relationships.push(rel);
    counts.accepted++;
  });

  // Free-text extraction (deduplicated against structured claims)
  const extraction = extractFromText(entities, resolver, relationships);

  // Temporal warnings for structured claims (derived claims carry no dates)
  for (const rel of relationships) {
    const issue = findTemporalAnomaly(rel, byExternalId.get(rel.toExternalId));
    if (issue) issues.push(issue);
  }

  return {
    sources: allSources,
    entities,
    relationships: [...relationships, ...extraction.created],
    issues,
    extraction,
    counts: {
      entities: { input: entityInput.length, accepted: entities.length, invalid: entityInput.length - entities.length },
      relationships: counts,
      sources: { input: asArray(root.sources).length, accepted: sources.length },
    },
  };
}
