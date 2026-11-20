import { parseDateRange } from './dates';
import type { JsonObject, NormalizedEntity, PlannedIssue, PlannedRelationship } from './types';

/**
 * Non-blocking warning: an `exploits` claim whose as_of range ends before the target
 * vulnerability's publication range starts. This may be a real zero-day, or as_of may be a
 * report date — so the claim is kept unchanged and only flagged.
 *
 * Deliberately NOT checked:
 *  - `affects`: a flaw affects a product before it is published, that is normal.
 *  - other relationship types (no publication date to compare against).
 *  - dates we cannot parse unambiguously.
 */
export function findTemporalAnomaly(rel: PlannedRelationship, target: NormalizedEntity | undefined): PlannedIssue | null {
  if (rel.type !== 'exploits' || !target || target.type !== 'vulnerability') return null;
  const publishedRaw = target.attributes.published;
  const asOf = parseDateRange(rel.asOfRaw);
  const published = parseDateRange(publishedRaw);
  if (!asOf || !published) return null;
  if (asOf.end.getTime() > published.start.getTime()) return null;

  const details: JsonObject = {
    message: `Claim dated ${rel.asOfRaw} precedes publication of ${target.name} (${String(publishedRaw)})`,
    asOf: rel.asOfRaw,
    asOfPrecision: asOf.precision,
    published: String(publishedRaw),
    publishedPrecision: published.precision,
    targetExternalId: target.externalId,
  };
  return { recordId: rel.externalId, issueType: 'temporal_anomaly', field: 'as_of', details };
}
