import crypto from 'node:crypto';
import { NOT_YET_DISPATCHED, REQUIRED_DATES_BY_STATUS } from '../constants/order.js';
import { ISSUE, ROW_OUTCOME, SEVERITY } from '../constants/importIssues.js';
import { endOfIstDay, istDayKey, parseDateValue } from '../utils/dates.js';
import { COLUMN_LABELS } from './columns.js';
import {
  isBlank,
  normalizeAmount,
  normalizeOrderId,
  normalizePaymentType,
  normalizePhone,
  normalizeStatus,
  normalizeText,
  ORDER_ID_PATTERN,
} from './normalizers.js';

/**
 * PURE validation of import rows: no database, no clock (`now` is passed in).
 * That makes every rule here unit-testable with plain objects.
 */

const MANDATORY_FIELDS = [
  'orderId',
  'orderDate',
  'customerName',
  'phone',
  'orderValue',
  'paymentType',
  'orderStatus',
  'assignedEmployee',
];
const MAX_ORDER_VALUE = 10_000_000;
const CLOCK_SKEW_MS = 5 * 60 * 1000; // tolerate small clock differences for "future date" checks
const DATE_HINT = 'expected DD-MM-YYYY HH:mm or YYYY-MM-DD HH:mm';

const issue = (field, code, message, severity = SEVERITY.ERROR) => ({
  field: field ? COLUMN_LABELS[field] : null,
  code,
  message,
  severity,
});

/** Stringifies a cell for storage/display in the correction screen. */
function rawToString(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 16).replace('T', ' ');
  return String(value).trim();
}

/**
 * Builds a resolver for the "Assigned Employee" column. Matches employee code, email or full
 * name (case-insensitive). A name shared by two people is ambiguous and is not guessed.
 */
export function createEmployeeResolver(users) {
  const byKey = new Map();
  const add = (key, user) => {
    const k = key?.trim().toLowerCase();
    if (!k) return;
    byKey.set(k, byKey.has(k) && byKey.get(k) !== user ? 'AMBIGUOUS' : user);
  };
  for (const user of users) {
    add(user.employeeCode, user);
    add(user.email, user);
    add(user.name, user);
  }

  return (text) => {
    const match = byKey.get(text.trim().toLowerCase());
    if (!match) {
      return {
        user: null,
        issue: issue(
          'assignedEmployee',
          ISSUE.UNKNOWN_EMPLOYEE,
          `Employee "${text}" not found - task will be unassigned until a manager assigns it`,
          SEVERITY.WARNING,
        ),
      };
    }
    if (match === 'AMBIGUOUS') {
      return {
        user: null,
        issue: issue(
          'assignedEmployee',
          ISSUE.AMBIGUOUS_EMPLOYEE,
          `"${text}" matches more than one employee - use the employee code instead`,
          SEVERITY.WARNING,
        ),
      };
    }
    if (!match.isActive) {
      return {
        user: null,
        issue: issue(
          'assignedEmployee',
          ISSUE.INACTIVE_EMPLOYEE,
          `Employee "${text}" is deactivated - task will be unassigned`,
          SEVERITY.WARNING,
        ),
      };
    }
    return { user: match, issue: null };
  };
}

/** a < b, compared by exact time when both carry a time, otherwise by IST calendar day. */
function isBefore(a, b) {
  if (a.hasTime && b.hasTime) return a.date < b.date;
  return istDayKey(a.date) < istDayKey(b.date);
}

/**
 * Validates and normalises one row.
 * @param {{ rowNumber: number, values: Record<string, any> }} row values keyed by canonical field
 * @param {{ now: Date, resolveEmployee: Function }} ctx
 */
