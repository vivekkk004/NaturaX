import { describe, it, expect } from 'vitest';
import {
  createEmployeeResolver,
  validateRow,
  validateRows,
} from '../../src/import/rowValidator.js';
import { ROW_OUTCOME } from '../../src/constants/importIssues.js';
import { istToDate } from '../../src/utils/dates.js';

const NOW = istToDate(2026, 10, 20, 18, 0); // 20-10-2026 18:00 IST, fixed "current time"

const employees = [
  {
    _id: 'u1',
    name: 'Priya Sharma',
    email: 'priya@naturax.in',
    employeeCode: 'EMP001',
    isActive: true,
  },
  {
    _id: 'u2',
    name: 'Rahul Verma',
    email: 'rahul@naturax.in',
    employeeCode: 'EMP002',
    isActive: true,
  },
  {
    _id: 'u3',
    name: 'Rahul Verma',
    email: 'rahul.v@naturax.in',
    employeeCode: 'EMP009',
    isActive: true,
  },
  {
    _id: 'u4',
    name: 'Old Staff',
    email: 'old@naturax.in',
    employeeCode: 'EMP099',
    isActive: false,
  },
];
const ctx = { now: NOW, resolveEmployee: createEmployeeResolver(employees) };

const validRow = {
  orderId: 'ORD-1001',
  orderDate: '19-10-2026 10:00',
  customerName: 'Ananya Iyer',
  phone: '+91 98765 43210',
  orderValue: '₹1,299',
  paymentType: 'COD',
  orderStatus: 'In Transit',
  dispatchDate: '19-10-2026 16:00',
  expectedDeliveryDate: '22-10-2026',
  assignedEmployee: 'EMP001',
};

const check = (overrides, rowNumber = 2) =>
  validateRow({ rowNumber, values: { ...validRow, ...overrides } }, ctx);
const codes = (result) => result.issues.map((i) => i.code);

describe('validateRow - a clean row', () => {
  it('normalises every field', () => {
    const r = check({});

    expect(r.hasErrors).toBe(false);
    expect(r.issues).toEqual([]);
    expect(r.data).toMatchObject({
      orderId: 'ORD-1001',
      phone: '9876543210',
      orderValue: 1299,
      paymentType: 'COD',
      status: 'DISPATCHED',
      rawStatus: 'In Transit',
      assignedTo: 'u1',
    });
    // date-only EDD -> end of that IST day
    expect(r.data.expectedDeliveryDate.toISOString()).toBe('2026-10-22T18:29:59.999Z');
  });
});

describe('validateRow - errors that send an order to "needs correction"', () => {
  it('reports every missing mandatory field', () => {
    const r = check({ customerName: '', phone: ' ', orderValue: null, assignedEmployee: '' });
    expect(r.hasErrors).toBe(true);
    expect(r.issues.filter((i) => i.code === 'MISSING_FIELD').map((i) => i.field)).toEqual([
      'Customer Name',
      'Phone Number',
      'Order Value',
      'Assigned Employee',
    ]);
  });

  it('rejects invalid and future dates', () => {
    expect(codes(check({ orderDate: '31-02-2026 10:00' }))).toContain('INVALID_DATE');
    expect(codes(check({ orderDate: '25-10-2026 10:00' }))).toContain('FUTURE_DATE');
  });

  it('rejects dates in the wrong order', () => {
    expect(codes(check({ dispatchDate: '18-10-2026 09:00' }))).toContain('DATE_SEQUENCE');
    expect(codes(check({ expectedDeliveryDate: '18-10-2026' }))).toContain('DATE_SEQUENCE');
  });

  it('compares a date-only dispatch on the same day as the order as valid', () => {
    expect(check({ dispatchDate: '19-10-2026' }).hasErrors).toBe(false);
  });

  it('requires the dates a status depends on', () => {
    const r = check({ dispatchDate: '', expectedDeliveryDate: '' });
    expect(r.issues.map((i) => i.message)).toEqual([
      'Dispatch Date is required when status is DISPATCHED',
      'Expected Delivery Date is required when status is DISPATCHED',
    ]);
  });

  it('flags a dispatch date on an order that claims not to be dispatched', () => {
    expect(codes(check({ orderStatus: 'Confirmed' }))).toContain('STATUS_DATE_CONFLICT');
  });

  it('rejects bad phone, amount, payment type and status values', () => {
    expect(codes(check({ phone: '12345' }))).toContain('INVALID_PHONE');
    expect(codes(check({ orderValue: 'abc' }))).toContain('INVALID_AMOUNT');
    expect(codes(check({ orderValue: '-50' }))).toContain('INVALID_AMOUNT');
    expect(codes(check({ paymentType: 'UPI-later' }))).toContain('INVALID_PAYMENT_TYPE');
    expect(codes(check({ orderStatus: 'Lost in space' }))).toContain('INVALID_STATUS');
  });
});

describe('validateRow - employee matching (warnings only)', () => {
  it('matches by code, email or name, case-insensitively', () => {
    expect(check({ assignedEmployee: 'emp001' }).data.assignedTo).toBe('u1');
    expect(check({ assignedEmployee: 'PRIYA@naturax.in' }).data.assignedTo).toBe('u1');
    expect(check({ assignedEmployee: 'priya sharma' }).data.assignedTo).toBe('u1');
  });

  it('warns but still imports for unknown, ambiguous or inactive employees', () => {
    for (const [name, code] of [
      ['Nobody', 'UNKNOWN_EMPLOYEE'],
      ['Rahul Verma', 'AMBIGUOUS_EMPLOYEE'],
      ['EMP099', 'INACTIVE_EMPLOYEE'],
    ]) {
      const r = check({ assignedEmployee: name });
      expect(r.hasErrors, name).toBe(false);
      expect(r.data.assignedTo, name).toBeNull();
      expect(r.issues[0]).toMatchObject({ code, severity: 'WARNING' });
    }
  });
});

describe('validateRows - duplicates within one file', () => {
  const row = (rowNumber, overrides = {}) => ({ rowNumber, values: { ...validRow, ...overrides } });

  it('keeps the first of identical duplicates and skips the rest', () => {
    const results = validateRows([row(2), row(3, { orderId: 'ord-1001' })], ctx);
    expect(results.map((r) => r.outcome)).toEqual([
      ROW_OUTCOME.IMPORTED,
      ROW_OUTCOME.SKIPPED_DUPLICATE,
    ]);
  });

  it('rejects every row of a conflicting duplicate', () => {
    const results = validateRows(
      [row(2), row(3, { orderValue: '999' }), row(4, { orderId: 'ORD-2' })],
      ctx,
    );
    expect(results.map((r) => r.outcome)).toEqual([
      ROW_OUTCOME.REJECTED,
      ROW_OUTCOME.REJECTED,
      ROW_OUTCOME.IMPORTED,
    ]);
    expect(results[0].issues.at(-1).message).toContain('rows 2, 3');
  });

  it('rejects rows without an order id and marks bad rows as needing correction', () => {
    const results = validateRows(
      [row(2, { orderId: '' }), row(3, { orderId: 'ORD-3', phone: 'x' })],
      ctx,
    );
    expect(results.map((r) => r.outcome)).toEqual([
      ROW_OUTCOME.REJECTED,
      ROW_OUTCOME.NEEDS_CORRECTION,
    ]);
  });
});
