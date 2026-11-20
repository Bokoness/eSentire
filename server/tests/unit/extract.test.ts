import { claimKey, extractFromText, matchLeadingTerm, splitSentences } from '../../src/ingestion/extract';
import { buildResolver } from '../../src/ingestion/resolve';
import type { NormalizedEntity, PlannedRelationship } from '../../src/ingestion/types';
import { realPlan } from '../helpers/seed';

const entity = (externalId: string, type: string, name: string, extra: Partial<NormalizedEntity> = {}): NormalizedEntity => ({
  externalId,
  type,
  name,
  description: null,
  aliases: [],
  attributes: {},
  raw: {},
  isLegacy: false,
  ...extra,
});

const structured = (externalId: string, type: string, from: string, to: string): PlannedRelationship =>
  ({ externalId, type, fromExternalId: from, toExternalId: to, sourceExternalId: 'src-a' }) as PlannedRelationship;

describe('text extraction helpers', () => {
  it('splits sentences and matches the longest known term on a word boundary', () => {
    expect(splitSentences('One. Two; three')).toEqual(['One.', 'Two;', 'three']);
    expect(matchLeadingTerm('the MOVEit campaign.', ['moveit campaign', 'moveit'])).toBe('moveit campaign');
    expect(matchLeadingTerm('APT290 stuff', ['apt29'])).toBeNull();
  });

  it('claimKey ignores direction only for symmetric relationship types', () => {
    expect(claimKey('same_as', 'a', 'b')).toBe(claimKey('same_as', 'b', 'a'));
    expect(claimKey('exploits', 'a', 'b')).not.toBe(claimKey('exploits', 'b', 'a'));
  });
});

describe('extractFromText', () => {
  const actor = entity('actor-x', 'threat_actor', 'X Group', { raw: { description: 'Has been observed exploiting Log4Shell. Possibly the same as Y Group.' } });
  const other = entity('actor-y', 'threat_actor', 'Y Group');
  const vuln = entity('vuln-1', 'vulnerability', 'CVE-1', { aliases: ['Log4Shell'] });
  const all = [actor, other, vuln];

  it('creates a claim with evidence + derivation and the technical source, never a confidence', () => {
    const { created } = extractFromText(all, buildResolver(all), []);
    const exploit = created.find((c) => c.type === 'exploits')!;
    expect(exploit).toMatchObject({
      fromExternalId: 'actor-x',
      toExternalId: 'vuln-1',
      sourceExternalId: 'src-seed-text',
      confidenceRaw: null,
      confidenceScore: null,
      evidence: 'Has been observed exploiting Log4Shell.',
      derivation: { method: 'pattern_v1', recordId: 'actor-x', field: 'description', rule: 'exploiting' },
    });
    const sameAs = created.find((c) => c.type === 'same_as')!;
    expect(sameAs.qualifier).toBe('suspected'); // "possibly" is never more than suspected
  });

  it('is deterministic (same ids on every run)', () => {
    const a = extractFromText(all, buildResolver(all), []).created.map((c) => c.externalId);
    const b = extractFromText(all, buildResolver(all), []).created.map((c) => c.externalId);
    expect(a).toEqual(b);
  });

  it('skips a sentence that duplicates an existing structured claim, also for reversed symmetric claims', () => {
    const existing = [structured('rel-1', 'exploits', 'actor-x', 'vuln-1'), structured('rel-2', 'same_as', 'actor-y', 'actor-x')];
    const { created, skipped } = extractFromText(all, buildResolver(all), existing);
    expect(created).toHaveLength(0);
    expect(skipped.map((s) => [s.rule, s.reason, s.details])).toEqual([
      ['exploiting', 'duplicate_of_existing_claim', 'rel-1'],
      ['possible_same_as', 'duplicate_of_existing_claim', 'rel-2'],
    ]);
  });

  it('skips ambiguous targets instead of guessing', () => {
    const subject = entity('actor-s', 'threat_actor', 'S', { raw: { description: 'Overlaps with Shared Name.' } });
    const t1 = entity('actor-t1', 'threat_actor', 'T1', { aliases: ['Shared Name'] });
    const t2 = entity('actor-t2', 'threat_actor', 'T2', { aliases: ['Shared Name'] });
    const list = [subject, t1, t2];
    const { created, skipped } = extractFromText(list, buildResolver(list), []);
    expect(created).toHaveLength(0);
    expect(skipped[0].reason).toBe('ambiguous_target');
  });
});

describe('extraction on the real seed', () => {
  const plan = realPlan();

  it('creates only genuinely new facts (LEMURLOOT used in the MOVEit campaign)', () => {
    expect(plan.extraction.created.map((c) => [c.fromExternalId, c.type, c.toExternalId])).toEqual([
      ['mal-lemurloot', 'used_in', 'camp-moveit'],
    ]);
  });

  it('documents the sentences it skipped, including structured duplicates', () => {
    const dupes = plan.extraction.skipped.filter((s) => s.reason === 'duplicate_of_existing_claim').map((s) => `${s.recordId}->${s.details}`);
    expect(dupes).toEqual(
      expect.arrayContaining(['actor-apt29->rel-001', 'camp-sunburst->rel-019', 'vuln-cve-2023-23397->rel-003', 'TA-0013->rel-078', 'TA-0044->rel-077']),
    );
    // "Overlaps with the TA505 cluster" must not be attached to anything.
    expect(plan.extraction.skipped.find((s) => s.recordId === 'actor-cl0p' && s.rule === 'overlaps_with')?.reason).toBe('target_not_found');
  });
});
