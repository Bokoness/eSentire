import { createHash } from 'node:crypto';
import { normKey } from './normalize';
import type { Resolver } from './resolve';
import type { NormalizedEntity, PlannedRelationship, SkippedSentence } from './types';

/**
 * Deterministic, deliberately small free-text extraction.
 *
 * A rule fires on a trigger phrase ("exploiting", "attributed to", ...). The text right after the
 * trigger must START with a known entity name or alias (longest match wins, word boundary required).
 * That term is resolved with the same exact resolver used for structured relationships, so an
 * ambiguous term (e.g. "NotPetya": campaign AND malware) is skipped, never guessed.
 *
 * Derived claims carry the sentence as `evidence` and the rule in `derivation`. They get the
 * technical source `src-seed-text`, never an invented confidence value.
 */

export const SEED_TEXT_SOURCE_ID = 'src-seed-text';
export const EXTRACTION_METHOD = 'pattern_v1';
export const TEXT_FIELDS = ['description', 'summary', 'note'] as const;
export const SYMMETRIC_TYPES = new Set(['same_as', 'overlaps_with', 'related_to']);

interface Built {
  type: string;
  from: string;
  to: string;
}

interface Rule {
  id: string;
  trigger: RegExp;
  subjectTypes: string[];
  targetTypes: string[];
  forceQualifier?: string;
  build(subject: NormalizedEntity, target: NormalizedEntity): Built;
}

const ACTORS = ['threat_actor'];

export const RULES: Rule[] = [
  {
    id: 'exploiting',
    trigger: /\bexploiting\s+/gi,
    subjectTypes: ['threat_actor', 'campaign'],
    targetTypes: ['vulnerability'],
    build: (s, t) => ({ type: 'exploits', from: s.externalId, to: t.externalId }),
  },
  {
    id: 'exploitation_of',
    trigger: /\bexploitation of\s+/gi,
    subjectTypes: ['threat_actor', 'campaign'],
    targetTypes: ['vulnerability'],
    build: (s, t) => ({ type: 'exploits', from: s.externalId, to: t.externalId }),
  },
  {
    id: 'overlaps_with',
    trigger: /\boverlaps? with\s+/gi,
    subjectTypes: ACTORS,
    targetTypes: ACTORS,
    build: (s, t) => ({ type: 'overlaps_with', from: s.externalId, to: t.externalId }),
  },
  {
    id: 'attributed_to',
    trigger: /\battributed to\s+/gi,
    subjectTypes: ['campaign'],
    targetTypes: ACTORS,
    build: (s, t) => ({ type: 'attributed_to', from: s.externalId, to: t.externalId }),
  },
  {
    // "<vuln> ... used by APT28" => APT28 exploits <vuln>; "<malware> used by X" => X uses <malware>.
    id: 'used_by',
    trigger: /\bused by\s+/gi,
    subjectTypes: ['vulnerability', 'malware', 'tool'],
    targetTypes: ACTORS,
    build: (s, t) => ({ type: s.type === 'vulnerability' ? 'exploits' : 'uses', from: t.externalId, to: s.externalId }),
  },
  {
    id: 'used_in',
    trigger: /\bused in\s+/gi,
    subjectTypes: ['malware', 'tool'],
    targetTypes: ['campaign'],
    build: (s, t) => ({ type: 'used_in', from: s.externalId, to: t.externalId }),
  },
  {
    // Hedged identity statements are at most "suspected". same_as is a claim, never a merge.
    id: 'possible_same_as',
    trigger: /\b(?:possibly the same as|likely duplicate of)\s+/gi,
    subjectTypes: ACTORS,
    targetTypes: ACTORS,
    forceQualifier: 'suspected',
    build: (s, t) => ({ type: 'same_as', from: s.externalId, to: t.externalId }),
  },
];

