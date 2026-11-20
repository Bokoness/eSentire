import { realPlan } from '../helpers/seed';

describe('planIngestion on the real intel.json', () => {
  const plan = realPlan();
  const rel = (id: string) => plan.relationships.find((r) => r.externalId === id);

  it('accepts all 71 entities (incl. 4 legacy) and 6 sources (+ technical seed-text source)', () => {
    expect(plan.counts.entities).toEqual({ input: 71, accepted: 71, invalid: 0 });
    expect(plan.entities.filter((e) => e.isLegacy).map((e) => e.externalId)).toEqual(['TA-0012', 'TA-0013', 'TA-0044', 'TA-0051']);
    expect(plan.sources.map((s) => s.externalId)).toContain('src-seed-text');
    expect(plan.sources.find((s) => s.externalId === 'src-seed-text')).toMatchObject({ type: 'derived', reliability: null });
  });

  it('keeps APT29 and the legacy "Cozy Bear" as separate entities; same_as is a claim, not a merge', () => {
    expect(plan.entities.map((e) => e.externalId)).toEqual(expect.arrayContaining(['actor-apt29', 'TA-0044']));
    expect(rel('rel-077')).toMatchObject({ type: 'same_as', fromExternalId: 'actor-apt29', toExternalId: 'TA-0044' });
  });

  it('accepts 89 relationships; DarkSide and TA505 stay unresolved with no invented entities', () => {
    expect(plan.counts.relationships).toEqual({ input: 91, accepted: 89, unresolved: 2, ambiguous: 0, invalid: 0 });
    const unresolved = plan.issues.filter((i) => i.issueType === 'unresolved_reference');
    expect(unresolved.map((i) => [i.recordId, i.details.reference])).toEqual([
      ['rel-032', 'DarkSide'],
      ['rel-080', 'TA505'],
    ]);
    expect(plan.entities.some((e) => /darkside|^ta505$/i.test(e.name))).toBe(false);
  });

  it('resolves bare-name endpoints (rel-012 -> CVE-2021-26855, rel-022 -> Sandworm)', () => {
    expect(rel('rel-012')?.toExternalId).toBe('vuln-cve-2021-26855');
    expect(rel('rel-022')?.toExternalId).toBe('actor-sandworm');
  });

  it('preserves rel-091 as a retracted claim', () => {
    expect(rel('rel-091')).toMatchObject({ status: 'retracted', toExternalId: 'vuln-cve-2021-44228', note: 'RETRACTED by source in later update' });
  });

  it('keeps ambiguous dates and string CVSS verbatim', () => {
    expect(rel('rel-004')?.asOfRaw).toBe('1/9/24');
    expect(plan.entities.find((e) => e.externalId === 'vuln-cve-2023-23397')?.attributes.cvss).toBe('9.8');
  });

  it('keeps independent claims separate (overlaps_with in both directions from two sources)', () => {
    expect(rel('rel-075')).toMatchObject({ fromExternalId: 'actor-apt29', toExternalId: 'actor-apt28', sourceExternalId: 'src-vendor-a' });
    expect(rel('rel-076')).toMatchObject({ fromExternalId: 'actor-apt28', toExternalId: 'actor-apt29', sourceExternalId: 'src-vendor-b' });
  });

  it('keeps relationship types verbatim (uses vs uses_tool)', () => {
    expect(rel('rel-035')?.type).toBe('uses');
    expect(rel('rel-037')?.type).toBe('uses_tool');
  });
});
