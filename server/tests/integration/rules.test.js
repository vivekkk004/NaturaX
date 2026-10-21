import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ROLES } from '../../src/constants/roles.js';
import { Task } from '../../src/models/Task.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { runRuleEvaluation } from '../../src/modules/rules/ruleEvaluation.service.js';
import { istToDate } from '../../src/utils/dates.js';
import { useTestDatabase } from '../helpers/db.js';
import { createUser, loginAs } from '../helpers/auth.js';

useTestDatabase();
const app = createApp();
const ASOF = '2026-10-20T18:00'; // IST

const HEADER =
  'Order ID,Order Date,Customer Name,Phone Number,Order Value,Payment Type,Order Status,Dispatch Date,Expected Delivery Date,Assigned Employee';
const ROWS = {
  U1: 'U1,19-10-2026 10:00,Ananya Iyer,9876543210,1299,COD,Unconfirmed,,,EMP001', // > 2h unconfirmed
  C1: 'C1,20-10-2026 03:00,Vikram Singh,9876543211,899,Prepaid,Confirmed,,,EMP001', // 15h, not yet 24h
  C2: 'C2,18-10-2026 10:00,Farah Khan,9876543212,650,COD,Confirmed,,,EMP002', // 56h -> dispatch delay
  S1: 'S1,16-10-2026 10:00,Rohan Gupta,9876543213,7499,Prepaid,In Transit,17-10-2026 12:00,19-10-2026,EMP002', // late + high value
  F1: 'F1,17-10-2026 09:00,Meena Das,9876543214,2150,COD,Delivery Failed,18-10-2026 10:00,19-10-2026,EMP001',
  OK: 'OK,15-10-2026 09:00,Kiran Rao,9876543215,450,Prepaid,Delivered,15-10-2026 18:00,17-10-2026,EMP002',
  BAD: 'BAD,18-10-2026 09:00,Suresh Nair,12345,999,COD,Confirmed,,,EMP001', // invalid phone
  X1: 'X1,20-10-2026 17:00,Pooja Desai,9876543216,560,COD,Unconfirmed,,,EMP002', // only 1h old
  UNK: 'UNK,17-10-2026 11:00,Arvind Menon,9876543217,1800,COD,Undelivered,18-10-2026 09:00,19-10-2026,EMP777',
};
const csv = (rows) => [HEADER, ...rows].join('\n');
const ALL = Object.values(ROWS);

let manager;
let priya;
beforeEach(async () => {
  manager = await loginAs(app, ROLES.MANAGER, { employeeCode: 'MGR001', name: 'Meera Nair' });
  priya = await createUser({ employeeCode: 'EMP001', name: 'Priya Sharma' });
  await createUser({ employeeCode: 'EMP002', name: 'Rahul Verma' });
});

const upload = (rows, asOf = ASOF) =>
  request(app)
    .post('/api/imports')
    .set(manager.auth)
    .field('asOf', asOf)
    .attach('file', Buffer.from(csv(rows)), 'orders.csv');
const evaluateAt = (asOf) =>
  request(app).post('/api/rules/evaluate').set(manager.auth).send({ asOf });
const taskKeys = async (filter = {}) =>
  (await Task.find(filter).sort({ orderId: 1, ruleType: 1 }).lean()).map(
    (t) => `${t.orderId}:${t.ruleType}`,
  );

