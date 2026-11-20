import { Prisma, type PrismaClient } from '@prisma/client';
import { normKey } from './normalize';
import type { IngestionPlan, JsonObject } from './types';

const json = (value: JsonObject) => value as Prisma.InputJsonObject;
const nullableJson = (value: JsonObject | null) => (value === null ? Prisma.DbNull : json(value));

export interface WriteResult {
  sources: number;
  entities: number;
  aliases: number;
  relationships: number;
  issues: number;
  removedStale: { aliases: number; relationships: number; issues: number };
}

/**
 * Idempotent write of a plan, in one transaction. Every row is upserted by its external id
 * (or natural unique key), so running the same seed twice does not grow any table.
 * Rows that the current seed no longer produces (stale aliases, derived claims, issues) are removed,
 * so the database always mirrors the latest ingestion.
 */
export async function writePlan(prisma: PrismaClient, plan: IngestionPlan): Promise<WriteResult> {
  return prisma.$transaction(
    async (tx) => {
      const sourceIdByExternal = new Map<string, string>();
      for (const s of plan.sources) {
        const row = await tx.source.upsert({
          where: { externalId: s.externalId },
          create: s,
          update: { name: s.name, type: s.type, reliability: s.reliability },
          select: { id: true },
        });
        sourceIdByExternal.set(s.externalId, row.id);
      }

      const entityIdByExternal = new Map<string, string>();
      let removedAliases = 0;
      for (const e of plan.entities) {
        const data = {
          name: e.name,
          nameNormalized: normKey(e.name),
          type: e.type,
          description: e.description,
          attributes: json(e.attributes),
          raw: json(e.raw),
        };
        const row = await tx.entity.upsert({
          where: { externalId: e.externalId },
          create: { externalId: e.externalId, ...data },
          update: data,
          select: { id: true },
        });
        entityIdByExternal.set(e.externalId, row.id);

        const aliasKeys = e.aliases.map(normKey);
        const removed = await tx.alias.deleteMany({ where: { entityId: row.id, valueNormalized: { notIn: aliasKeys } } });
        removedAliases += removed.count;
        if (e.aliases.length > 0) {
          await tx.alias.createMany({
            data: e.aliases.map((value) => ({ entityId: row.id, value, valueNormalized: normKey(value) })),
            skipDuplicates: true,
          });
        }
      }

      for (const r of plan.relationships) {
        const data = {
          fromEntityId: entityIdByExternal.get(r.fromExternalId)!,
          toEntityId: entityIdByExternal.get(r.toExternalId)!,
          sourceId: sourceIdByExternal.get(r.sourceExternalId)!,
          type: r.type,
          confidenceRaw: nullableJson(r.confidenceRaw),
          confidenceScore: r.confidenceScore,
          qualifier: r.qualifier,
          status: r.status,
          note: r.note,
          asOfRaw: r.asOfRaw,
          evidence: r.evidence,
          derivation: nullableJson(r.derivation),
          raw: json(r.raw),
        };
        await tx.relationship.upsert({ where: { externalId: r.externalId }, create: { externalId: r.externalId, ...data }, update: data });
      }
      const staleRels = await tx.relationship.deleteMany({
        where: { externalId: { notIn: plan.relationships.map((r) => r.externalId) } },
      });

      for (const i of plan.issues) {
        await tx.ingestionIssue.upsert({
          where: { recordId_issueType_field: { recordId: i.recordId, issueType: i.issueType, field: i.field } },
          create: { ...i, details: json(i.details) },
          update: { details: json(i.details) },
        });
      }
      const issueKeys = new Set(plan.issues.map((i) => `${i.recordId}|${i.issueType}|${i.field}`));
      const allIssues = await tx.ingestionIssue.findMany({ select: { id: true, recordId: true, issueType: true, field: true } });
      const staleIssueIds = allIssues.filter((i) => !issueKeys.has(`${i.recordId}|${i.issueType}|${i.field}`)).map((i) => i.id);
      if (staleIssueIds.length > 0) await tx.ingestionIssue.deleteMany({ where: { id: { in: staleIssueIds } } });

      return {
        sources: plan.sources.length,
        entities: plan.entities.length,
        aliases: plan.entities.reduce((n, e) => n + e.aliases.length, 0),
        relationships: plan.relationships.length,
        issues: plan.issues.length,
        removedStale: { aliases: removedAliases, relationships: staleRels.count, issues: staleIssueIds.length },
      };
    },
    { timeout: 120_000 },
  );
}