export function validateRow(row, { now, resolveEmployee }) {
  const v = row.values;
  const issues = [];
  const raw = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, rawToString(val)]));

  for (const field of MANDATORY_FIELDS) {
    if (isBlank(v[field])) {
      issues.push(issue(field, ISSUE.MISSING_FIELD, `${COLUMN_LABELS[field]} is required`));
    }
  }

  // --- Order ID (the business key) ---
  const orderId = normalizeOrderId(v.orderId);
  if (orderId && !ORDER_ID_PATTERN.test(orderId)) {
    issues.push(
      issue(
        'orderId',
        ISSUE.INVALID_ORDER_ID,
        `Order ID "${raw.orderId}" contains invalid characters or is longer than 50`,
      ),
    );
  }

  // --- Simple fields ---
  const customerName = normalizeText(v.customerName);
  if (customerName && (customerName.length > 100 || !/\p{L}/u.test(customerName))) {
    issues.push(
      issue(
        'customerName',
        ISSUE.INVALID_TEXT,
        'Customer Name must contain letters and be at most 100 characters',
      ),
    );
  }

  const phone = normalizePhone(v.phone);
  if (!isBlank(v.phone) && !phone) {
    issues.push(
      issue(
        'phone',
        ISSUE.INVALID_PHONE,
        `Phone Number "${raw.phone}" is not a valid 10-digit Indian mobile number`,
      ),
    );
  }

  const orderValue = normalizeAmount(v.orderValue);
  if (!isBlank(v.orderValue)) {
    if (orderValue === null) {
      issues.push(
        issue(
          'orderValue',
          ISSUE.INVALID_AMOUNT,
          `Order Value "${raw.orderValue}" is not a number`,
        ),
      );
    } else if (orderValue <= 0 || orderValue > MAX_ORDER_VALUE) {
      issues.push(
        issue(
          'orderValue',
          ISSUE.INVALID_AMOUNT,
          `Order Value ${orderValue} must be greater than 0 and at most ${MAX_ORDER_VALUE}`,
        ),
      );
    }
  }

  const paymentType = normalizePaymentType(v.paymentType);
  if (!isBlank(v.paymentType) && !paymentType) {
    issues.push(
      issue(
        'paymentType',
        ISSUE.INVALID_PAYMENT_TYPE,
        `Payment Type "${raw.paymentType}" must be Prepaid or COD`,
      ),
    );
  }

  const status = normalizeStatus(v.orderStatus);
  if (!isBlank(v.orderStatus) && !status) {
    issues.push(
      issue(
        'orderStatus',
        ISSUE.INVALID_STATUS,
        `Order Status "${raw.orderStatus}" is not recognised`,
      ),
    );
  }

  // --- Dates ---
  const parseDate = (field) => {
    if (isBlank(v[field])) return null;
    const parsed = parseDateValue(v[field]);
    if (!parsed) {
      issues.push(
        issue(
          field,
          ISSUE.INVALID_DATE,
          `${COLUMN_LABELS[field]} "${raw[field]}" is not a valid date (${DATE_HINT})`,
        ),
      );
      return null;
    }
    if (field !== 'expectedDeliveryDate' && parsed.date.getTime() > now.getTime() + CLOCK_SKEW_MS) {
      issues.push(
        issue(field, ISSUE.FUTURE_DATE, `${COLUMN_LABELS[field]} "${raw[field]}" is in the future`),
      );
      return null;
    }
    return parsed;
  };
  const orderDate = parseDate('orderDate');
  const dispatchDate = parseDate('dispatchDate');
  const expectedDelivery = parseDate('expectedDeliveryDate');

  if (orderDate && dispatchDate && isBefore(dispatchDate, orderDate)) {
    issues.push(issue('dispatchDate', ISSUE.DATE_SEQUENCE, 'Dispatch Date is before Order Date'));
  }
  if (expectedDelivery) {
    const reference = dispatchDate ?? orderDate;
    if (reference && istDayKey(expectedDelivery.date) < istDayKey(reference.date)) {
      issues.push(
        issue(
          'expectedDeliveryDate',
          ISSUE.DATE_SEQUENCE,
          `Expected Delivery Date is before ${dispatchDate ? 'Dispatch' : 'Order'} Date`,
        ),
      );
    }
  }

  // --- Status-dependent requirements ---
  if (status) {
    for (const field of REQUIRED_DATES_BY_STATUS[status]) {
      if (isBlank(v[field])) {
        issues.push(
          issue(
            field,
            ISSUE.MISSING_FIELD,
            `${COLUMN_LABELS[field]} is required when status is ${status}`,
          ),
        );
      }
    }
    if (NOT_YET_DISPATCHED.includes(status) && !isBlank(v.dispatchDate)) {
      issues.push(
        issue(
          'dispatchDate',
          ISSUE.STATUS_DATE_CONFLICT,
          `Order has a Dispatch Date but its status is ${status} - which one is correct?`,
        ),
      );
    }
  }

  // --- Employee (unknown employee is only a warning: the task goes to an unassigned queue) ---
  const assignedEmployeeRaw = normalizeText(v.assignedEmployee);
  let assignedTo = null;
  if (assignedEmployeeRaw) {
    const resolved = resolveEmployee(assignedEmployeeRaw);
    assignedTo = resolved.user;
    if (resolved.issue) issues.push(resolved.issue);
  }

  const hasErrors = issues.some((i) => i.severity === SEVERITY.ERROR);
  return {
    rowNumber: row.rowNumber,
    orderId,
    rejected: !orderId || issues.some((i) => i.code === ISSUE.INVALID_ORDER_ID),
    hasErrors,
    issues,
    raw,
    data: {
      orderId,
      orderDate: orderDate?.date ?? null,
      customerName,
      phone,
      orderValue: orderValue !== null && orderValue > 0 ? orderValue : null,
      paymentType,
      status,
      rawStatus: normalizeText(v.orderStatus),
      dispatchDate: dispatchDate?.date ?? null,
      // A date-only EDD means "by the end of that day", so the delay starts the next day.
      expectedDeliveryDate: expectedDelivery
        ? expectedDelivery.hasTime
          ? expectedDelivery.date
          : endOfIstDay(expectedDelivery.date)
        : null,
      assignedEmployeeRaw,
      assignedTo: assignedTo?._id ?? null,
    },
  };
}

