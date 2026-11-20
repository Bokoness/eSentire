import type { Prisma, PrismaClient } from '@prisma/client';

export interface GraphNodeRow {
  id: string;
  name: string;
  type: string;
}

export interface GraphEdgeRow {
  id: string;
  externalId: string;
  fromEntityId: string;
  toEntityId: string;
  type: string;
  confidenceRaw: Prisma.JsonValue;
  confidenceScore: number | null;
  qualifier: string | null;
  status: string | null;
  note: string | null;
  asOfRaw: string | null;
  evidence: string | null;
  derivation: Prisma.JsonValue;
  source: { id: string; externalId: string; name: string; type: string; reliability: string | null };
}

/** The traversal service depends on this interface, so it can be unit-tested with an in-memory graph. */
export interface GraphRepository {
  entityExists(id: string): Promise<boolean>;
  findNodes(ids: string[]): Promise<GraphNodeRow[]>;
  /** All claims with either endpoint in `ids` — ONE query per BFS hop (no N+1). */
  findEdgesTouching(ids: string[], includeRetracted: boolean): Promise<GraphEdgeRow[]>;
  countRetractedTouching(ids: string[]): Promise<number>;
  findTemporalWarnings(edgeExternalIds: string[]): Promise<{ recordId: string; message: string }[]>;
}

const notRetracted: Prisma.RelationshipWhereInput = {
  // `status <> 'retracted'` alone would drop NULL rows in SQL, so NULL is allowed explicitly.
  OR: [{ status: null }, { status: { not: 'retracted' } }],
};

export function prismaGraphRepository(prisma: PrismaClient): GraphRepository {
  return {
    async entityExists(id) {
      return (await prisma.entity.count({ where: { id } })) > 0;
    },
    findNodes(ids) {
      return prisma.entity.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, type: true } });
    },
    findEdgesTouching(ids, includeRetracted) {
      return prisma.relationship.findMany({
        where: {
          AND: [{ OR: [{ fromEntityId: { in: ids } }, { toEntityId: { in: ids } }] }, ...(includeRetracted ? [] : [notRetracted])],
        },
        orderBy: { externalId: 'asc' },
        select: {
          id: true,
          externalId: true,
          fromEntityId: true,
          toEntityId: true,
          type: true,
          confidenceRaw: true,
          confidenceScore: true,
          qualifier: true,
          status: true,
          note: true,
          asOfRaw: true,
          evidence: true,
          derivation: true,
          source: { select: { id: true, externalId: true, name: true, type: true, reliability: true } },
        },
      });
    },
    countRetractedTouching(ids) {
      return prisma.relationship.count({
        where: { status: 'retracted', OR: [{ fromEntityId: { in: ids } }, { toEntityId: { in: ids } }] },
      });
    },
    async findTemporalWarnings(edgeExternalIds) {
      const rows = await prisma.ingestionIssue.findMany({
        where: { issueType: 'temporal_anomaly', recordId: { in: edgeExternalIds } },
        select: { recordId: true, details: true },
      });
      return rows.map((r) => ({
        recordId: r.recordId,
        message: String((r.details as Record<string, unknown> | null)?.message ?? 'Date precedes publication'),
      }));
    },
  };
}
