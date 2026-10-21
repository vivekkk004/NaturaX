import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll, inject } from 'vitest';
import { connectDB, disconnectDB } from '../../src/config/db.js';

/**
 * Call once at the top of an integration test file. Gives the file its own database on the
 * shared in-memory server (files run in parallel), empties it between tests and drops it at the end.
 */
export function useTestDatabase() {
  beforeAll(async () => {
    const uri = new URL(inject('mongoUri'));
    uri.pathname = `/test_${crypto.randomUUID().slice(0, 8)}`;
    await connectDB(uri.toString());
    // Build unique/TTL indexes up front so tests that rely on them are deterministic.
    await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  });

  afterEach(async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDB();
  });
}
