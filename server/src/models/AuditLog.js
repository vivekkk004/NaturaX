import mongoose from 'mongoose';
import { AUDIT_ACTION_VALUES } from '../constants/audit.js';
import { toJSONPlugin } from './plugins/toJSON.js';

/**
 * Append-only audit trail: who did what, to which order/task, when, and old -> new values.
 *
 * "Append-only" is enforced here, not just by convention: every Mongoose update/delete
 * operation on this model throws, and an existing entry cannot be re-saved. The API also
 * exposes no update/delete endpoint. (A DBA with direct database access could still change
 * data; production would add DB-level roles or write-once storage for that.)
 */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: AUDIT_ACTION_VALUES, required: true },
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    orderId: { type: String, default: null },
    ruleType: { type: String, default: null },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system
    performedByName: { type: String, required: true }, // snapshot: readable even if the user is renamed
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },
    note: { type: String, default: null, maxlength: 1000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ orderId: 1, createdAt: -1 });
auditLogSchema.index({ task: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ performedBy: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

const IMMUTABLE_OPERATIONS = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'findOneAndReplace',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];
auditLogSchema.pre(IMMUTABLE_OPERATIONS, function rejectChange() {
  throw new Error('Audit log is append-only: entries cannot be modified or deleted');
});
auditLogSchema.pre('save', function rejectResave() {
  if (!this.isNew) throw new Error('Audit log is append-only: entries cannot be modified');
});

auditLogSchema.plugin(toJSONPlugin);

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
