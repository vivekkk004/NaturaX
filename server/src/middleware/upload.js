import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env.js';
import { UPLOAD_PATH } from '../config/paths.js';
import { AppError, BadRequestError } from '../errors/index.js';

const ALLOWED = {
  '.csv': 'csv',
  '.xlsx': 'xlsx',
};

/**
 * Files are written to disk under a generated name ("<timestamp>-<random>.csv"): the user's
 * original filename is never used as a path, which rules out path traversal ("../../x") and
 * collisions between two uploads of "orders.csv". The original name is kept in the DB only.
 */
const storage = multer.diskStorage({
  destination: UPLOAD_PATH,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED[ext]) {
    const hint = ext === '.xls' ? ' Old .xls files are not supported - save as .xlsx.' : '';
    return cb(new BadRequestError(`Only .csv and .xlsx files are allowed.${hint}`));
  }
  file.fileType = ALLOWED[ext];
  return cb(null, true);
}

const uploader = multer({
  storage,
  fileFilter,
  limits: { fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024, files: 1, fields: 5 },
});

function translateMulterError(err) {
  if (!(err instanceof multer.MulterError)) return err;
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError(`File is too large (maximum ${env.MAX_UPLOAD_SIZE_MB} MB)`, {
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return new BadRequestError(`Unexpected file field "${err.field}" - send the file as "file"`);
  }
  return new BadRequestError(err.message);
}

/**
 * Accepts exactly one CSV/XLSX file in the multipart field `file`.
 *
 * If the request fails *before* the import service takes ownership of the file
 * (e.g. invalid form fields), the orphaned file is deleted. Once the service has created an
 * import record (`res.locals.uploadClaimed = true`), the file is kept because that record points to it.
 */
export function uploadSingleFile(field = 'file') {
  const single = uploader.single(field);
  return (req, res, next) => {
    single(req, res, (err) => {
      if (err) return next(translateMulterError(err));
      if (!req.file) return next(new BadRequestError(`No file uploaded - send it as "${field}"`));

      res.on('finish', () => {
        if (res.statusCode >= 400 && !res.locals.uploadClaimed) {
          fs.rm(req.file.path, { force: true }, () => {});
        }
      });
      return next();
    });
  };
}
