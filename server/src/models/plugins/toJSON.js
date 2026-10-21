/**
 * Mongoose plugin applied to every model: shapes documents for API responses.
 * - exposes `id` (string) instead of `_id`, drops `__v`
 * - removes fields listed in the schema option `hiddenFields` (e.g. passwordHash)
 * Doing this once in the model means no controller can accidentally leak a secret field.
 */
export function toJSONPlugin(schema) {
  const hidden = schema.options.hiddenFields ?? [];

  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform(_doc, ret) {
      delete ret._id;
      for (const field of hidden) delete ret[field];
      return ret;
    },
  });
}
