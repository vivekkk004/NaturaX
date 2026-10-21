import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from './env.js';

/** Absolute path of the `server/` folder, independent of where `node` was launched from. */
export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Uploaded import files are stored on disk here; MongoDB only keeps the path to the file.
 * Storing binaries in the DB would bloat it and slow backups; disk (or S3 in production) is the norm.
 */
export const UPLOAD_PATH = path.resolve(SERVER_ROOT, env.UPLOAD_DIR);

/** Production build of the React app (`npm run build`). */
export const CLIENT_DIST_PATH = path.resolve(SERVER_ROOT, '..', 'client', 'dist');

export function ensureUploadDir() {
  fs.mkdirSync(UPLOAD_PATH, { recursive: true });
}
