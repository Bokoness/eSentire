import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../../src/lib/prisma';
import { ingestFile } from '../../src/ingestion/ingest';
import { planIngestion } from '../../src/ingestion/plan';

export const SEED_PATH = join(__dirname, '../../../data/intel.json');

export function loadSeed(): unknown {
  return JSON.parse(readFileSync(SEED_PATH, 'utf8'));
}

export function realPlan() {
  return planIngestion(loadSeed());
}

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE relationships, aliases, entities, sources, ingestion_issues RESTART IDENTITY CASCADE',
  );
}

/** Empty the test database and ingest the real seed file. */
export async function resetAndSeed() {
  await resetDatabase();
  return ingestFile(prisma, SEED_PATH);
}

export async function idOf(externalId: string): Promise<string> {
  const row = await prisma.entity.findUniqueOrThrow({ where: { externalId }, select: { id: true } });
  return row.id;
}

export { prisma };
