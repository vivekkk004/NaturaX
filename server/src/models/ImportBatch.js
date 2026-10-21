import mongoose from 'mongoose';
import { IMPORT_STATUS, ROW_OUTCOME, SEVERITY } from '../constants/importIssues.js';
import { toJSONPlugin } from './plugins/toJSON.js';

/** Keeps the document far below MongoDB's 16 MB limit even for a badly broken 10k-row file. */
export const MAX_STORED_ISSUES = 5000;

const rowIssueSchema = new mongoose.Schema(
  {
    row: Number,
    orderId: String,
    field: String,
    code: String,
    message: String,
    severity: { type: String, enum: Object.values(SEVERITY) },
    outcome: { type: String, enum: Object.values(ROW_OUTCOME) },
  },
  { _id: false },
);

/**
 * One document per uploaded file: who uploaded what, where the file is stored on disk,
 * and the full row-by-row report. This is the "error report" the user sees after an upload,
 * and it stays available later for audit.
 */
const importBatchSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true },
    // Path relative to the server folder (e.g. "uploads/1729..-orders.csv"). Only the path is in the DB.
    filePath: { type: String, required: true },
    fileType: { type: String, enum: ['csv', 'xlsx'], required: true },
    fileSize: { type: Number, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: Object.values(IMPORT_STATUS),
      default: IMPORT_STATUS.PROCESSING,
    },
    failureReason: { type: String, default: null },
    asOf: { type: Date, required: true }, // the "now" used for validation (and rule evaluation)
    completedAt: { type: Date, default: null },

    summary: {
      totalRows: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      updated: { type: Number, default: 0 },
      unchanged: { type: Number, default: 0 },
      needsCorrection: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      duplicatesSkipped: { type: Number, default: 0 },
      keptPreviousValid: { type: Number, default: 0 },
      warnings: { type: Number, default: 0 },
    },
    rowIssues: { type: [rowIssueSchema], default: [] },
    rowIssuesTruncated: { type: Boolean, default: false },

    // What the rule engine did right after this import (tasks created / reopened / auto-resolved).
    taskSummary: {
      asOf: Date,
      evaluatedOrders: Number,
      created: Number,
      reopened: Number,
      autoResolved: Number,
      refreshed: Number,
      unchanged: Number,
      createdByRule: { type: mongoose.Schema.Types.Mixed, default: undefined },
      durationMs: Number,
    },
    ruleEvaluationError: { type: String, default: null },
  },
  { timestamps: true },
);

importBatchSchema.index({ createdAt: -1 });
importBatchSchema.index({ uploadedBy: 1, createdAt: -1 });

importBatchSchema.plugin(toJSONPlugin);

export const ImportBatch = mongoose.model('ImportBatch', importBatchSchema);
