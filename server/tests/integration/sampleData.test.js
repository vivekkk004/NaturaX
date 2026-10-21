import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ROLES } from '../../src/constants/roles.js';
import { Task } from '../../src/models/Task.js';
import { istToDate } from '../../src/utils/dates.js';
import { generateSampleOrders, toCsv, toXlsxBuffer } from '../../scripts/generateSampleData.js';
import { useTestDatabase } from '../helpers/db.js';
import { loginAs } from '../helpers/auth.js';

useTestDatabase();
const app = createApp();
const REFERENCE = istToDate(2026, 10, 20, 18, 0);
const ASOF = '2026-10-20T18:00';

let manager;
beforeEach(async () => {
  manager = await loginAs(app, ROLES.MANAGER, { employeeCode: 'MGR001' });
  for (const [code, name, email] of [
    ['EMP001', 'Priya Sharma', 'priya@naturax.in'],
    ['EMP002', 'Rahul Verma', 'rahul@naturax.in'],
    ['EMP003', 'Anjali Menon', 'anjali@naturax.in'],
    ['EMP004', 'Arjun Reddy', 'arjun@naturax.in'],
    ['EMP005', 'Sneha Patil', 'sneha@naturax.in'],
  ]) {
    await loginAs(app, ROLES.EMPLOYEE, { employeeCode: code, name, email });
  }
});

const upload = (buffer, name) =>
  request(app)
    .post('/api/imports')
    .set(manager.auth)
    .field('asOf', ASOF)
    .attach('file', buffer, name);

describe('generated sample data', () => {
  const sample = generateSampleOrders({ now: REFERENCE });

  it('has 100+ orders and is deterministic for the same reference time', () => {
    expect(sample.rows.length).toBeGreaterThanOrEqual(100);
    expect(generateSampleOrders({ now: REFERENCE }).rows).toEqual(sample.rows);
  });

  it.each([
    ['CSV', () => Buffer.from(toCsv(sample)), 'orders_sample.csv'],
    ['XLSX', () => toXlsxBuffer(sample), 'orders_sample.xlsx'],
  ])('produces exactly the documented results when imported (%s)', async (_label, build, name) => {
    const res = await upload(await build(), name);

    expect(res.status).toBe(201);
    expect(res.body.data.summary).toMatchObject({
      totalRows: sample.expected.rows,
      created: sample.expected.ordersStored,
      needsCorrection: sample.expected.needsCorrection,
      rejected: sample.expected.rejectedRows,
      duplicatesSkipped: sample.expected.duplicatesSkipped,
    });
    expect(res.body.data.taskSummary.createdByRule).toEqual(sample.expected.tasks);
    expect(await Task.countDocuments({ assignedTo: null })).toBe(sample.expected.unassignedTasks);
  });

  // Date-only delivery dates depend on day boundaries: the counts must not change with the hour.
  it.each([
    [0, 30, '2026-10-20T00:30'],
    [23, 50, '2026-10-20T23:50'],
  ])('gives the same task counts at %i:%i IST', async (hour, minute, asOf) => {
    const atTime = generateSampleOrders({ now: istToDate(2026, 10, 20, hour, minute) });
    const res = await request(app)
      .post('/api/imports')
      .set(manager.auth)
      .field('asOf', asOf)
      .attach('file', Buffer.from(toCsv(atTime)), 'orders_sample.csv');

    expect(res.body.data.taskSummary.createdByRule).toEqual(atTime.expected.tasks);
  });
});
