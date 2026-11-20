import { parseDateRange } from '../../src/ingestion/dates';
import { findTemporalAnomaly } from '../../src/ingestion/temporal';
import type { NormalizedEntity, PlannedRelationship } from '../../src/ingestion/types';
import { realPlan } from '../helpers/seed';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('parseDateRange', () => {
  it.each([
    ['2023', '2023-01-01', '2024-01-01', 'year'],
    ['2020-06', '2020-06-01', '2020-07-01', 'month'],
    ['2021-03-15', '2021-03-15', '2021-03-16', 'day'],
    ['Q3 2022', '2022-07-01', '2022-10-01', 'quarter'],
    ['March 2021', '2021-03-01', '2021-04-01', 'month'],
    ['03/14/2023', '2023-03-14', '2023-03-15', 'day'],
  ])('%s -> [%s, %s) %s', (input, start, end, precision) => {
    const r = parseDateRange(input)!;
    expect([iso(r.start), iso(r.end), r.precision]).toEqual([start, end, precision]);
  });

  it.each(['1/9/24', '01/02/2023', 'soon', '2023-13', '2023-02-30', ''])('returns null for ambiguous/invalid "%s"', (input) => {
    expect(parseDateRange(input)).toBeNull();
  });
});

describe('findTemporalAnomaly', () => {
  const vuln = (published: unknown): NormalizedEntity => ({
    externalId: 'v',
    name: 'CVE-X',
    type: 'vulnerability',
    description: null,
    aliases: [],
    attributes: { published } as never,
    raw: {},
    isLegacy: false,
  });
  const rel = (type: string, asOfRaw: string | null): PlannedRelationship =>
    ({ externalId: 'r', type, asOfRaw, fromExternalId: 'a', toExternalId: 'v' }) as PlannedRelationship;

  it('flags exploits dated entirely before publication', () => {
    expect(findTemporalAnomaly(rel('exploits', '2021-03-15'), vuln('2021-12-10'))).toMatchObject({ issueType: 'temporal_anomaly', field: 'as_of' });
  });

  it('compares at the coarser precision: same year is not an anomaly', () => {
    expect(findTemporalAnomaly(rel('exploits', '2023'), vuln('2023-10-10'))).toBeNull();
  });

  it('does not check "affects" (a flaw affects a product before it is published)', () => {
    expect(findTemporalAnomaly(rel('affects', '2021-03-15'), vuln('2021-12-10'))).toBeNull();
  });

  it('skips ambiguous dates instead of guessing', () => {
    expect(findTemporalAnomaly(rel('exploits', '1/9/24'), vuln('2025-01-01'))).toBeNull();
  });

  it('on the real seed flags exactly the expected exploits claims (rel-001 included, affects excluded)', () => {
    const ids = realPlan()
      .issues.filter((i) => i.issueType === 'temporal_anomaly')
      .map((i) => i.recordId)
      .sort();
    expect(ids).toEqual(['rel-001', 'rel-008', 'rel-012', 'rel-024', 'rel-030', 'rel-091']);
  });
});
