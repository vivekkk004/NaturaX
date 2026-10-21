import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { ROLES } from '../../src/constants/roles.js';
import { AuditLog } from '../../src/models/AuditLog.js';
import { Task } from '../../src/models/Task.js';
import { useTestDatabase } from '../helpers/db.js';
import { createUser, loginAs } from '../helpers/auth.js';

useTestDatabase();
const app = createApp();

// Evaluated "as of" September 2026, so every task deadline is already in the past (overdue).
const ASOF = '2026-09-20T18:00';
const HEADER =
  'Order ID,Order Date,Customer Name,Phone Number,Order Value,Payment Type,Order Status,Dispatch Date,Expected Delivery Date,Assigned Employee';
const ROWS = [
  'A1,19-09-2026 10:00,Ananya Iyer,9876543210,1299,COD,Unconfirmed,,,EMP001',
  'A2,17-09-2026 09:00,Meena Das,9876543214,2150,COD,Delivery Failed,18-09-2026 10:00,19-09-2026,EMP001',
  'A3,17-09-2026 10:00,Farah Khan,9876543212,650,COD,Confirmed,,,EMP002',
  'A4,16-09-2026 10:00,Rohan Gupta,9876543213,7499,Prepaid,In Transit,17-09-2026 12:00,19-09-2026,EMP002',
  'A5,17-09-2026 11:00,Arvind Menon,9876543217,1800,COD,Undelivered,18-09-2026 09:00,19-09-2026,EMP777',
];

let manager;
let priya;
let rahul;
const taskOf = (orderId, ruleType) => Task.findOne({ orderId, ...(ruleType && { ruleType }) });
const get = (path, who = manager) => request(app).get(path).set(who.auth);
const patch = (path, body, who = manager) => request(app).patch(path).set(who.auth).send(body);

beforeEach(async () => {
  manager = await loginAs(app, ROLES.MANAGER, { employeeCode: 'MGR001', name: 'Meera Nair' });
  priya = await loginAs(app, ROLES.EMPLOYEE, { employeeCode: 'EMP001', name: 'Priya Sharma' });
  rahul = await loginAs(app, ROLES.EMPLOYEE, { employeeCode: 'EMP002', name: 'Rahul Verma' });
  await request(app)
    .post('/api/imports')
    .set(manager.auth)
    .field('asOf', ASOF)
    .attach('file', Buffer.from([HEADER, ...ROWS].join('\n')), 'orders.csv');
});

describe('GET /api/tasks - list, filter, sort, paginate', () => {
  it('returns the standard paginated shape with populated owner and computed isOverdue', async () => {
    const res = await get('/api/tasks?limit=2');

    expect(res.status).toBe(200);
    expect(res.body.pagination).toEqual({ page: 1, limit: 2, total: 6, totalPages: 3 });
    expect(res.body.data[0]).toMatchObject({ isOverdue: true, status: 'OPEN' });
    expect(res.body.data.some((t) => t.assignedTo?.name)).toBe(true);
  });

  it('filters by priority, rule, employee, unassigned, overdue and search', async () => {
    const ids = async (qs) =>
      (await get(`/api/tasks?${qs}&sort=orderId`)).body.data.map((t) => t.orderId);

    expect(await ids('priority=HIGH')).toEqual(['A2', 'A4', 'A5']);
    expect(await ids('ruleType=DISPATCH_DELAY')).toEqual(['A3']);
    expect(await ids(`assignedTo=${priya.user.id}`)).toEqual(['A1', 'A2']);
    expect(await ids('assignedTo=unassigned')).toEqual(['A5']);
    expect(await ids('overdue=true')).toHaveLength(6);
    expect(await ids('search=rohan')).toEqual(['A4', 'A4']);
    expect(await ids('status=RESOLVED')).toEqual([]);
  });

  it('sorts by priority HIGH first (not alphabetically)', async () => {
    const res = await get('/api/tasks?sort=priority&limit=100');
    const ranks = res.body.data.map((t) => t.priorityRank);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b)); // 1 HIGH, 2 MEDIUM, 3 LOW
    expect(res.body.data.slice(0, 3).map((t) => t.priority)).toEqual(['HIGH', 'HIGH', 'HIGH']);
  });

  it('limits employees to their own tasks, whatever they ask for', async () => {
    const own = await get(`/api/tasks?assignedTo=${rahul.user.id}`, priya);
    expect(own.body.data.map((t) => t.orderId).sort()).toEqual(['A1', 'A2']);

    const rahulsTask = await taskOf('A3');
    expect((await get(`/api/tasks/${rahulsTask.id}`, priya)).status).toBe(404);
    expect(
      (await patch(`/api/tasks/${rahulsTask.id}/status`, { status: 'RESOLVED' }, priya)).status,
    ).toBe(404);
  });
});