describe('import -> rule engine -> tasks', () => {
  it('creates one task per (order, rule) with reason, priority, action, deadline and owner', async () => {
    const res = await upload(ALL);

    expect(res.status).toBe(201);
    expect(res.body.data.taskSummary).toMatchObject({
      created: 7,
      createdByRule: {
        UNCONFIRMED_ORDER: 1,
        DISPATCH_DELAY: 1,
        SHIPMENT_DELAY: 1,
        HIGH_VALUE_DELAY: 1,
        FAILED_DELIVERY: 2,
        DATA_CORRECTION: 1,
      },
    });
    expect(await taskKeys()).toEqual([
      'BAD:DATA_CORRECTION',
      'C2:DISPATCH_DELAY',
      'F1:FAILED_DELIVERY',
      'S1:HIGH_VALUE_DELAY',
      'S1:SHIPMENT_DELAY',
      'U1:UNCONFIRMED_ORDER',
      'UNK:FAILED_DELIVERY',
    ]);

    const u1 = await Task.findOne({ orderId: 'U1' }).lean();
    expect(u1).toMatchObject({
      status: 'OPEN',
      priority: 'MEDIUM',
      reason: 'Order unconfirmed for 1d 8h (limit 2h)',
      customer: { name: 'Ananya Iyer', phone: '9876543210' },
    });
    expect(u1.assignedTo.toString()).toBe(priya.id);
    expect(u1.deadline.toISOString()).toBe('2026-10-20T16:30:00.000Z'); // 18:00 IST + 4h

    expect((await Task.findOne({ orderId: 'UNK' })).assignedTo).toBeNull(); // unassigned queue
  });

  it('audits every creation and assignment', async () => {
    await upload(ALL);

    expect(await AuditLog.countDocuments({ action: 'TASK_CREATED' })).toBe(7);
    const assigned = await AuditLog.findOne({ action: 'TASK_ASSIGNED', orderId: 'U1' }).lean();
    expect(assigned).toMatchObject({
      performedByName: 'Meera Nair',
      oldValue: { assignedTo: null },
      newValue: { name: 'Priya Sharma', employeeCode: 'EMP001' },
    });
  });
});

describe('idempotency - live challenge 4', () => {
  it('uploading the same file again creates no tasks and no audit entries', async () => {
    await upload(ALL);
    const auditsBefore = await AuditLog.countDocuments();

    const again = await upload(ALL);

    expect(again.body.data.taskSummary).toMatchObject({ created: 0, reopened: 0, autoResolved: 0 });
    expect(await Task.countDocuments()).toBe(7);
    expect(await AuditLog.countDocuments()).toBe(auditsBefore);
  });

  it('concurrent evaluations still produce exactly one task per (order, rule)', async () => {
    await upload(ALL);
    await Task.deleteMany({});

    await Promise.all([
      runRuleEvaluation({ now: istToDate(2026, 10, 20, 18, 0) }), // same instant as ASOF, any machine TZ
      evaluateAt(ASOF),
      evaluateAt(ASOF),
    ]);

    expect(await Task.countDocuments()).toBe(7);
  });
});

describe('configurable rules - live challenge 3 (24h -> 12h)', () => {
  it('one PATCH changes the dispatch rule; the next evaluation applies it; the change is audited', async () => {
    await upload(ALL);
    expect(await taskKeys({ ruleType: 'DISPATCH_DELAY' })).toEqual(['C2:DISPATCH_DELAY']);

    const patch = await request(app)
      .patch('/api/rules/DISPATCH_DELAY')
      .set(manager.auth)
      .send({ params: { thresholdHours: 12 } });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({
      ruleType: 'DISPATCH_DELAY',
      params: { thresholdHours: 12 },
    });

    const run = await evaluateAt(ASOF);
    expect(run.body.data.createdByRule).toEqual({ DISPATCH_DELAY: 1 });
    expect(await taskKeys({ ruleType: 'DISPATCH_DELAY' })).toEqual([
      'C1:DISPATCH_DELAY',
      'C2:DISPATCH_DELAY',
    ]);

    const audit = await AuditLog.findOne({ action: 'RULE_UPDATED' }).lean();
    expect(audit).toMatchObject({
      ruleType: 'DISPATCH_DELAY',
      oldValue: { params: { thresholdHours: 24 } },
      newValue: { params: { thresholdHours: 12 } },
      performedByName: 'Meera Nair',
    });
  });

  it('loosening a rule does not silently close tasks someone is working on', async () => {
    await upload(ALL);
    await request(app)
      .patch('/api/rules/DISPATCH_DELAY')
      .set(manager.auth)
      .send({ params: { thresholdHours: 100 } });

    await evaluateAt(ASOF);

    expect((await Task.findOne({ orderId: 'C2' })).status).toBe('OPEN');
  });

  it('validates rule changes and restricts them to managers', async () => {
    const employee = await loginAs(app, ROLES.EMPLOYEE, { employeeCode: 'EMP050' });

    const unknownParam = await request(app)
      .patch('/api/rules/DISPATCH_DELAY')
      .set(manager.auth)
      .send({ params: { hours: 12 } });
    const negative = await request(app)
      .patch('/api/rules/DISPATCH_DELAY')
      .set(manager.auth)
      .send({ params: { thresholdHours: -5 } });
    const badType = await request(app).get('/api/rules/NOT_A_RULE').set(manager.auth);
    const asEmployee = await request(app)
      .patch('/api/rules/DISPATCH_DELAY')
      .set(employee.auth)
      .send({ enabled: false });

    expect(unknownParam.status).toBe(400);
    expect(negative.status).toBe(400);
    expect(negative.body.error.details[0].field).toBe('params.thresholdHours');
    expect(badType.status).toBe(400);
    expect(asEmployee.status).toBe(403);
  });

  it('lists all rules with their labels and editable parameters', async () => {
    const res = await request(app).get('/api/rules').set(manager.auth);

    expect(res.body.data.map((r) => r.ruleType)).toEqual([
      'UNCONFIRMED_ORDER',
      'DISPATCH_DELAY',
      'SHIPMENT_DELAY',
      'FAILED_DELIVERY',
      'HIGH_VALUE_DELAY',
      'DATA_CORRECTION',
    ]);
    expect(res.body.data[1]).toMatchObject({
      label: 'Dispatch delay',
      params: { thresholdHours: 24 },
      paramFields: [{ key: 'thresholdHours', unit: 'hours' }],
    });
  });
});

