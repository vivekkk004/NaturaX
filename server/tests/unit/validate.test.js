import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '../../src/middleware/validate.js';
import { ValidationError } from '../../src/errors/index.js';

const schemas = {
  body: z.object({ name: z.string().min(2), age: z.coerce.number().int() }),
  query: z.object({ page: z.coerce.number().int().default(1) }),
};

function run(req) {
  const next = vi.fn();
  validate(schemas)(req, {}, next);
  return next;
}

describe('validate middleware', () => {
  it('replaces body with parsed data and stores parsed query on req.validatedQuery', () => {
    const req = { body: { name: 'Asha', age: '31', extra: 'stripped' }, query: {} };
    const next = run(req);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'Asha', age: 31 });
    expect(req.validatedQuery).toEqual({ page: 1 });
  });

  it('collects every issue from every request part into one ValidationError', () => {
    const req = { body: { name: 'A' }, query: { page: 'abc' } };
    const next = run(req);

    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
    expect(err.details.map((d) => `${d.location}.${d.field}`)).toEqual(
      expect.arrayContaining(['body.name', 'body.age', 'query.page']),
    );
  });
});