describe('PATCH /api/tasks/:id/status', () => {
  it('lets an employee work their task through to resolved, auditing every step', async () => {
    const task = await taskOf('A1');

    const start = await patch(`/api/tasks/${task.id}/status`, { status: 'IN_PROGRESS' }, priya);
    const done = await patch(
      `/api/tasks/${task.id}/status`,
      { status: 'RESOLVED', note: 'Customer confirmed on call' },
      priya,
    );

    expect(start.body.data.status).toBe('IN_PROGRESS');
    expect(done.body.data).toMatchObject({
      status: 'RESOLVED',
      resolutionNote: 'Customer confirmed on call',
      resolvedBy: { name: 'Priya Sharma' },
      isOverdue: false,
    });
    const history = (await get(`/api/tasks/${task.id}/audit`, priya)).body.data;
    expect(history.map((h) => h.action)).toEqual([
      'TASK_CREATED',
      'TASK_ASSIGNED',
      'STATUS_CHANGED',
      'STATUS_CHANGED',
    ]);
    expect(history[3]).toMatchObject({
      performedByName: 'Priya Sharma',
      oldValue: { status: 'IN_PROGRESS' },
      newValue: { status: 'RESOLVED' },
      note: 'Customer confirmed on call',
    });
  });

  it('only a manager can reopen a resolved task', async () => {
    const task = await taskOf('A1');
    await patch(`/api/tasks/${task.id}/status`, { status: 'RESOLVED' }, priya);

    const byEmployee = await patch(`/api/tasks/${task.id}/status`, { status: 'OPEN' }, priya);
    const byManager = await patch(`/api/tasks/${task.id}/status`, { status: 'OPEN' });

    expect(byEmployee.status).toBe(400);
    expect(byEmployee.body.error.message).toBe('Only a manager can reopen a resolved task');
    expect(byManager.body.data).toMatchObject({
      status: 'OPEN',
      resolvedAt: null,
      resolvedBy: null,
    });
  });

  it('rejects a no-op change and invalid statuses', async () => {
    const task = await taskOf('A1');
    expect((await patch(`/api/tasks/${task.id}/status`, { status: 'OPEN' })).status).toBe(400);
    expect((await patch(`/api/tasks/${task.id}/status`, { status: 'DONE' })).status).toBe(400);
  });
});

