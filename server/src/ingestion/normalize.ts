import type { ConfidenceFields, Json, JsonObject, NormalizedEntity, NormalizedSource } from './types';

/** Trim and collapse internal whitespace. Display text keeps its original casing. */
export function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Key used for exact (case/whitespace-insensitive) matching. Never fuzzy. */
export function normKey(value: string): string {
  return cleanText(value).toLowerCase();
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && cleanText(value) !== '' ? cleanText(value) : null;
}

export class InvalidRecordError extends Error {
  constructor(
    public readonly recordId: string,
    public readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

/** Legacy records are recognised by `ref` + `title`, NOT by `kind` (infrastructure records also carry `kind`). */
export function isLegacyEntity(record: JsonObject): boolean {
  return typeof record.ref === 'string' && typeof record.title === 'string';
}

const LEGACY_KIND_TO_TYPE: Record<string, string> = { APT: 'threat_actor' };

/** Dedupe aliases per entity by normalized key, drop blanks and aliases equal to the entity's own name. */
function cleanAliases(name: string, values: unknown[]): string[] {
  const seen = new Set<string>([normKey(name)]);
  const result: string[] = [];
  for (const value of values) {
    const alias = nonEmptyString(value);
    if (!alias) continue;
    const key = normKey(alias);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(alias);
  }
  return result;
}

export function normalizeEntity(record: unknown, index: number): NormalizedEntity {
  if (!isObject(record)) throw new InvalidRecordError(`entities[${index}]`, 'record', 'Entity is not an object');

  if (isLegacyEntity(record)) {
    const externalId = nonEmptyString(record.ref)!;
    const name = nonEmptyString(record.title);
    if (!name) throw new InvalidRecordError(externalId, 'title', 'Legacy entity has empty title');
    const kind = nonEmptyString(record.kind);
    const type = kind ? LEGACY_KIND_TO_TYPE[kind] : undefined;
    if (!type) throw new InvalidRecordError(externalId, 'kind', `Unknown legacy kind: ${String(record.kind)}`);
    const akaList = typeof record.also_known_as === 'string' ? record.also_known_as.split(';') : [];

    // Legacy field names are mapped onto the regular attribute names; anything unknown is kept.
    const { ref, title, kind: _kind, also_known_as, summary, firstSeen, conf, ...rest } = record;
    const attributes: JsonObject = { ...rest, legacy_kind: kind };
    if (firstSeen !== undefined) attributes.first_seen = firstSeen;
    if (conf !== undefined) attributes.confidence = conf;

    return {
      externalId,
      name,
      type,
      description: nonEmptyString(summary),
      aliases: cleanAliases(name, akaList),
      attributes,
      raw: record,
      isLegacy: true,
    };
  }

  const externalId = nonEmptyString(record.id);
  if (!externalId) throw new InvalidRecordError(`entities[${index}]`, 'id', 'Entity has no id/ref');
  const name = nonEmptyString(record.name);
  if (!name) throw new InvalidRecordError(externalId, 'name', 'Entity has no name');
  const type = nonEmptyString(record.type);
  if (!type) throw new InvalidRecordError(externalId, 'type', 'Entity has no type');

  // Everything that is not a core column becomes an attribute (e.g. cvss, published, kind=ip, confidence, sources).
  const { id, name: _n, type: _t, description, aliases, ...attributes } = record;
  return {
    externalId,
    name,
    type: type.toLowerCase(),
    description: nonEmptyString(description),
    aliases: cleanAliases(name, Array.isArray(aliases) ? aliases : []),
    attributes,
    raw: record,
    isLegacy: false,
  };
}

export function normalizeSource(record: unknown, index: number): NormalizedSource {
  if (!isObject(record)) throw new InvalidRecordError(`sources[${index}]`, 'record', 'Source is not an object');
  const externalId = nonEmptyString(record.id);
  if (!externalId) throw new InvalidRecordError(`sources[${index}]`, 'id', 'Source has no id');
  return {
    externalId,
    name: nonEmptyString(record.name) ?? externalId,
    type: nonEmptyString(record.type) ?? 'unknown',
    reliability: nonEmptyString(record.reliability),
  };
}

/**
 * Keep confidence exactly as stated. `confidenceScore` is set only for an explicit number in [0,1];
 * labels are never converted to numbers and numbers never to labels.
 */
export function extractConfidence(record: JsonObject): ConfidenceFields {
  const raw: JsonObject = {};
  for (const key of ['confidence', 'confidence_label', 'qualifier'] as const) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') raw[key] = record[key] as Json;
  }
  const value = record.confidence;
  const confidenceScore = typeof value === 'number' && value >= 0 && value <= 1 ? value : null;
  return {
    confidenceRaw: Object.keys(raw).length > 0 ? raw : null,
    confidenceScore,
    qualifier: nonEmptyString(record.qualifier)?.toLowerCase() ?? null,
  };
}

export interface RawRelationship {
  externalId: string;
  from: string;
  to: string;
  source: string;
  type: string;
  record: JsonObject;
}

export function readRelationship(record: unknown, index: number): RawRelationship {
  if (!isObject(record)) throw new InvalidRecordError(`relationships[${index}]`, 'record', 'Relationship is not an object');
  const externalId = nonEmptyString(record.id) ?? `relationships[${index}]`;
  for (const field of ['from', 'to', 'source', 'type'] as const) {
    if (!nonEmptyString(record[field])) throw new InvalidRecordError(externalId, field, `Relationship has no ${field}`);
  }
  if (!nonEmptyString(record.id)) throw new InvalidRecordError(externalId, 'id', 'Relationship has no id');
  return {
    externalId,
    from: nonEmptyString(record.from)!,
    to: nonEmptyString(record.to)!,
    source: nonEmptyString(record.source)!,
    type: nonEmptyString(record.type)!,
    record,
  };
}
