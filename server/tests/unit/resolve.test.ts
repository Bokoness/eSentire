import { buildResolver } from '../../src/ingestion/resolve';
import { realPlan } from '../helpers/seed';

describe('buildResolver on the real seed', () => {
  const plan = realPlan();
  const resolver = buildResolver(plan.entities);

  it('resolves by external id first (including legacy refs)', () => {
    expect(resolver.resolve('actor-apt29')).toEqual({ status: 'resolved', externalId: 'actor-apt29', via: 'external_id' });
    expect(resolver.resolve('TA-0044')).toMatchObject({ externalId: 'TA-0044', via: 'external_id' });
  });

  it('resolves bare names (Sandworm, CVE-2021-26855), case-insensitively', () => {
    expect(resolver.resolve('Sandworm')).toMatchObject({ status: 'resolved', externalId: 'actor-sandworm', via: 'name' });
    expect(resolver.resolve('cve-2021-26855')).toMatchObject({ externalId: 'vuln-cve-2021-26855', via: 'name' });
  });

  it('prefers a primary name over an alias: "Cozy Bear" -> legacy TA-0044, not APT29', () => {
    // Technical precedence, not an identity claim. Search still returns both.
    expect(resolver.resolve('Cozy Bear')).toMatchObject({ externalId: 'TA-0044', via: 'name' });
  });

  it('flags alias collisions as ambiguous instead of guessing', () => {
    expect(resolver.resolve('HIDDEN COBRA')).toEqual({ status: 'ambiguous', via: 'alias', candidates: ['TA-0051', 'actor-lazarus'] });
    expect(resolver.resolve('Dragonfly')).toEqual({ status: 'ambiguous', via: 'alias', candidates: ['TA-0012', 'TA-0013'] });
    expect(resolver.resolve('Uroburos')).toEqual({ status: 'ambiguous', via: 'alias', candidates: ['actor-turla', 'mal-snake'] });
  });

  it('flags duplicated primary names as ambiguous (NotPetya = campaign AND malware)', () => {
    expect(resolver.resolve('NotPetya')).toEqual({ status: 'ambiguous', via: 'name', candidates: ['camp-notpetya', 'mal-notpetya'] });
  });

  it('name beats alias for Snake / Carbanak (malware name vs actor alias)', () => {
    expect(resolver.resolve('Snake')).toMatchObject({ externalId: 'mal-snake', via: 'name' });
    expect(resolver.resolve('Carbanak')).toMatchObject({ externalId: 'mal-carbanak', via: 'name' });
  });

  it('never matches partially: "TA505" does not resolve to the alias "TA505 (overlap)"', () => {
    expect(resolver.resolve('TA505')).toEqual({ status: 'unresolved' });
    expect(resolver.resolve('DarkSide')).toEqual({ status: 'unresolved' });
    expect(resolver.resolve('APT')).toEqual({ status: 'unresolved' });
  });
});
