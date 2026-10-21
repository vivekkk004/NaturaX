import mongoose from 'mongoose';
import { ORDER_STATUS_VALUES, PAYMENT_TYPE_VALUES } from '../constants/order.js';
import { PRIORITY_VALUES, RULE_TYPE_VALUES } from '../constants/rules.js';
import { TASK_STATUS, TASK_STATUS_VALUES } from '../constants/tasks.js';
import { toJSONPlugin } from './plugins/toJSON.js';

const { ObjectId } = mongoose.Schema.Types;

/**
 * An exception raised by a rule, turned into a follow-up task. Exception and task are 1:1,
 * so they live in one collection.
 *
 * Order details (customer, value, status) are copied in as a snapshot: task lists and the
 * daily report can be filtered and exported without a join, and they stay readable even if the
 * order is later corrected. The snapshot is refreshed whenever the order's data changes.
 */
const taskSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true },
    order: { type: ObjectId, ref: 'Order', required: true },
    ruleType: { type: String, enum: RULE_TYPE_VALUES, required: true },

    reason: { type: String, required: true },
    priority: { type: String, enum: PRIORITY_VALUES, required: true },
    priorityRank: { type: Number, required: true }, // 1 = HIGH ... 3 = LOW, for sorting
    actionRequired: { type: String, required: true },
    deadline: { type: Date, required: true },

    customer: {
      name: { type: String, default: null },
      phone: { type: String, default: null },
    },
    orderValue: { type: Number, default: null },
    orderDate: { type: Date, default: null },
    paymentType: { type: String, enum: [...PAYMENT_TYPE_VALUES, null], default: null },
    orderStatus: { type: String, enum: [...ORDER_STATUS_VALUES, null], default: null },

    assignedTo: { type: ObjectId, ref: 'User', default: null }, // null = unassigned queue
    status: { type: String, enum: TASK_STATUS_VALUES, default: TASK_STATUS.OPEN },

    detectedAt: { type: Date, required: true }, // when the rule first fired
    lastDetectedAt: { type: Date, required: true }, // last evaluation that still saw the problem
    resolvedAt: { type: Date, default: null },
    resolvedBy: { type: ObjectId, ref: 'User', default: null }, // null + resolvedAt = auto-resolved
    resolutionNote: { type: String, default: null, maxlength: 1000 },
    reopenCount: { type: Number, default: 0 },
    // Set once the deadline is missed; stays true after reassignment so SLA metrics stay honest.
    slaBreached: { type: Boolean, default: false },

    // Order content hash at the last sync: tasks reopen / auto-resolve only when the data changes.
    sourceHash: { type: String, required: true },
  },
  { timestamps: true },
);

// THE idempotency guarantee: at most one task per order per rule, enforced by the database.
taskSchema.index({ orderId: 1, ruleType: 1 }, { unique: true });
// "My tasks" / employee-wise pending widgets.
taskSchema.index({ assignedTo: 1, status: 1, deadline: 1 });
// Overdue = unresolved and deadline < now.
taskSchema.index({ status: 1, deadline: 1 });
// Exceptions by category / priority filters.
taskSchema.index({ ruleType: 1, priority: 1, status: 1 });
// Daily report "new exceptions" and dashboard date filters.
taskSchema.index({ detectedAt: -1 });
taskSchema.index({ orderDate: -1 });

/**
 * Overdue = deadline passed and not resolved. Computed on read (never stored), so it can't go stale.
 * Included in every API response through toJSON virtuals.
 */
taskSchema.virtual('isOverdue').get(function isOverdue() {
  return this.status !== TASK_STATUS.RESOLVED && this.deadline < new Date();
});

taskSchema.plugin(toJSONPlugin);

export const Task = mongoose.model('Task', taskSchema);
