import mongoose from 'mongoose';
import { logger } from './logger.js';

const state = { transactionsSupported: false };

/** Turns the most common local connection failures into an actionable message. */
function connectionHint(uri, err) {
  const detail = `${err.message} ${err.cause?.message ?? ''}`;
  if (/::1/.test(detail) || /\/\/localhost[:/]/.test(uri)) {
    return (
      '"localhost" resolves to IPv6 (::1) first on Windows, but MongoDB listens on IPv4 only. ' +
      'Use 127.0.0.1 in MONGODB_URI (e.g. mongodb://127.0.0.1:27017/naturax_followup).'
    );
  }
  if (/replicaSet=/i.test(uri)) {
    return (
      'MONGODB_URI requests a replica set. Either remove "?replicaSet=..." or enable it: add ' +
      '"replication: replSetName: rs0" to mongod.cfg, restart MongoDB, run "npm run db:init-replica -w server".'
    );
  }
  if (/ECONNREFUSED|ENOTFOUND|timed out|Server selection/i.test(detail)) {
    return 'MongoDB is not reachable. Is the service running? (Windows: Get-Service MongoDB / Start-Service MongoDB)';
  }
  return err.message;
}

/**
 * Connects to MongoDB and detects whether multi-document transactions are available.
 * Transactions only work on a replica set (or sharded cluster); a plain standalone
 * mongod rejects them. We detect this once so the rest of the code doesn't have to care.
 */
export async function connectDB(uri) {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    // The driver's "server selection" error is a large dump; tell the developer what to fix.
    throw new Error(`Cannot connect to MongoDB: ${connectionHint(uri, err)}`, { cause: err });
  }

  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  state.transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');

  logger.info(
    { db: mongoose.connection.name, transactions: state.transactionsSupported },
    'MongoDB connected',
  );
  if (!state.transactionsSupported) {
    logger.warn(
      'MongoDB is running standalone: multi-document transactions are disabled, ' +
        'falling back to single-document atomic writes. See README to enable a replica set.',
    );
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
}

export function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

export function transactionsSupported() {
  return state.transactionsSupported;
}

/**
 * Runs `work(session)` inside a transaction when the deployment supports it,
 * so either every write commits or none do. On a standalone server it runs
 * `work(null)` - each write is still atomic on its own document.
 * Mongoose accepts `{ session: null }`, so callers pass the session through unconditionally.
 */
export async function withTransaction(work) {
  if (!state.transactionsSupported) return work(null);

  const session = await mongoose.startSession();
  try {
    let result;
    // withTransaction also retries automatically on transient errors (e.g. write conflicts).
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
