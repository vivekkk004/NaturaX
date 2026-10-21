import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../../config/env.js';
import { User } from '../../models/User.js';
import { RefreshToken } from '../../models/RefreshToken.js';
import { UnauthorizedError } from '../../errors/index.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/tokens.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Two tabs refreshing at the same moment both send the same (old) cookie; the loser should
// simply fail, not be treated as a token thief. Reuse after this window = likely theft.
const ROTATION_GRACE_MS = 30 * 1000;

// Compared against when the email doesn't exist, so "unknown email" and "wrong password"
// take the same time and an attacker cannot discover which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-dummy-password', 10);

export async function hashPassword(plain) {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

async function issueRefreshToken(userId, family, meta) {
  const token = generateRefreshToken();
  await RefreshToken.create({
    user: userId,
    tokenHash: hashToken(token),
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    createdByIp: meta.ip,
    userAgent: meta.userAgent,
  });
  return token;
}

/** @returns {{ user, accessToken, refreshToken }} */
export async function login({ email, password }, meta) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  // One generic message for every failure reason (no user enumeration).
  if (!user || !passwordOk || !user.isActive) {
    throw new UnauthorizedError('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const refreshToken = await issueRefreshToken(user._id, crypto.randomUUID(), meta);
  return { user, accessToken: signAccessToken(user), refreshToken };
}

/**
 * Refresh-token rotation: every refresh consumes the presented token and issues a new one.
 * The "consume" is a single atomic findOneAndUpdate, so two simultaneous requests can never
 * both succeed with the same token.
 */
export async function refresh(presentedToken, meta) {
  if (!presentedToken) throw new UnauthorizedError('No refresh token', 'NO_REFRESH_TOKEN');

  const tokenHash = hashToken(presentedToken);
  const now = new Date();

  const consumed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
  );

  if (!consumed) {
    const existing = await RefreshToken.findOne({ tokenHash });
    const reusedAfterGrace =
      existing?.revokedAt && now - existing.revokedAt.getTime() > ROTATION_GRACE_MS;
    if (reusedAfterGrace) {
      // A rotated token came back long after rotation: assume it was stolen and
      // log out every session that descends from the same login.
      await RefreshToken.updateMany(
        { family: existing.family, revokedAt: null },
        { $set: { revokedAt: now } },
      );
    }
    throw new UnauthorizedError('Session expired, please log in again', 'INVALID_REFRESH_TOKEN');
  }

  const user = await User.findById(consumed.user);
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Account is disabled', 'INVALID_REFRESH_TOKEN');
  }

  const refreshToken = await issueRefreshToken(user._id, consumed.family, meta);
  await RefreshToken.updateOne(
    { _id: consumed._id },
    { $set: { replacedByHash: hashToken(refreshToken) } },
  );

  return { user, accessToken: signAccessToken(user), refreshToken };
}

export async function logout(presentedToken) {
  if (!presentedToken) return;
  await RefreshToken.updateOne(
    { tokenHash: hashToken(presentedToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

/** Used when a user is deactivated or their password changes: ends all their sessions. */
export async function revokeAllSessions(userId) {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function getCurrentUser(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) throw new UnauthorizedError('Account not found or disabled');
  return user;
}
