import { extractConfidence, isLegacyEntity, normKey, normalizeEntity, InvalidRecordError } from '../../src/ingestion/normalize';

describe('normalizeEntity', () => {
  it('maps a regular record and keeps unknown fields as attributes', () => {
    const e = normalizeEntity(
      { id: 'vuln-x', type: 'Vulnerability', name: '  CVE-1 ', aliases: ['Bug', 'bug', ' '], cvss: '9.8', published: '03/14/2023', weird: { a: 1 } },
      0,
    );
    expect(e).toMatchObject({ externalId: 'vuln-x', name: 'CVE-1', type: 'vulnerability', isLegacy: false });
    expect(e.aliases).toEqual(['Bug']); // case-insensitive dedupe, blanks dropped
    expect(e.attributes).toEqual({ cvss: '9.8', published: '03/14/2023', weird: { a: 1 } }); // cvss string preserved
    expect(e.raw.cvss).toBe('9.8');
  });

  it('maps a legacy record: kind=APT -> threat_actor, also_known_as split on ";"', () => {
    const e = normalizeEntity(
      { ref: 'TA-0044', kind: 'APT', title: 'Cozy Bear', also_known_as: 'APT29;  The Dukes ; Cozy Bear', summary: 'Legacy.', firstSeen: '2008', conf: 0.9 },
      0,
    );
    expect(e).toMatchObject({ externalId: 'TA-0044', name: 'Cozy Bear', type: 'threat_actor', description: 'Legacy.', isLegacy: true });
    expect(e.aliases).toEqual(['APT29', 'The Dukes']); // own name is not repeated as an alias
    expect(e.attributes).toMatchObject({ first_seen: '2008', confidence: 0.9, legacy_kind: 'APT' });
  });

  it('does NOT treat infrastructure "kind" as a legacy marker; kind is kept in attributes', () => {
    const record = { id: 'infra-001', type: 'infrastructure', name: '203.0.113.45', kind: 'ip' };
    expect(isLegacyEntity(record)).toBe(false);
    const e = normalizeEntity(record, 0);
    expect(e.type).toBe('infrastructure');
    expect(e.attributes.kind).toBe('ip');
  });

  it('rejects records without a name or with an unknown legacy kind', () => {
    expect(() => normalizeEntity({ id: 'x', type: 'malware' }, 0)).toThrow(InvalidRecordError);
    expect(() => normalizeEntity({ ref: 'TA-1', title: 'X', kind: 'CRIME' }, 0)).toThrow(/Unknown legacy kind/);
  });

  it('normKey collapses whitespace and case only', () => {
    expect(normKey('  Cozy   BEAR ')).toBe('cozy bear');
  });
});

describe('extractConfidence', () => {
  it('keeps labels raw and only sets a score for explicit numbers in [0,1]', () => {
    expect(extractConfidence({ confidence_label: 'HIGH' })).toEqual({
      confidenceRaw: { confidence_label: 'HIGH' },
      confidenceScore: null,
      qualifier: null,
    });
    expect(extractConfidence({ confidence: 0.85 }).confidenceScore).toBe(0.85);
    expect(extractConfidence({ confidence: 85 }).confidenceScore).toBeNull();
    expect(extractConfidence({})).toEqual({ confidenceRaw: null, confidenceScore: null, qualifier: null });
    expect(extractConfidence({ confidence: 'reported', qualifier: 'Reported' }).qualifier).toBe('reported');
  });
});
