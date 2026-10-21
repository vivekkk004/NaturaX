import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { parse } from 'csv-parse/sync';
import { createApp } from '../../src/app.js';
import { ROLES } from '../../src/constants/roles.js';
import { useTestDatabase } from '../helpers/db.js';
import { loginAs } from '../helpers/auth.js';

useTestDatabase();
const app = createApp();

const ASOF = '2026-09-20T18:00'; // all deadlines fall in September -> every task is overdue now
const HEADER =
  'Order ID,Order Date,Customer Name,Phone Number,Order Value,Payment Type,Order Status,Dispatch Date,Expected Delivery Date,Assigned Employee';
const ROWS = [
  'A1,19-09-2026 10:00,Ananya Iyer,9876543210,1299,COD,Unconfirmed,,,EMP001', // UNCONFIRMED (M)
  'A2,17-09-2026 09:00,Meena Das,9876543214,2150,COD,Delivery Failed,18-09-2026 10:00,19-09-2026,EMP001', // FAILED (H)
  'A3,17-09-2026 10:00,Farah Khan,9876543212,650,COD,Confirmed,,,EMP002', // DISPATCH (M)
  'A4,16-09-2026 10:00,Rohan Gupta,9876543213,7499,Prepaid,In Transit,17-09-2026 12:00,19-09-2026,EMP002', // SHIPMENT (M) + HIGH VALUE (H)
  'A5,17-09-2026 11:00,Arvind Menon,9876543217,1800,COD,Undelivered,18-09-2026 09:00,19-09-2026,EMP777', // FAILED (H), unassigned
];

let manager;
let priya;
beforeEach(async () => {
  manager = await loginAs(app, ROLES.MANAGER, { employeeCode: 'MGR001', name: 'Meera Nair' });
  priya = await loginAs(app, ROLES.EMPLOYEE, { employeeCode: 'EMP001', name: 'Priya Sharma' });
  await loginAs(app, ROLES.EMPLOYEE, { employeeCode: 'EMP002', name: 'Rahul Verma' });
  await loginAs(app, ROLES.EMPLOYEE, { employeeCode: 'EMP003', name: 'Anjali Menon' }); // no tasks
  await request(app)
    .post('/api/imports')
    .set(manager.auth)
    .field('asOf', ASOF)
    .attach('file', Buffer.from([HEADER, ...ROWS].join('\n')), 'orders.csv');
});

const dashboard = (qs = '', who = manager) => request(app).get(`/api/dashboard${qs}`).set(who.auth);

describe('GET /api/dashboard', () => {
  it('returns every widget the PDF lists', async () => {
    const res = await dashboard();

    expect(res.status).toBe(200);
    expect(res.body.data.totals).toEqual({
      totalOrders: 5,
      needsCorrection: 0,
      ordersRequiringAttention: 5,
      openTasks: 6,
      inProgressTasks: 0,
      resolvedTasks: 0,
      unresolvedTasks: 6,
      overdueTasks: 6,
      highPriorityUnresolved: 3,
    });
    expect(res.body.data.byCategory.find((c) => c.ruleType === 'FAILED_DELIVERY')).toMatchObject({
      label: 'Failed delivery',
      total: 2,
      unresolved: 2,
      overdue: 2,
    });
    expect(res.body.data.byCategory).toHaveLength(6); // zero rows kept for a stable chart
    expect(res.body.data.byEmployee.map((e) => [e.name, e.total])).toEqual([
      ['Rahul Verma', 3],
      ['Priya Sharma', 2],
      ['Unassigned', 1],
      ['Anjali Menon', 0], // idle employees are shown too
    ]);
    expect(res.body.data.highPriorityCases).toHaveLength(3);
    expect(res.body.data.highPriorityCases[0]).toMatchObject({ isOverdue: true, priority: 'HIGH' });
    expect(res.body.data.lastImport.originalName).toBe('orders.csv');
  });

  it('filters by priority, exception type, employee and date', async () => {
    const high = (await dashboard('?priority=HIGH')).body.data.totals;
    expect(high).toMatchObject({ totalOrders: 5, unresolvedTasks: 3, ordersRequiringAttention: 3 });

    const failed = (await dashboard('?ruleType=FAILED_DELIVERY')).body.data.totals;
    expect(failed).toMatchObject({ unresolvedTasks: 2 });

    const priyaOnly = (await dashboard(`?assignedTo=${priya.user.id}`)).body.data;
    expect(priyaOnly.totals).toMatchObject({ totalOrders: 2, unresolvedTasks: 2 });
    expect(priyaOnly.byEmployee.map((e) => e.name)).toEqual(['Priya Sharma']);

    const unassigned = (await dashboard('?assignedTo=unassigned')).body.data.totals;
    expect(unassigned).toMatchObject({ totalOrders: 1, unresolvedTasks: 1 });

    const day = (await dashboard('?dateFrom=2026-09-17&dateTo=2026-09-17')).body.data.totals;
    expect(day).toMatchObject({ totalOrders: 3, unresolvedTasks: 3 });
  });

  it('shows an employee only their own numbers', async () => {
    const res = await dashboard('?assignedTo=unassigned', priya);

    expect(res.body.data.totals).toMatchObject({ totalOrders: 2, unresolvedTasks: 2 });
    expect(res.body.data.byEmployee.map((e) => e.name)).toEqual(['Priya Sharma']);
    expect(res.body.data.lastImport).toBeNull();
  });

  it('validates filters', async () => {
    expect((await dashboard('?priority=URGENT')).status).toBe(400);
    expect((await dashboard('?dateFrom=31-02-2026')).status).toBe(400);
  });
});

