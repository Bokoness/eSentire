import request from 'supertest';
import { createApp } from '../../src/app';
import { idOf, prisma, resetAndSeed } from '../helpers/seed';

const app = createApp();

describe('GET /api/entities/:id', () => {
  beforeAll(async () => {
    await resetAndSeed();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns details, aliases and record-level confidence/sources separately from attributes', async () => {
    const res = await request(app).get(`/api/entities/${await idOf('actor-apt29')}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ externalId: 'actor-apt29', name: 'APT29', type: 'threat_actor', isLegacy: false, recordConfidence: 'medium' });
    expect(res.body.aliases).toEqual(expect.arrayContaining(['Cozy Bear', 'Nobelium']));
    expect(res.body.recordSources.map((s: { externalId: string; reliability: string }) => [s.externalId, s.reliability])).toEqual([
      ['src-gov-adv', 'A'],
      ['src-vendor-a', 'B'],
    ]);
    expect(res.body.attributes).toMatchObject({ origin_country: 'RU', motivation: 'espionage' });
    expect(res.body.attributes.confidence).toBeUndefined();
    expect(res.body.raw).toBeUndefined();
  });

  it('marks legacy records and keeps infrastructure kind', async () => {
    const legacy = await request(app).get(`/api/entities/${await idOf('TA-0044')}`);
    expect(legacy.body).toMatchObject({ isLegacy: true, recordConfidence: 0.9 });
    const infra = await request(app).get(`/api/entities/${await idOf('infra-001')}`);
    expect(infra.body.attributes.kind).toBe('ip');
  });

  it('lists claims that could not be attached (Colonial Pipeline -> DarkSide)', async () => {
    const res = await request(app).get(`/api/entities/${await idOf('camp-colonial')}`);
    expect(res.body.unresolvedClaims).toEqual([
      { recordId: 'rel-032', issueType: 'unresolved_reference', relationshipType: 'attributed_to', direction: 'outgoing', reference: 'DarkSide', sourceExternalId: 'src-gov-adv' },
    ]);
  });

  it('404 for an unknown UUID, 400 for a malformed id', async () => {
    expect((await request(app).get('/api/entities/00000000-0000-4000-8000-000000000000')).status).toBe(404);
    const bad = await request(app).get('/api/entities/not-a-uuid');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toBe('Invalid request');
  });
});