/** Stable fingerprint of a row's raw content, used to tell exact duplicates from conflicting ones. */
function fingerprint(raw) {
  const ordered = Object.keys(raw)
    .sort()
    .map((k) => `${k}=${raw[k].toLowerCase()}`);
  return crypto.createHash('sha1').update(ordered.join('|')).digest('hex');
}

/**
 * Validates every row and resolves duplicates *within the file*:
 *  - same Order ID, identical content  -> keep the first row, skip the rest (warning)
 *  - same Order ID, different content -> reject ALL of them: we cannot know which is correct
 * Each result gets an `outcome`: IMPORTED | NEEDS_CORRECTION | REJECTED | SKIPPED_DUPLICATE.
 */
export function validateRows(rows, ctx) {
  const results = rows.map((row) => validateRow(row, ctx));

  const groups = new Map();
  for (const result of results) {
    if (!result.orderId) continue;
    if (!groups.has(result.orderId)) groups.set(result.orderId, []);
    groups.get(result.orderId).push(result);
  }

  for (const [orderId, group] of groups) {
    if (group.length < 2) continue;
    const rowList = group.map((r) => r.rowNumber).join(', ');
    const identical = new Set(group.map((r) => fingerprint(r.raw))).size === 1;

    group.forEach((result, index) => {
      if (identical && index === 0) return;
      if (identical) {
        result.skipped = true;
        result.issues.push(
          issue(
            'orderId',
            ISSUE.DUPLICATE_ROW,
            `Order ID ${orderId} repeated with identical data (rows ${rowList}) - kept the first row`,
            SEVERITY.WARNING,
          ),
        );
      } else {
        result.rejected = true;
        result.issues.push(
          issue(
            'orderId',
            ISSUE.DUPLICATE_IN_FILE,
            `Order ID ${orderId} appears in rows ${rowList} with different data - all rejected, fix and re-upload`,
          ),
        );
      }
    });
  }

  for (const result of results) {
    result.outcome = result.skipped
      ? ROW_OUTCOME.SKIPPED_DUPLICATE
      : result.rejected
        ? ROW_OUTCOME.REJECTED
        : result.hasErrors
          ? ROW_OUTCOME.NEEDS_CORRECTION
          : ROW_OUTCOME.IMPORTED;
  }
  return results;
}
