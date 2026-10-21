import { ValidationError } from '../errors/index.js';

/**
 * Validates and sanitises parts of the request against Zod schemas.
 * Usage: router.post('/', validate({ body: createUserSchema, query: listQuerySchema }), handler)
 *
 * On success the parsed (coerced, defaulted, unknown-keys-stripped) values replace the raw ones,
 * so controllers only ever see clean data. Express 5 makes `req.query` a getter, so the parsed
 * query is stored on `req.validatedQuery` instead of being reassigned.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const details = [];

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;

      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          details.push({ location: part, field: issue.path.join('.'), message: issue.message });
        }
        continue;
      }

      if (part === 'query') req.validatedQuery = result.data;
      else req[part] = result.data;
    }

    if (details.length) return next(new ValidationError('Request validation failed', details));
    return next();
  };
}
