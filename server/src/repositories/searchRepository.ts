import { Prisma, type PrismaClient } from '@prisma/client';

export interface SearchParams {
  normalizedQuery: string; // lower-cased, whitespace-collapsed; '' = browse mode
  type: string | null;
  originCountry: string | null;
  limit: number;
  offset: number;
}

export interface SearchRow {
  id: string;
  externalId: string;
  name: string;
  type: string;
  description: string | null;
  attributes: Record<string, unknown>;
  matchedOn: string | null;
  matchedValue: string | null;
  score: number | null;
  total: number;
}

/** Escape LIKE wildcards so user input such as "_" or "%" is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Relevance score (not confidence): exact name 100 > exact alias 90 > partial name 70 > partial alias 60 > description 40.
// One row per entity: the LATERAL subquery keeps only that entity's best match.
// Every user value is a bound parameter (Prisma.sql), never string-concatenated into SQL.
export async function searchEntities(prisma: PrismaClient, p: SearchParams): Promise<SearchRow[]> {
  const filters: Prisma.Sql[] = [];
  if (p.type) filters.push(Prisma.sql`e.type = ${p.type}`);
  if (p.originCountry) filters.push(Prisma.sql`upper(e.attributes->>'origin_country') = ${p.originCountry}`);

  if (p.normalizedQuery === '') {
    const where = filters.length ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
    return prisma.$queryRaw<SearchRow[]>`
      SELECT e.id, e."externalId", e.name, e.type, e.description, e.attributes,
             NULL::text AS "matchedOn", NULL::text AS "matchedValue", NULL::int AS score,
             COUNT(*) OVER()::int AS total
      FROM entities e
      ${where}
      ORDER BY e.name, e.id
      LIMIT ${p.limit} OFFSET ${p.offset}`;
  }

  const q = p.normalizedQuery;
  const pattern = `%${escapeLike(q)}%`;
  const where = filters.length ? Prisma.sql`AND ${Prisma.join(filters, ' AND ')}` : Prisma.empty;
  return prisma.$queryRaw<SearchRow[]>`
    SELECT e.id, e."externalId", e.name, e.type, e.description, e.attributes,
           m.matched_on AS "matchedOn", m.matched_value AS "matchedValue", m.score,
           COUNT(*) OVER()::int AS total
    FROM entities e
    JOIN LATERAL (
      SELECT * FROM (
        SELECT 'exact_name' AS matched_on, e.name AS matched_value, 100 AS score
          WHERE e."nameNormalized" = ${q}
        UNION ALL
        SELECT 'exact_alias', a.value, 90 FROM aliases a
          WHERE a."entityId" = e.id AND a."valueNormalized" = ${q}
        UNION ALL
        SELECT 'partial_name', e.name, 70
          WHERE e."nameNormalized" LIKE ${pattern} ESCAPE '\\'
        UNION ALL
        SELECT 'partial_alias', a.value, 60 FROM aliases a
          WHERE a."entityId" = e.id AND a."valueNormalized" LIKE ${pattern} ESCAPE '\\'
        UNION ALL
        SELECT 'description', e.description, 40
          WHERE lower(e.description) LIKE ${pattern} ESCAPE '\\'
      ) candidates
      ORDER BY score DESC, matched_value
      LIMIT 1
    ) m ON TRUE
    WHERE TRUE ${where}
    ORDER BY m.score DESC, e.name, e.id
    LIMIT ${p.limit} OFFSET ${p.offset}`;
}
