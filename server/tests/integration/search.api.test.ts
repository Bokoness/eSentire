import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma, resetAndSeed } from '../helpers/seed';

const app = createApp();
const search = (query: Record<string, string | number>) => request(app).get('/api/entities/search').query(query);
type Result = { externalId: string; matchedOn: string; matchedValue: string; score: number; keyFact: unknown };

describe('GET /api/entities/search', () => {
  beforeAll(async () => {
    await resetAndSeed();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('"Cozy Bear" returns the legacy record (exact name) AND APT29 (exact alias) as separate results', async () => {
    const res = await search({ q: 'Cozy Bear' });
    expect(res.status).toBe(200);
    expect(res.body.results.map((r: Result) => [r.externalId, r.matchedOn, r.score])).toEqual([
      ['TA-0044', 'exact_name', 100],
      ['actor-apt29', 'exact_alias', 90],
    ]);
    expect(res.body.results[1].matchedValue).toBe('Cozy Bear');
  });

  it('is case-insensitive and returns one row per entity even when several aliases match', async () => {
    const res = await search({ q: 'blizzard' });
    const ids = res.body.results.map((r: Result) => r.externalId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(['actor-apt29', 'actor-apt28', 'actor-sandworm', 'actor-turla']));
    expect(res.body.results.every((r: Result) => r.matchedOn === 'partial_alias')).toBe(true);
  });

  it('ranks exact name > exact alias > partial name > partial alias > description', async () => {
    const res = await search({ q: 'apt29' });
    const order = res.body.results.map((r: Result) => [r.externalId, r.matchedOn]);
    expect(order[0]).toEqual(['actor-apt29', 'exact_name']);
    expect(order[1]).toEqual(['TA-0044', 'exact_alias']);
    expect(order.slice(2).every(([, m]: string[]) => m === 'description')).toBe(true);
    const scores = res.body.results.map((r: Result) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it('searches descriptions and returns a snippet around the match', async () => {
    const res = await search({ q: 'trojanized' });
    expect(res.body.results.map((r: Result) => r.externalId)).toEqual(expect.arrayContaining(['camp-sunburst', 'mal-sunburst']));
    expect(res.body.results[0].matchedOn).toBe('description');
    expect(res.body.results[0].matchedValue.toLowerCase()).toContain('trojanized');
  });

  it.each([
    ['HIDDEN COBRA', ['TA-0051', 'actor-lazarus']],
    ['Dragonfly', ['TA-0012', 'TA-0013']],
    ['Uroburos', ['actor-turla', 'mal-snake']],
  ])('alias collision "%s" shows every entity that shares it', async (q, expected) => {
    const res = await search({ q });
    const exact = res.body.results.filter((r: Result) => r.score >= 90).map((r: Result) => r.externalId).sort();
    expect(exact).toEqual(expected);
  });

  it.each([
    ['Snake', 'mal-snake', 'actor-turla'],
    ['Carbanak', 'mal-carbanak', 'actor-fin7'],
  ])('"%s": malware name ranks above the actor alias, both are shown', async (q, nameMatch, aliasMatch) => {
    const res = await search({ q });
    expect(res.body.results[0]).toMatchObject({ externalId: nameMatch, matchedOn: 'exact_name' });
    expect(res.body.results[1]).toMatchObject({ externalId: aliasMatch, matchedOn: 'exact_alias' });
  });

  it('filters by type and origin_country', async () => {
    const vulns = await search({ q: 'CVE-2021', type: 'vulnerability' });
    expect(vulns.body.results.every((r: { type: string }) => r.type === 'vulnerability')).toBe(true);
    expect(vulns.body.total).toBe(3);

    const cn = await search({ q: '', type: 'threat_actor', origin_country: 'cn' });
    expect(cn.body.results.map((r: Result) => r.externalId).sort()).toEqual(['actor-apt41', 'actor-hafnium', 'actor-volt']);
  });

  it('returns a type-specific keyFact (CVSS as given, including the string "9.8")', async () => {
    const res = await search({ q: 'CVE-2023-23397' });
    expect(res.body.results[0].keyFact).toEqual({ label: 'CVSS', value: '9.8' });
    const actor = await search({ q: 'APT28' });
    expect(actor.body.results[0].keyFact).toEqual({ label: 'Origin', value: 'RU' });
  });

  it('paginates with total/page/limit', async () => {
    const page1 = await search({ q: '', limit: 10, page: 1 });
    const page8 = await search({ q: '', limit: 10, page: 8 });
    expect(page1.body).toMatchObject({ total: 71, page: 1, limit: 10 });
    expect(page1.body.results).toHaveLength(10);
    expect(page8.body.results).toHaveLength(1);
    const beyond = await search({ q: '', limit: 10, page: 99 });
    expect(beyond.body).toMatchObject({ total: 71, results: [] });
  });

  it('treats LIKE wildcards and SQL as plain text', async () => {
    expect((await search({ q: '%' })).body.total).toBe(0);
    expect((await search({ q: '_' })).body.total).toBe(0);
    const injection = await search({ q: "x' OR 1=1 --" });
    expect(injection.status).toBe(200);
    expect(injection.body.total).toBe(0);
  });

  it.each([
    [{ type: 'nation_state' }, 'type'],
    [{ origin_country: 'RUS' }, 'origin_country'],
    [{ page: 0 }, 'page'],
    [{ limit: 1000 }, 'limit'],
  ])('rejects invalid params with 400 (%j)', async (query, field) => {
    const res = await search(query as Record<string, string | number>);
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe(field);
  });
});
