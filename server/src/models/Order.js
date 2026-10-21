import mongoose from 'mongoose';
import {
  DATA_STATUS,
  DATA_STATUS_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_TYPE_VALUES,
} from '../constants/order.js';
import { SEVERITY } from '../constants/importIssues.js';
import { CANONICAL_FIELDS } from '../import/columns.js';
import { toJSONPlugin } from './plugins/toJSON.js';

const { ObjectId } = mongoose.Schema.Types;

const dataIssueSchema = new mongoose.Schema(
  {
    field: String,
    code: String,
    message: String,
    severity: { type: String, enum: Object.values(SEVERITY) },
  },
  { _id: false },
);

/** The cell values exactly as they appeared in the file (stored only for orders needing correction). */
const rawRowSchema = new mongoose.Schema(
  Object.fromEntries(CANONICAL_FIELDS.map((field) => [field, String])),
  { _id: false },
);

/**
 * One document per real-world order, keyed by the business `orderId`.
 * Fields that could not be parsed are null; for NEEDS_CORRECTION orders `raw` keeps exactly what
 * the file contained, so the person fixing the data sees the original values.
 */
const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    orderDate: { type: Date, default: null },
    customerName: { type: String, default: null },
    phone: { type: String, default: null },
    orderValue: { type: Number, default: null, min: 0 },
    paymentType: { type: String, enum: [...PAYMENT_TYPE_VALUES, null], default: null },
    status: { type: String, enum: [...ORDER_STATUS_VALUES, null], default: null },
    rawStatus: { type: String, default: null }, // as written in the file, e.g. "In Transit"
    dispatchDate: { type: Date, default: null },
    expectedDeliveryDate: { type: Date, default: null },
    assignedEmployeeRaw: { type: String, default: null }, // as written in the file
    assignedTo: { type: ObjectId, ref: 'User', default: null },

    dataStatus: { type: String, enum: DATA_STATUS_VALUES, default: DATA_STATUS.VALID },
    dataIssues: { type: [dataIssueSchema], default: [] },
    raw: { type: rawRowSchema, default: undefined },

    // Hash of the normalised content: identical re-uploads are detected without comparing fields.
    sourceHash: { type: String, required: true },
    firstImportBatch: { type: ObjectId, ref: 'ImportBatch' },
    lastImportBatch: { type: ObjectId, ref: 'ImportBatch' },
  },
  { timestamps: true },
);

// Orders list filters: data bucket + status, employee's own orders, date range sorts.
orderSchema.index({ dataStatus: 1, status: 1 });
orderSchema.index({ assignedTo: 1, orderDate: -1 });
orderSchema.index({ orderDate: -1 });

orderSchema.plugin(toJSONPlugin);

export const Order = mongoose.model('Order', orderSchema);