describe('daily exception report', () => {
  it('returns all five sections as JSON', async () => {
    const res = await request(app).get('/api/reports/daily?date=2026-09-20').set(manager.auth);

    expect(res.status).toBe(200);
    expect(res.body.data.date).toBe('2026-09-20');
    expect(res.body.data.sections.map((s) => [s.key, s.count])).toEqual([
      ['new', 6],
      ['unresolved', 6],
      ['overdue', 6],
      ['high-priority', 3],
    ]);
    expect(res.body.data.employeePending.map((e) => e.name)).toContain('Unassigned');

    const otherDay = await request(app).get('/api/reports/daily?date=2026-09-21').set(manager.auth);
    expect(otherDay.body.data.sections[0].count).toBe(0); // nothing newly detected that day
  });

  it('downloads a CSV with proper headers, BOM, all task sections and the employee summary', async () => {
    const res = await request(app)
      .get('/api/reports/daily/csv?date=2026-09-20')
      .set(manager.auth)
      .buffer(true)
      .parse((r, cb) => {
        let body = '';
        r.setEncoding('utf8');
        r.on('data', (chunk) => (body += chunk));
        r.on('end', () => cb(null, body));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="daily-exception-report-2026-09-20.csv"',
    );
    expect(res.body.startsWith('﻿')).toBe(true);

    const rows = parse(res.body, { bom: true, relax_column_count: true, skip_empty_lines: true });
    const sectionCount = (label) => rows.filter((r) => r[0] === label).length;
    expect(rows[0].slice(0, 4)).toEqual(['Section', 'Order ID', 'Exception', 'Priority']);
    expect(sectionCount('New exceptions')).toBe(6);
    expect(sectionCount('Unresolved exceptions')).toBe(6);
    expect(sectionCount('Overdue tasks')).toBe(6);
    expect(sectionCount('High-priority cases')).toBe(3);
    expect(rows.find((r) => r[0] === 'Section' && r[1] === 'Employee')).toBeTruthy();
    expect(
      rows.find((r) => r[1] === 'Unassigned' && r[0] === 'Employee-wise pending actions'),
    ).toEqual(['Employee-wise pending actions', 'Unassigned', '', '1', '0', '1', '1', '1']);
    const a4 = rows.find((r) => r[0] === 'High-priority cases' && r[1] === 'A4');
    expect(a4).toContain('High-value order delayed');
    expect(a4[a4.length - 3]).toBe('Yes'); // Overdue column
  });

  it('downloads a single section and restricts reports to managers', async () => {
    const overdue = await request(app)
      .get('/api/reports/daily/csv?date=2026-09-20&section=overdue')
      .set(manager.auth);
    const lines = overdue.text.trim().split(/\r?\n/);
    expect(lines).toHaveLength(7); // header + 6 overdue tasks
    expect(overdue.headers['content-disposition']).toContain('-overdue.csv');

    expect((await request(app).get('/api/reports/daily').set(priya.auth)).status).toBe(403);
    expect(
      (await request(app).get('/api/reports/daily/csv?section=bogus').set(manager.auth)).status,
    ).toBe(400);
  });
});
