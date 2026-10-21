import mongoose from 'mongoose';
import { logger } from './logger.js';

const state = { transactionsSupported: false };

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

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });

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
