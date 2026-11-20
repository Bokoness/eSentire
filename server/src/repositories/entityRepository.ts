import type { PrismaClient } from '@prisma/client';

export function findEntityById(prisma: PrismaClient, id: string) {
  return prisma.entity.findUnique({
    where: { id },
    select: {
      id: true,
      externalId: true,
      name: true,
      type: true,
      description: true,
      attributes: true,
      aliases: { select: { value: true }, orderBy: { value: 'asc' } },
    },
  });
}

export function findSourcesByExternalIds(prisma: PrismaClient, externalIds: string[]) {
  return prisma.source.findMany({
    where: { externalId: { in: externalIds } },
    select: { externalId: true, name: true, type: true, reliability: true },
  });
}

/** Ingestion issues for claims that touch this entity but could not be attached (e.g. "DarkSide"). */
export function findUnresolvedClaimsFor(prisma: PrismaClient, externalId: string) {
  return prisma.ingestionIssue.findMany({
    where: {
      issueType: { in: ['unresolved_reference', 'ambiguous_reference'] },
      details: { path: ['resolvedEndpoint'], equals: externalId },
    },
    orderBy: { recordId: 'asc' },
    select: { recordId: true, issueType: true, field: true, details: true },
  });
}