describe('task lifecycle across imports and time', () => {
  it('flags an order once enough time has passed, with no new file', async () => {
    await upload(ALL);
    expect(await taskKeys({ orderId: 'X1' })).toEqual([]);

    await evaluateAt('2026-10-20T20:00'); // X1 is now 3h unconfirmed

    expect(await taskKeys({ orderId: 'X1' })).toEqual(['X1:UNCONFIRMED_ORDER']);
  });

  it('auto-resolves tasks when a new file shows the problem is gone', async () => {
    await upload(ALL);
    const delivered = ROWS.S1.replace('In Transit', 'Delivered');

    const res = await upload([delivered], '2026-10-21T10:00');

    expect(res.body.data.taskSummary.autoResolved).toBe(2);
    const s1 = await Task.find({ orderId: 'S1' }).lean();
    expect(s1.map((t) => t.status)).toEqual(['RESOLVED', 'RESOLVED']);
    expect(s1[0].resolutionNote).toContain('order status now DELIVERED');
    expect(await AuditLog.countDocuments({ action: 'AUTO_RESOLVED', orderId: 'S1' })).toBe(2);
  });

  it('keeps a resolved task closed on re-upload, but reopens it if the data changes and the problem persists', async () => {
    await upload(ALL);
    await Task.updateOne(
      { orderId: 'F1' },
      { $set: { status: 'RESOLVED', resolvedAt: new Date() } },
    );

    await upload(ALL);
    expect((await Task.findOne({ orderId: 'F1' })).status).toBe('RESOLVED');

    const failedAgain = ROWS.F1.replace('18-10-2026 10:00', '19-10-2026 09:00'); // second attempt failed too
    const res = await upload([failedAgain]);

    expect(res.body.data.taskSummary.reopened).toBe(1);
    expect(await Task.findOne({ orderId: 'F1' })).toMatchObject({ status: 'OPEN', reopenCount: 1 });
    expect(await AuditLog.countDocuments({ action: 'REOPENED', orderId: 'F1' })).toBe(1);
  });

  it('resolves the data-correction task once the order is fixed, then applies the real rules', async () => {
    await upload(ALL);
    const fixed = ROWS.BAD.replace('12345', '9876543299');

    await upload([fixed]);

    expect(await Task.findOne({ orderId: 'BAD', ruleType: 'DATA_CORRECTION' })).toMatchObject({
      status: 'RESOLVED',
    });
    // 56h-old confirmed order with valid data now gets the dispatch-delay task
    expect(await Task.findOne({ orderId: 'BAD', ruleType: 'DISPATCH_DELAY' })).toMatchObject({
      status: 'OPEN',
    });
  });
});

describe('audit trail is append-only', () => {
  it('refuses to modify or delete entries through the model', async () => {
    await upload([ROWS.U1]);
    const entry = await AuditLog.findOne();

    await expect(AuditLog.updateOne({ _id: entry._id }, { note: 'x' })).rejects.toThrow(
      'append-only',
    );
    await expect(AuditLog.deleteMany({})).rejects.toThrow('append-only');
    entry.note = 'tampered';
    await expect(entry.save()).rejects.toThrow('append-only');
  });
});
