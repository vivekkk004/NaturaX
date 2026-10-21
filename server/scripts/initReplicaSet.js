/**
 * One-time helper: turns a local mongod started with `replication.replSetName: rs0`
 * into a working single-node replica set (enables multi-document transactions).
 * Equivalent to running `rs.initiate()` in mongosh, for machines without mongosh.
 *
 * Usage: npm run db:init-replica -w server
 */
import mongoose from 'mongoose';

const host = process.env.MONGO_HOST || '127.0.0.1:27017';
const client = new mongoose.mongo.MongoClient(`mongodb://${host}/?directConnection=true`, {
  serverSelectionTimeoutMS: 5000,
});

try {
  await client.connect();
  const admin = client.db('admin');
  const hello = await admin.command({ hello: 1 });

  if (hello.setName) {
    console.log(`Already a replica set member of "${hello.setName}". Nothing to do.`);
  } else {
    await admin.command({
      replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host }] },
    });
    console.log(
      'Replica set "rs0" initiated. Add ?replicaSet=rs0 to MONGODB_URI and restart the API.',
    );
  }
} catch (err) {
  if (err.codeName === 'NoReplicationEnabled') {
    console.error(
      'mongod is not started with replication enabled.\n' +
        'Add the following to mongod.cfg, restart the MongoDB service, then run this script again:\n\n' +
        'replication:\n  replSetName: rs0\n',
    );
  } else {
    console.error('Failed to initiate replica set:', err.message);
  }
  process.exitCode = 1;
} finally {
  await client.close();
}
