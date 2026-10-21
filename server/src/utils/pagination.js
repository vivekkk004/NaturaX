import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;

/** Shared query params for every list endpoint: ?page=1&limit=20&sort=-createdAt */
export function listQuerySchema({ sortFields, defaultSort }) {
  const allowedSorts = sortFields.flatMap((f) => [f, `-${f}`]);
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(20),
    // Whitelisting sort fields stops clients from sorting on unindexed / sensitive fields.
    sort: z
      .enum(allowedSorts, { error: `sort must be one of: ${allowedSorts.join(', ')}` })
      .default(defaultSort),
  });
}

/** "-createdAt" -> { createdAt: -1, _id: -1 }. _id tiebreaker keeps page boundaries stable. */
export function toMongoSort(sort) {
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return { [field]: desc ? -1 : 1, _id: desc ? -1 : 1 };
}

export function buildPagination({ page, limit, total }) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

/**
 * Runs the page query and the count in parallel and returns the standard list shape:
 * { data, pagination: { page, limit, total, totalPages } }
 */
export async function paginate(model, filter, { page, limit, sort }, { populate, select } = {}) {
  let query = model
    .find(filter)
    .sort(toMongoSort(sort))
    .skip((page - 1) * limit)
    .limit(limit);
  if (select) query = query.select(select);
  if (populate) query = query.populate(populate);

  const [docs, total] = await Promise.all([query, model.countDocuments(filter)]);
  return { data: docs, pagination: buildPagination({ page, limit, total }) };
}

/** Escapes user text before putting it in a RegExp (prevents regex injection / ReDoS). */
export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
