import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { prismaGraphRepository } from '../repositories/graphRepository';
import { getEntity } from '../services/entityService';
import { ENTITY_TYPES } from '../services/entityFacts';
import { search } from '../services/searchService';
import { MAX_DEPTH, traverse } from '../services/traversal';

// HTTP layer only: validate input, call a service, shape the status code.

const MAX_LIMIT = 100;

const searchQuery = z.object({
  q: z.string().max(200).optional().default(''),
  type: z.enum(ENTITY_TYPES).optional(),
  origin_country: z
    .string()
    .regex(/^[A-Za-z]{2}$/, 'origin_country must be a 2-letter code')
    .transform((v) => v.toUpperCase())
    .optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(20),
});

const idParam = z.object({ id: z.uuid({ message: 'id must be a UUID' }) });

const booleanParam = z.enum(['true', 'false']).transform((v) => v === 'true');

const relationshipsQuery = z.object({
  depth: z.coerce.number().int().min(1).max(MAX_DEPTH).optional().default(1),
  includeRetracted: booleanParam.optional().default(true),
});

function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(
      400,
      'Invalid request',
      result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

export const entitiesRouter = Router();

entitiesRouter.get('/search', async (req, res) => {
  const query = parse(searchQuery, req.query);
  res.json(
    await search(prisma, {
      q: query.q,
      type: query.type ?? null,
      originCountry: query.origin_country ?? null,
      page: query.page,
      limit: query.limit,
    }),
  );
});

entitiesRouter.get('/:id', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const entity = await getEntity(prisma, id);
  if (!entity) throw new HttpError(404, 'Entity not found');
  res.json(entity);
});

entitiesRouter.get('/:id/relationships', async (req, res) => {
  const { id } = parse(idParam, req.params);
  const { depth, includeRetracted } = parse(relationshipsQuery, req.query);
  const graph = await traverse(prismaGraphRepository(prisma), id, { depth, includeRetracted });
  if (!graph) throw new HttpError(404, 'Entity not found');
  res.json(graph);
});
