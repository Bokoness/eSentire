import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ quiet: true });

async function main() {
  // Imported after dotenv so Prisma sees DATABASE_URL.
  const { prisma } = await import('../lib/prisma');
  const { ingestFile, formatReport } = await import('./ingest');
  const file = resolve(process.argv[2] ?? '../data/intel.json');
  try {
    const report = await ingestFile(prisma, file);
    console.log(formatReport(report));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Ingestion failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