describe('PATCH /api/tasks/:id/assign - live challenge 5 (reassign an overdue task)', () => {
  it('moves the task to the new owner with a fresh deadline, keeps the SLA breach and audits old -> new', async () => {
    const task = await taskOf('A2'); // Priya's failed-delivery task, overdue since September
    const before = Date.now();

    const res = await patch(`/api/tasks/${task.id}/assign`, {
      assignedTo: rahul.user.id,
      note: 'Priya on leave',
    });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      assignedTo: { name: 'Rahul Verma' },
      slaBreached: true,
      isOverdue: false,
      status: 'OPEN',
    });
    const deadline = new Date(res.body.data.deadline).getTime();
    expect(deadline).toBeGreaterThan(before + 3.9 * 3600_000); // failed delivery rule: 4h
    expect(deadline).toBeLessThan(before + 4.1 * 3600_000);

    const audit = await AuditLog.findOne({ task: task._id, action: 'REASSIGNED' }).lean();
    expect(audit).toMatchObject({
      performedByName: 'Meera Nair',
      oldValue: { name: 'Priya Sharma', overdue: true },
      newValue: { name: 'Rahul Verma', employeeCode: 'EMP002' },
    });
    expect(audit.note).toMatch(
      /^Priya on leave \| Task was overdue by .+; SLA breach kept on record$/,
    );

    // The task moved with it: Rahul can see and work it, Priya no longer can.
    expect((await get(`/api/tasks/${task.id}`, rahul)).status).toBe(200);
    expect((await get(`/api/tasks/${task.id}`, priya)).status).toBe(404);
  });

  it('records the first assignment of an unassigned task as TASK_ASSIGNED and honours an explicit deadline', async () => {
    const task = await taskOf('A5');
    // whole seconds: deadlines are stored with second precision
    const deadline = new Date(Math.floor(Date.now() / 1000) * 1000 + 48 * 3600_000).toISOString();

    const res = await patch(`/api/tasks/${task.id}/assign`, {
      assignedTo: priya.user.id,
      deadline,
    });

    expect(new Date(res.body.data.deadline).toISOString()).toBe(deadline);
    const audit = await AuditLog.findOne({ task: task._id, performedByName: 'Meera Nair' }).lean();
    expect(audit).toMatchObject({ action: 'TASK_ASSIGNED', oldValue: { name: 'Unassigned' } });
  });

  it('refuses invalid reassignments', async () => {
    const task = await taskOf('A1');
    const inactive = await createUser({ employeeCode: 'EMP099', isActive: false });

    const samePerson = await patch(`/api/tasks/${task.id}/assign`, { assignedTo: priya.user.id });
    const deactivated = await patch(`/api/tasks/${task.id}/assign`, { assignedTo: inactive.id });
    const pastDeadline = await patch(`/api/tasks/${task.id}/assign`, {
      assignedTo: rahul.user.id,
      deadline: '2020-01-01T10:00',
    });
    const byEmployee = await patch(
      `/api/tasks/${task.id}/assign`,
      { assignedTo: rahul.user.id },
      priya,
    );

    expect(samePerson.status).toBe(400);
    expect(deactivated.status).toBe(400);
    expect(pastDeadline.status).toBe(400);
    expect(byEmployee.status).toBe(403);

    await patch(`/api/tasks/${task.id}/status`, { status: 'RESOLVED' });
    expect(
      (await patch(`/api/tasks/${task.id}/assign`, { assignedTo: rahul.user.id })).status,
    ).toBe(400);
  });

  it('is atomic: if the audit entry cannot be written, the reassignment is rolled back', async () => {
    const task = await taskOf('A2');
    const spy = vi.spyOn(AuditLog, 'insertMany').mockRejectedValueOnce(new Error('disk full'));

    const res = await patch(`/api/tasks/${task.id}/assign`, { assignedTo: rahul.user.id });

    expect(res.status).toBe(500);
    expect((await taskOf('A2')).assignedTo.toString()).toBe(priya.user.id);
    spy.mockRestore();
  });
});

describe('GET /api/audit', () => {
  it('filters the trail for managers', async () => {
    const res = await get('/api/audit?orderId=A2&sort=createdAt');
    expect(res.body.data.map((e) => e.action)).toEqual(['TASK_CREATED', 'TASK_ASSIGNED']);

    const created = await get('/api/audit?action=TASK_CREATED');
    expect(created.body.pagination.total).toBe(6);
  });

  it('shows employees only the history of their own tasks', async () => {
    await patch('/api/rules/DISPATCH_DELAY', { params: { thresholdHours: 12 } });

    const res = await get('/api/audit?limit=100', priya);

    expect(new Set(res.body.data.map((e) => e.orderId))).toEqual(new Set(['A1', 'A2']));
    expect(res.body.data.some((e) => e.action === 'RULE_UPDATED')).toBe(false);
  });
});
