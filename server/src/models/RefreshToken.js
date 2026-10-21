import mongoose from 'mongoose';
import { toJSONPlugin } from './plugins/toJSON.js';

/**
 * One document per issued refresh token. Only a SHA-256 hash of the token is stored, so a
 * leaked database dump cannot be used to log in (same idea as password hashing).
 *
 * `family` groups a chain of rotated tokens that started from one login. If a token that was
 * already rotated is presented again, someone may have stolen it -> the whole family is revoked.
 */
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedByHash: { type: String, default: null },
    createdByIp: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true, hiddenFields: ['tokenHash', 'replacedByHash'] },
);

// TTL index: MongoDB deletes expired tokens automatically (background job runs ~every 60s).
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

refreshTokenSchema.plugin(toJSONPlugin);

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