export function claimKey(type: string, from: string, to: string): string {
  const [a, b] = SYMMETRIC_TYPES.has(type) ? [from, to].sort() : [from, to];
  return `${type}|${a}|${b}`;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.;!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function hedgeQualifier(sentence: string): string | null {
  if (/\b(possibly|likely|suspected|allegedly)\b/i.test(sentence)) return 'suspected';
  if (/\breported(ly)?\b/i.test(sentence)) return 'reported';
  return null;
}

/** Longest known name/alias that the text starts with, ending on a word boundary. */
export function matchLeadingTerm(text: string, knownTerms: string[]): string | null {
  const normalized = normKey(text.replace(/^(the|a|an)\s+/i, ''));
  for (const term of knownTerms) {
    if (!normalized.startsWith(term)) continue;
    const next = normalized.charAt(term.length);
    if (next === '' || !/[a-z0-9]/i.test(next)) return term;
  }
  return null;
}

function derivedId(recordId: string, field: string, rule: string, target: string): string {
  const hash = createHash('sha1').update(`${recordId}|${field}|${rule}|${target}`).digest('hex').slice(0, 12);
  return `derived-${hash}`;
}

export function extractFromText(
  entities: NormalizedEntity[],
  resolver: Resolver,
  existing: PlannedRelationship[],
): { created: PlannedRelationship[]; skipped: SkippedSentence[] } {
  const byExternalId = new Map(entities.map((e) => [e.externalId, e]));
  // First claim wins, so a duplicate points at the earliest matching structured claim.
  const existingKeys = new Map<string, string>();
  for (const r of existing) {
    const key = claimKey(r.type, r.fromExternalId, r.toExternalId);
    if (!existingKeys.has(key)) existingKeys.set(key, r.externalId);
  }
  const created: PlannedRelationship[] = [];
  const skipped: SkippedSentence[] = [];

  for (const subject of entities) {
    for (const field of TEXT_FIELDS) {
      const text = subject.raw[field];
      if (typeof text !== 'string') continue;
      for (const sentence of splitSentences(text)) {
        for (const rule of RULES) {
          if (!rule.subjectTypes.includes(subject.type)) continue;
          for (const match of sentence.matchAll(rule.trigger)) {
            const base = { recordId: subject.externalId, field, rule: rule.id, sentence };
            const after = sentence.slice((match.index ?? 0) + match[0].length);
            const term = matchLeadingTerm(after, resolver.knownTerms);
            if (!term) {
              skipped.push({ ...base, reason: 'target_not_found', details: after.slice(0, 40) });
              continue;
            }
            const resolution = resolver.resolve(term);
            if (resolution.status !== 'resolved') {
              skipped.push({
                ...base,
                reason: 'ambiguous_target',
                details: resolution.status === 'ambiguous' ? `${term}: ${resolution.candidates.join(', ')}` : term,
              });
              continue;
            }
            const target = byExternalId.get(resolution.externalId)!;
            if (target.externalId === subject.externalId) {
              skipped.push({ ...base, reason: 'self_reference', details: term });
              continue;
            }
            if (!rule.targetTypes.includes(target.type)) {
              skipped.push({ ...base, reason: 'target_type_mismatch', details: `${target.externalId} is ${target.type}` });
              continue;
            }
            const built = rule.build(subject, target);
            const key = claimKey(built.type, built.from, built.to);
            const duplicateOf = existingKeys.get(key);
            if (duplicateOf) {
              skipped.push({ ...base, reason: 'duplicate_of_existing_claim', details: duplicateOf });
              continue;
            }
            const externalId = derivedId(subject.externalId, field, rule.id, target.externalId);
            existingKeys.set(key, externalId);
            created.push({
              externalId,
              fromExternalId: built.from,
              toExternalId: built.to,
              sourceExternalId: SEED_TEXT_SOURCE_ID,
              type: built.type,
              confidenceRaw: null,
              confidenceScore: null,
              qualifier: rule.forceQualifier ?? hedgeQualifier(sentence),
              status: null,
              note: null,
              asOfRaw: null,
              evidence: sentence,
              derivation: { method: EXTRACTION_METHOD, recordId: subject.externalId, field, rule: rule.id },
              raw: { derived: true, recordId: subject.externalId, field, rule: rule.id, sentence },
            });
          }
        }
      }
    }
  }
  return { created, skipped };
}
