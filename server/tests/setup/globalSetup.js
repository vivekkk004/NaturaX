import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet;

/**
 * Reuses a MongoDB binary already installed on the machine (if any) instead of letting
 * mongodb-memory-server download ~70 MB on first run. Override with MONGOMS_SYSTEM_BINARY.
 */
function findLocalMongod() {
  if (process.env.MONGOMS_SYSTEM_BINARY) return process.env.MONGOMS_SYSTEM_BINARY;

  const windowsRoot = 'C:\\Program Files\\MongoDB\\Server';
  if (process.platform === 'win32' && fs.existsSync(windowsRoot)) {
    const newest = fs
      .readdirSync(windowsRoot)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((version) => path.join(windowsRoot, version, 'bin', 'mongod.exe'))
      .find((bin) => fs.existsSync(bin));
    if (newest) return newest;
  }
  return ['/usr/bin/mongod', '/usr/local/bin/mongod', '/opt/homebrew/bin/mongod'].find((bin) =>
    fs.existsSync(bin),
  );
}

/**
 * Starts one in-memory MongoDB replica set before any test file runs.
 * A replica set (not a standalone) so that transaction code paths are tested for real.
 * Tests never touch the developer's real database.
 */
export async function setup(project) {
  const systemBinary = findLocalMongod();
  // Declaring the binary's real version avoids a noisy "possible version conflict" warning.
  const version = systemBinary
    ? execFileSync(systemBinary, ['--version'], { encoding: 'utf8' }).match(/v(\d+\.\d+\.\d+)/)?.[1]
    : undefined;
  replSet = await MongoMemoryReplSet.create({
    binary: systemBinary ? { systemBinary, version } : undefined,
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  project.provide('mongoUri', replSet.getUri());
}

export async function teardown() {
  await replSet?.stop();
  fs.rmSync(path.resolve(import.meta.dirname, '..', '.uploads'), { recursive: true, force: true });
}
