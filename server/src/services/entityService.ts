import type { PrismaClient } from '@prisma/client';
import { findEntityById, findSourcesByExternalIds, findUnresolvedClaimsFor } from '../repositories/entityRepository';
import { displayAttributes, keyFact } from './entityFacts';

export async function getEntity(prisma: PrismaClient, id: string) {
  const entity = await findEntityById(prisma, id);
  if (!entity) return null;

  const attributes = (entity.attributes ?? {}) as Record<string, unknown>;
  // Entity-level confidence/sources describe the RECORD, not any relationship claim.
  const sourceIds = Array.isArray(attributes.sources) ? attributes.sources.filter((s): s is string => typeof s === 'string') : [];
  const sources = sourceIds.length ? await findSourcesByExternalIds(prisma, sourceIds) : [];
  const unresolved = await findUnresolvedClaimsFor(prisma, entity.externalId);

  return {
    id: entity.id,
    externalId: entity.externalId,
    name: entity.name,
    type: entity.type,
    description: entity.description,
    aliases: entity.aliases.map((a) => a.value),
    isLegacy: typeof attributes.legacy_kind === 'string',
    keyFact: keyFact(entity.type, attributes),
    attributes: displayAttributes(attributes),
    recordConfidence: attributes.confidence ?? null,
    recordSources: sourceIds.map((externalId) => {
      const s = sources.find((x) => x.externalId === externalId);
      return s ?? { externalId, name: externalId, type: 'unknown', reliability: null };
    }),
    unresolvedClaims: unresolved.map((u) => {
      const d = (u.details ?? {}) as Record<string, unknown>;
      return {
        recordId: u.recordId,
        issueType: u.issueType,
        relationshipType: d.relationshipType ?? null,
        direction: d.direction ?? null,
        reference: d.reference ?? null,
        sourceExternalId: d.sourceExternalId ?? null,
      };
    }),
  };
}

export type EntityDetail = NonNullable<Awaited<ReturnType<typeof getEntity>>>;
