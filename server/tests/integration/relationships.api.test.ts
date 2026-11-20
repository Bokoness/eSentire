import request from 'supertest';
import { createApp } from '../../src/app';
import { idOf, prisma, resetAndSeed } from '../helpers/seed';

const app = createApp();

interface Edge {
  externalId: string;
  fromId: string;
  toId: string;
  type: string;
  status: string | null;
  confidence: { strength: string | null; assessment: string | null; score: number | null; unknown: boolean; raw: unknown };
  warnings: { type: string }[];
  evidence: string | null;
  source: { externalId: string; reliability: string | null; lowReliability: boolean };
}
interface Node {
  id: string;
  name: string;
  hop: number;
}

const rels = async (externalId: string, query: Record<string, string | number> = {}) =>
  request(app).get(`/api/entities/${await idOf(externalId)}/relationships`).query(query);

describe('GET /api/entities/:id/relationships', () => {
  let ids: Record<string, string>;

  beforeAll(async () => {
    await resetAndSeed();
    ids = {};
    for (const e of await prisma.entity.findMany({ select: { id: true, externalId: true } })) ids[e.externalId] = e.id;
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const edge = (body: { edges: Edge[] }, externalId: string) => body.edges.find((e) => e.externalId === externalId)!;

  it('depth defaults to 1 and returns incoming and outgoing claims with original direction', async () => {
    const res = await rels('actor-apt29');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rootId: ids['actor-apt29'], depth: 1, includeRetracted: true, truncated: false });
    expect(res.body.nodes.every((n: Node) => n.hop <= 1)).toBe(true);
    // outgoing
    expect(edge(res.body, 'rel-001')).toMatchObject({ fromId: ids['actor-apt29'], toId: ids['vuln-cve-2021-44228'], type: 'exploits' });
    // incoming: SUNBURST campaign attributed_to APT29 stays campaign -> actor
    expect(edge(res.body, 'rel-019')).toMatchObject({ fromId: ids['camp-sunburst'], toId: ids['actor-apt29'], type: 'attributed_to' });
  });

  it('keeps both overlaps_with claims (two sources, opposite directions) as separate edges', async () => {
    const res = await rels('actor-apt29');
    expect(edge(res.body, 'rel-075').source.externalId).toBe('src-vendor-a');
    expect(edge(res.body, 'rel-076').source.externalId).toBe('src-vendor-b');
  });

  it('shows confidence on separate axes, Unknown when missing', async () => {
    const res = await rels('actor-apt29');
    expect(edge(res.body, 'rel-002').confidence).toMatchObject({ strength: 'high', assessment: null, score: null });
    expect(edge(res.body, 'rel-001').confidence).toMatchObject({ assessment: 'reported', strength: null });
    expect(edge(res.body, 'rel-048').confidence).toMatchObject({ score: 0.85 });
    expect(edge(res.body, 'rel-035').confidence).toMatchObject({ unknown: true, raw: null });
  });

  it('includes temporal_anomaly warnings on the affected claims', async () => {
    const res = await rels('actor-apt29');
    expect(edge(res.body, 'rel-001').warnings).toEqual([expect.objectContaining({ type: 'temporal_anomaly' })]);
    expect(edge(res.body, 'rel-002').warnings).toEqual([]);
  });

  it('includes the retracted rel-091 by default, clearly marked, with an E/F source warning', async () => {
    const res = await rels('actor-sandworm');
    expect(edge(res.body, 'rel-091')).toMatchObject({ status: 'retracted', source: { reliability: 'F', lowReliability: true } });
  });

  it('includeRetracted=false hides retracted claims and recomputes reachability', async () => {
    const all = await rels('actor-sandworm', { depth: 1 });
    expect(all.body.nodes.map((n: Node) => n.id)).toContain(ids['vuln-cve-2021-44228']);

    const active = await rels('actor-sandworm', { depth: 1, includeRetracted: 'false' });
    expect(active.body.edges.some((e: Edge) => e.status === 'retracted')).toBe(false);
    // Log4Shell was reachable from Sandworm only through the retracted claim.
    expect(active.body.nodes.map((n: Node) => n.id)).not.toContain(ids['vuln-cve-2021-44228']);
    expect(active.body.hiddenRetractedCount).toBe(1);
  });

  it('multi-hop: APT29 -> Log4Shell -> APT41 at depth 2', async () => {
    const res = await rels('actor-apt29', { depth: 2 });
    const byId = new Map(res.body.nodes.map((n: Node) => [n.id, n.hop]));
    expect(byId.get(ids['vuln-cve-2021-44228'])).toBe(1);
    expect(byId.get(ids['actor-apt41'])).toBe(2);
    expect(res.body.nodes.length).toBeLessThanOrEqual(50);
    expect(res.body.edges.length).toBeLessThanOrEqual(150);
  });

  it('depth 3 is truncated at 50 nodes with a stable order', async () => {
    const a = await rels('actor-apt29', { depth: 3 });
    const b = await rels('actor-apt29', { depth: 3 });
    expect(a.body.truncated).toBe(true);
    expect(a.body.nodes).toHaveLength(50);
    expect(a.body.nodes.map((n: Node) => n.id)).toEqual(b.body.nodes.map((n: Node) => n.id));
    expect(a.body.nodes[0].id).toBe(ids['actor-apt29']);
  });

  it('exposes the text-derived claim with its evidence and technical source', async () => {
    const res = await rels('mal-lemurloot');
    const derived = res.body.edges.find((e: Edge) => e.type === 'used_in');
    expect(derived).toMatchObject({ evidence: 'Web shell used in the MOVEit campaign.', source: { externalId: 'src-seed-text', reliability: null } });
    expect(derived.confidence.unknown).toBe(true);
  });

  it.each([[{ depth: 0 }], [{ depth: 4 }], [{ depth: 'two' }], [{ includeRetracted: 'yes' }]])('400 for invalid query %j', async (query) => {
    const res = await rels('actor-apt29', query as Record<string, string | number>);
    expect(res.status).toBe(400);
  });

  it('404 for an unknown entity', async () => {
    const res = await request(app).get('/api/entities/00000000-0000-4000-8000-000000000000/relationships');
    expect(res.status).toBe(404);
  });
});
