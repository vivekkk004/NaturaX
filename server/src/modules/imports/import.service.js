import crypto from 'node:crypto';
import path from 'node:path';
import { withTransaction } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { SERVER_ROOT, UPLOAD_PATH } from '../../config/paths.js';
import { DATA_STATUS } from '../../constants/order.js';
import { IMPORT_STATUS, ISSUE, ROW_OUTCOME, SEVERITY } from '../../constants/importIssues.js';
import { AppError, NotFoundError, ValidationError } from '../../errors/index.js';
import { mapHeaders } from '../../import/columns.js';
import { parseFile } from '../../import/parsers.js';
import { createEmployeeResolver, validateRows } from '../../import/rowValidator.js';
import { ImportBatch, MAX_STORED_ISSUES } from '../../models/ImportBatch.js';
import { Order } from '../../models/Order.js';
import { User } from '../../models/User.js';
import { paginate } from '../../utils/pagination.js';
import { runRuleEvaluation } from '../rules/ruleEvaluation.service.js';

/**
 * Hash of what the row *means* (normalised values), not how it was typed: "₹5,000" and "5000"
 * hash the same, so a re-export with different formatting is still "unchanged".
 * For rows with errors there are no trustworthy normalised values, so the raw cells are hashed.
 */
function computeSourceHash(result) {
  const payload = result.hasErrors
    ? { raw: result.raw }
    : { ...result.data, assignedTo: result.data.assignedTo?.toString() ?? null };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function buildOrderUpdate(result, sourceHash, batchId) {
  const warningsAndErrors = result.issues.filter((i) => i.code !== ISSUE.DUPLICATE_ROW);
  const fields = {
    ...result.data,
    sourceHash,
    lastImportBatch: batchId,
    dataStatus: result.hasErrors ? DATA_STATUS.NEEDS_CORRECTION : DATA_STATUS.VALID,
    dataIssues: warningsAndErrors,
  };
  return result.hasErrors
    ? { $set: { ...fields, raw: result.raw }, $setOnInsert: { firstImportBatch: batchId } }
    : { $set: fields, $unset: { raw: 1 }, $setOnInsert: { firstImportBatch: batchId } };
}

/**
 * Upserts validated rows into `orders`. Re-upload rules:
 *  - new orderId                         -> created
 *  - same content as stored (same hash)  -> unchanged, no write at all
 *  - different content                   -> updated
 *  - row has errors but the stored order is VALID -> stored order is kept (bad data never
 *    overwrites good data); the row is still reported for correction.
 */
async function persistOrders(results, batchId, session) {
  // No mutation of `results` here: withTransaction may retry this function on transient errors.
  const counts = { created: 0, updated: 0, unchanged: 0, keptPreviousValid: 0 };
  const keptPreviousValid = new Set();
  const candidates = results.filter((r) =>
    [ROW_OUTCOME.IMPORTED, ROW_OUTCOME.NEEDS_CORRECTION].includes(r.outcome),
  );

  const existing = new Map(
    (
      await Order.find({ orderId: { $in: candidates.map((r) => r.orderId) } })
        .select('orderId sourceHash dataStatus')
        .session(session)
        .lean()
    ).map((o) => [o.orderId, o]),
  );

  const ops = [];
  for (const result of candidates) {
    const stored = existing.get(result.orderId);
    const sourceHash = computeSourceHash(result);

    if (stored?.sourceHash === sourceHash) {
      counts.unchanged += 1;
      continue;
    }
    if (stored?.dataStatus === DATA_STATUS.VALID && result.hasErrors) {
      counts.keptPreviousValid += 1;
      keptPreviousValid.add(result.orderId);
      continue;
    }

    counts[stored ? 'updated' : 'created'] += 1;
    // Upsert (not insert) so two concurrent uploads of the same order cannot create two documents:
    // the unique index on orderId turns the second one into an update.
    ops.push({
      updateOne: {
        filter: { orderId: result.orderId },
        update: buildOrderUpdate(result, sourceHash, batchId),
        upsert: true,
      },
    });
  }

  if (ops.length) await Order.bulkWrite(ops, { ordered: false, session });
  return { counts, keptPreviousValid };
}

const KEPT_NOTE = {
  field: null,
  code: ISSUE.KEPT_PREVIOUS_VALID_DATA,
  message: 'Order already exists with valid data; this invalid row was not applied',
  severity: SEVERITY.WARNING,
};

function buildReport(results, keptPreviousValid) {
  const issues = results
    .flatMap((r) => {
      const rowIssues = keptPreviousValid.has(r.orderId) ? [...r.issues, KEPT_NOTE] : r.issues;
      return rowIssues.map((i) => ({
        row: r.rowNumber,
        orderId: r.orderId,
        ...i,
        outcome: r.outcome,
      }));
    })
    .sort((a, b) => a.row - b.row);

  const count = (outcome) => results.filter((r) => r.outcome === outcome).length;
  return {
    rowIssues: issues.slice(0, MAX_STORED_ISSUES),
    rowIssuesTruncated: issues.length > MAX_STORED_ISSUES,
    summary: {
      totalRows: results.length,
      needsCorrection: count(ROW_OUTCOME.NEEDS_CORRECTION),
      rejected: count(ROW_OUTCOME.REJECTED),
      duplicatesSkipped: count(ROW_OUTCOME.SKIPPED_DUPLICATE),
      warnings: results.filter((r) =>
        r.issues.some((i) => i.severity === SEVERITY.WARNING && i.code !== ISSUE.DUPLICATE_ROW),
      ).length,
    },
  };
}

/** Turns the file's header row + cells into `{ rowNumber, values: { canonicalField: cell } }`. */
function mapRows(headers, rows) {
  const { mapping, missing, duplicates } = mapHeaders(headers);
  if (missing.length || duplicates.length) {
    const problems = [
      missing.length && `missing required column(s): ${missing.join(', ')}`,
      duplicates.length && `duplicate column(s): ${duplicates.join(', ')}`,
    ].filter(Boolean);
    throw new ValidationError(`File format error - ${problems.join('; ')}`, {
      missingColumns: missing,
      duplicateColumns: duplicates,
      foundColumns: headers,
    });
  }
  return rows.map(({ rowNumber, cells }) => ({
    rowNumber,
    values: Object.fromEntries(
      mapping.flatMap((field, i) => (field ? [[field, cells[i] ?? null]] : [])),
    ),
  }));
}

/**
 * Runs the rule engine after a successful import. Orders are already committed at this point,
 * so a failure here must not turn the import into an error: it is recorded on the batch and
 * the manager can simply click "Run rules now" (evaluation is idempotent).
 */
async function evaluateAfterImport(batch, now, actor) {
  try {
    const taskSummary = await runRuleEvaluation({
      now,
      actor,
      note: `Rule engine after import of ${batch.originalName}`,
    });
    batch.set({ taskSummary, ruleEvaluationError: null });
  } catch (err) {
    logger.error({ err, importBatchId: batch.id }, 'Rule evaluation after import failed');
    batch.set({ ruleEvaluationError: 'Rule evaluation failed - run it again from the rules page' });
  }
  await batch.save();
}

/**
 * The import pipeline:
 * record batch -> parse file -> map columns -> validate rows -> upsert orders -> save report
 * -> run the rule engine (creates / reopens / auto-resolves tasks).
 * A batch record is created first, so even a file that fails completely leaves a trace
 * (who uploaded what, when, and why it failed).
 *
 * @param {{ file: Express.Multer.File, actor: { id, name }, asOf?: Date }} input
 */
export async function importOrders({ file, actor, asOf }) {
  const now = asOf ?? new Date();
  const batch = await ImportBatch.create({
    originalName: file.originalname,
    filePath: path.relative(SERVER_ROOT, file.path).split(path.sep).join('/'),
    fileType: file.fileType,
    fileSize: file.size,
    uploadedBy: actor.id,
    asOf: now,
  });

  try {
    const { headers, rows } = await parseFile(file.path, file.fileType);
    const mappedRows = mapRows(headers, rows);

    const users = await User.find().select('name email employeeCode isActive').lean();
    const results = validateRows(mappedRows, {
      now,
      resolveEmployee: createEmployeeResolver(users),
    });

    await withTransaction(async (session) => {
      const { counts, keptPreviousValid } = await persistOrders(results, batch._id, session);
      const report = buildReport(results, keptPreviousValid);
      batch.set({
        ...report,
        summary: { ...report.summary, ...counts },
        status: IMPORT_STATUS.COMPLETED,
        completedAt: new Date(),
      });
      await batch.save({ session });
    });
  } catch (err) {
    await ImportBatch.updateOne(
      { _id: batch._id },
      {
        $set: {
          status: IMPORT_STATUS.FAILED,
          failureReason: err instanceof AppError ? err.message : 'Unexpected error while importing',
          completedAt: new Date(),
        },
      },
    );
    if (err instanceof AppError) err.details = { ...err.details, importBatchId: batch.id };
    throw err;
  }

  await evaluateAfterImport(batch, now, actor);
  return batch;
}

export async function listImports({ page, limit, sort, status }) {
  const filter = status ? { status } : {};
  return paginate(
    ImportBatch,
    filter,
    { page, limit, sort },
    { select: '-rowIssues', populate: { path: 'uploadedBy', select: 'name employeeCode' } },
  );
}

export async function getImport(id) {
  const batch = await ImportBatch.findById(id).populate('uploadedBy', 'name employeeCode');
  if (!batch) throw new NotFoundError('Import not found');
  return batch;
}

/** Absolute path of the stored file, guarded so a tampered DB value can't escape the upload folder. */
export async function getImportFile(id) {
  const batch = await getImport(id);
  const absolute = path.resolve(SERVER_ROOT, batch.filePath);
  if (!absolute.startsWith(UPLOAD_PATH + path.sep)) throw new NotFoundError('File not found');
  return { absolutePath: absolute, downloadName: batch.originalName };
}
