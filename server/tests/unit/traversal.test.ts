import type { GraphEdgeRow, GraphRepository } from '../../src/repositories/graphRepository';
import { traverse } from '../../src/services/traversal';

// In-memory graph so the BFS logic is tested without a database.
function memoryRepo(nodes: string[], edges: [id: string, from: string, to: string, status?: string][]) {
  const calls: string[][] = [];
  const rows: GraphEdgeRow[] = edges.map(([id, from, to, status]) => ({
    id,
    externalId: id,
    fromEntityId: from,
    toEntityId: to,
    type: 'related_to',
    confidenceRaw: null,
    confidenceScore: null,
    qualifier: null,
    status: status ?? null,
    note: null,
    asOfRaw: null,
    evidence: null,
    derivation: null,
    source: { id: 's', externalId: 's', name: 'S', type: 'vendor', reliability: 'E' },
  }));
  const repo: GraphRepository = {
    entityExists: async (id) => nodes.includes(id),
    findNodes: async (ids) => ids.map((id) => ({ id, name: id, type: 'threat_actor' })),
    findEdgesTouching: async (ids, includeRetracted) => {
      calls.push([...ids]);
      return rows
        .filter((r) => ids.includes(r.fromEntityId) || ids.includes(r.toEntityId))
        .filter((r) => includeRetracted || r.status !== 'retracted')
        .sort((a, b) => a.externalId.localeCompare(b.externalId));
    },
    countRetractedTouching: async (ids) => rows.filter((r) => r.status === 'retracted' && (ids.includes(r.fromEntityId) || ids.includes(r.toEntityId))).length,
    findTemporalWarnings: async () => [],
  };
  return { repo, calls };
}

// a -> b -> c -> d, plus an incoming edge e -> a, and a cycle c -> a
const chain = () =>
  memoryRepo(
    ['a', 'b', 'c', 'd', 'e'],
    [
      ['r1', 'a', 'b'],
      ['r2', 'b', 'c'],
      ['r3', 'c', 'd'],
      ['r4', 'e', 'a'],
      ['r5', 'c', 'a'],
    ],
  );

const hops = (g: Awaited<ReturnType<typeof traverse>>) => Object.fromEntries(g!.nodes.map((n) => [n.id, n.hop]));

describe('traverse (BFS)', () => {
  it('returns null for an unknown root', async () => {
    expect(await traverse(chain().repo, 'zzz', { depth: 1, includeRetracted: true })).toBeNull();
  });

  it('depth 1 follows outgoing AND incoming edges without flipping their direction', async () => {
    const g = await traverse(chain().repo, 'a', { depth: 1, includeRetracted: true });
    expect(hops(g)).toEqual({ a: 0, b: 1, c: 1, e: 1 });
    expect(g!.edges.find((e) => e.id === 'r4')).toMatchObject({ fromId: 'e', toId: 'a' });
    expect(g!.edges.find((e) => e.id === 'r5')).toMatchObject({ fromId: 'c', toId: 'a' });
  });

  it('depth 2 and 3 expand hop by hop; the cycle c -> a is not re-expanded', async () => {
    expect(hops(await traverse(chain().repo, 'a', { depth: 2, includeRetracted: true }))).toEqual({ a: 0, b: 1, c: 1, e: 1, d: 2 });
    const { repo, calls } = chain();
    const g3 = await traverse(repo, 'b', { depth: 3, includeRetracted: true });
    expect(hops(g3)).toEqual({ b: 0, a: 1, c: 1, d: 2, e: 2 });
    // One query per hop, each with the whole frontier (no N+1); visited nodes never come back.
    expect(calls).toEqual([['b'], ['a', 'c'], ['d', 'e']]);
  });

  it('keeps separate claims between the same two nodes', async () => {
    const { repo } = memoryRepo(['a', 'b'], [['r1', 'a', 'b'], ['r2', 'a', 'b'], ['r3', 'b', 'a']]);
    const g = await traverse(repo, 'a', { depth: 1, includeRetracted: true });
    expect(g!.edges.map((e) => e.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('includeRetracted=false recomputes reachability and reports hidden retracted claims', async () => {
    const { repo } = memoryRepo(['a', 'b', 'x'], [['r1', 'a', 'b'], ['r2', 'a', 'x', 'retracted']]);
    const withAll = await traverse(repo, 'a', { depth: 2, includeRetracted: true });
    expect(Object.keys(hops(withAll))).toContain('x');
    expect(withAll!.edges.find((e) => e.id === 'r2')?.status).toBe('retracted');

    const active = await traverse(repo, 'a', { depth: 2, includeRetracted: false });
    expect(hops(active)).toEqual({ a: 0, b: 1 }); // x was only reachable through a retracted claim
    expect(active!.hiddenRetractedCount).toBe(1);
  });

  it('truncates with a stable order when the node limit is exceeded', async () => {
    const leaves = Array.from({ length: 60 }, (_, i) => `n${String(i).padStart(2, '0')}`);
    const { repo } = memoryRepo(['hub', ...leaves], leaves.map((l, i) => [`r${i}`, 'hub', l] as [string, string, string]));
    const g = await traverse(repo, 'hub', { depth: 1, includeRetracted: true, maxNodes: 50, maxEdges: 150 });
    expect(g!.truncated).toBe(true);
    expect(g!.nodes).toHaveLength(50);
    expect(g!.nodes[0].id).toBe('hub');
    expect(g!.nodes[1].id).toBe('n00');
    expect(g!.edges.every((e) => g!.nodes.some((n) => n.id === e.toId))).toBe(true);
  });

  it('truncates when the edge limit is exceeded', async () => {
    const edges = Array.from({ length: 10 }, (_, i) => [`r${i}`, 'a', 'b'] as [string, string, string]);
    const g = await traverse(memoryRepo(['a', 'b'], edges).repo, 'a', { depth: 1, includeRetracted: true, maxEdges: 4 });
    expect(g!.edges).toHaveLength(4);
    expect(g!.truncated).toBe(true);
  });

  it('flags E/F sources as low reliability', async () => {
    const g = await traverse(chain().repo, 'a', { depth: 1, includeRetracted: true });
    expect(g!.edges[0].source.lowReliability).toBe(true);
  });
});
