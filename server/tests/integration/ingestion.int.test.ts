import { ingestFile } from '../../src/ingestion/ingest';
import { SEED_PATH, prisma, resetAndSeed } from '../helpers/seed';

const counts = async () => ({
  entities: await prisma.entity.count(),
  aliases: await prisma.alias.count(),
  relationships: await prisma.relationship.count(),
  sources: await prisma.source.count(),
  issues: await prisma.ingestionIssue.count(),
});

describe('ingestion against PostgreSQL', () => {
  beforeAll(async () => {
    await resetAndSeed();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('writes the expected rows', async () => {
    expect(await counts()).toEqual({ entities: 71, aliases: 82, relationships: 90, sources: 7, issues: 8 });
  });

  it('is idempotent: re-importing the same seed does not grow any table or change ids', async () => {
    const before = await counts();
    const apt29Before = await prisma.entity.findUniqueOrThrow({ where: { externalId: 'actor-apt29' } });
    await ingestFile(prisma, SEED_PATH);
    await ingestFile(prisma, SEED_PATH);
    expect(await counts()).toEqual(before);
    const apt29After = await prisma.entity.findUniqueOrThrow({ where: { externalId: 'actor-apt29' } });
    expect(apt29After.id).toBe(apt29Before.id); // UUIDs are stable across re-imports, so links keep working
  });

  it('stores the same alias on several entities (no global unique), but never twice on one entity', async () => {
    const owners = await prisma.alias.findMany({ where: { valueNormalized: 'hidden cobra' }, select: { entity: { select: { externalId: true } } } });
    expect(owners.map((o) => o.entity.externalId).sort()).toEqual(['TA-0051', 'actor-lazarus']);
    const apt29 = await prisma.entity.findUniqueOrThrow({ where: { externalId: 'actor-apt29' }, select: { id: true } });
    await expect(prisma.alias.create({ data: { entityId: apt29.id, value: 'COZY BEAR', valueNormalized: 'cozy bear' } })).rejects.toThrow();
  });

  it('enforces foreign keys on relationships', async () => {
    const source = await prisma.source.findFirstOrThrow();
    await expect(
      prisma.relationship.create({
        data: {
          externalId: 'fk-test',
          fromEntityId: '00000000-0000-0000-0000-000000000000',
          toEntityId: '00000000-0000-0000-0000-000000000000',
          sourceId: source.id,
          type: 'uses',
          raw: {},
        },
      }),
    ).rejects.toThrow(/Foreign key constraint/i);
  });

  it('persists retracted status, raw confidence, derived evidence and issues', async () => {
    const r091 = await prisma.relationship.findUniqueOrThrow({ where: { externalId: 'rel-091' } });
    expect(r091.status).toBe('retracted');
    const r014 = await prisma.relationship.findUniqueOrThrow({ where: { externalId: 'rel-014' } });
    expect(r014.confidenceRaw).toEqual({ confidence_label: 'CONFIRMED' });
    expect(r014.confidenceScore).toBeNull();

    const derived = await prisma.relationship.findMany({ where: { source: { externalId: 'src-seed-text' } } });
    expect(derived).toHaveLength(1);
    expect(derived[0].evidence).toBe('Web shell used in the MOVEit campaign.');

    const temporal = await prisma.ingestionIssue.findUnique({
      where: { recordId_issueType_field: { recordId: 'rel-001', issueType: 'temporal_anomaly', field: 'as_of' } },
    });
    expect(temporal).not.toBeNull();
  });

  it('has the indexes the queries rely on', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(
      expect.arrayContaining([
        'entities_externalId_key',
        'entities_type_idx',
        'entities_nameNormalized_idx',
        'aliases_valueNormalized_idx',
        'relationships_fromEntityId_idx',
        'relationships_toEntityId_idx',
        'relationships_externalId_key',
        'sources_externalId_key',
      ]),
    );
  });
});
