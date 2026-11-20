import { readFileSync } from 'node:fs';
import type { PrismaClient } from '@prisma/client';
import { planIngestion } from './plan';
import type { IngestionPlan } from './types';
import { writePlan, type WriteResult } from './write';

export interface IngestionReport {
  plan: IngestionPlan;
  written: WriteResult;
}

export async function ingestFile(prisma: PrismaClient, path: string): Promise<IngestionReport> {
  const data = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const plan = planIngestion(data);
  const written = await writePlan(prisma, plan);
  return { plan, written };
}

export function formatReport({ plan, written }: IngestionReport): string {
  const c = plan.counts;
  const issuesByType = plan.issues.reduce<Record<string, number>>((acc, i) => {
    acc[i.issueType] = (acc[i.issueType] ?? 0) + 1;
    return acc;
  }, {});
  const skippedByReason = plan.extraction.skipped.reduce<Record<string, number>>((acc, s) => {
    acc[s.reason] = (acc[s.reason] ?? 0) + 1;
    return acc;
  }, {});

  const lines = [
    'Ingestion report',
    '================',
    `Sources:        ${c.sources.accepted}/${c.sources.input} accepted (+1 technical source "src-seed-text")`,
    `Entities:       ${c.entities.accepted}/${c.entities.input} accepted, ${c.entities.invalid} invalid`,
    `Aliases:        ${written.aliases}`,
    `Relationships:  ${c.relationships.accepted}/${c.relationships.input} accepted, ` +
      `${c.relationships.unresolved} unresolved, ${c.relationships.ambiguous} ambiguous, ${c.relationships.invalid} invalid`,
    `Text-derived:   ${plan.extraction.created.length} created, ${plan.extraction.skipped.length} sentences skipped ${JSON.stringify(skippedByReason)}`,
    `Issues:         ${JSON.stringify(issuesByType)}`,
    `Stale removed:  ${JSON.stringify(written.removedStale)}`,
    '',
    'Issues:',
    ...plan.issues.map((i) => `  - ${i.recordId} [${i.issueType}] ${i.field}: ${String(i.details.message ?? i.details.reference ?? '')}`),
    '',
    'Text-derived claims:',
    ...plan.extraction.created.map((r) => `  + ${r.fromExternalId} --${r.type}--> ${r.toExternalId}  "${r.evidence}"`),
    '',
    'Skipped sentences:',
    ...plan.extraction.skipped.map((s) => `  - ${s.recordId}.${s.field} [${s.rule}] ${s.reason}${s.details ? ` (${s.details})` : ''}: "${s.sentence}"`),
  ];
  return lines.join('\n');
}
