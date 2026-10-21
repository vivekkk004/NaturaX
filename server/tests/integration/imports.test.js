import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createApp } from '../../src/app.js';
import { SERVER_ROOT, UPLOAD_PATH } from '../../src/config/paths.js';
import { ROLES } from '../../src/constants/roles.js';
import { Order } from '../../src/models/Order.js';
import { ImportBatch } from '../../src/models/ImportBatch.js';
import { useTestDatabase } from '../helpers/db.js';
import { createUser, loginAs } from '../helpers/auth.js';

useTestDatabase();
const app = createApp();
const ASOF = '2026-10-20T18:00'; // fixed "now" (IST) so results never depend on the real clock

const HEADER =
  'Order ID,Order Date,Customer Name,Phone Number,Order Value,Payment Type,Order Status,Dispatch Date,Expected Delivery Date,Assigned Employee';
const csv = (...rows) => [HEADER, ...rows].join('\n');

const GOOD = 'ORD-1,19-10-2026 10:00,Ananya Iyer,9876543210,1299,Prepaid,Confirmed,,,EMP001';
const GOOD2 =
  'ORD-2,18-10-2026 09:00,Vikram Singh,+91 91234 56789,"₹7,499",COD,Shipped,18-10-2026 15:00,19-10-2026,EMP001';
const BAD_DATE = 'ORD-3,31-02-2026 10:00,Kiran Rao,9123456780,500,COD,Unconfirmed,,,EMP001';
const NO_ID = ',19-10-2026 10:00,No Id,9123456780,500,COD,Unconfirmed,,,EMP001';
const DUP_A = 'ORD-4,19-10-2026 11:00,Dup One,9123456781,800,COD,Unconfirmed,,,EMP001';
const DUP_B = 'ORD-4,19-10-2026 11:00,Dup Two,9123456781,900,COD,Unconfirmed,,,EMP001';
const UNKNOWN_EMP = 'ORD-5,19-10-2026 12:00,Meena Das,9123456782,650,Prepaid,Unconfirmed,,,EMP777';

let manager;
let employee;
beforeEach(async () => {
  manager = await loginAs(app, ROLES.MANAGER, { employeeCode: 'MGR001' });
  employee = await createUser({ employeeCode: 'EMP001', name: 'Priya Sharma' });
});

const upload = (content, name = 'orders.csv', auth = manager.auth) =>
  request(app)
    .post('/api/imports')
    .set(auth)
    .field('asOf', ASOF)
    .attach('file', Buffer.isBuffer(content) ? content : Buffer.from(content), name);

describe('POST /api/imports - a mixed CSV', () => {
  it('imports valid rows, buckets bad rows and reports every problem with its row number', async () => {
    const res = await upload(csv(GOOD, GOOD2, BAD_DATE, NO_ID, DUP_A, DUP_B, UNKNOWN_EMP));

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.summary).toMatchObject({
      totalRows: 7,
      created: 4, // ORD-1, ORD-2, ORD-3 (needs correction), ORD-5
      updated: 0,
      unchanged: 0,
      needsCorrection: 1,
      rejected: 3, // no id + both conflicting ORD-4 rows
      warnings: 1, // unknown employee
    });

    const issues = res.body.data.rowIssues;
    expect(issues.find((i) => i.row === 4)).toMatchObject({
      code: 'INVALID_DATE',
      outcome: 'NEEDS_CORRECTION',
    });
    expect(issues.find((i) => i.row === 5)).toMatchObject({
      code: 'MISSING_FIELD',
      field: 'Order ID',
      outcome: 'REJECTED',
    });
    expect(issues.filter((i) => i.code === 'DUPLICATE_IN_FILE').map((i) => i.row)).toEqual([6, 7]);
    expect(issues.find((i) => i.row === 8)).toMatchObject({
      code: 'UNKNOWN_EMPLOYEE',
      severity: 'WARNING',
    });

    const orders = await Order.find().sort({ orderId: 1 }).lean();
    expect(orders.map((o) => [o.orderId, o.dataStatus])).toEqual([
      ['ORD-1', 'VALID'],
      ['ORD-2', 'VALID'],
      ['ORD-3', 'NEEDS_CORRECTION'],
      ['ORD-5', 'VALID'],
    ]);
    expect(orders[1]).toMatchObject({
      status: 'DISPATCHED',
      orderValue: 7499,
      phone: '9123456789',
    });
    expect(orders[2].raw.orderDate).toBe('31-02-2026 10:00'); // original value kept for correction
    expect(orders[3].assignedTo).toBeNull();
  });

  it('stores the file on disk and only its path in the database', async () => {
    const res = await upload(csv(GOOD));
    const batch = await ImportBatch.findById(res.body.data.id).lean();

    expect(batch.filePath).toMatch(/^tests\/\.uploads\/\d+-[a-f0-9]{12}\.csv$/);
    expect(fs.readFileSync(path.resolve(SERVER_ROOT, batch.filePath), 'utf8')).toContain('ORD-1');
    expect(batch.originalName).toBe('orders.csv');

    const download = await request(app).get(`/api/imports/${batch._id}/file`).set(manager.auth);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('orders.csv');
  });
});

describe('re-uploading (idempotent orders)', () => {
  it('reports everything as unchanged when the same file is uploaded again', async () => {
    const file = csv(GOOD, GOOD2);
    await upload(file);
    const second = await upload(file);

    expect(second.body.data.summary).toMatchObject({ created: 0, updated: 0, unchanged: 2 });
    expect(await Order.countDocuments()).toBe(2);
  });

  it('treats formatting-only differences as unchanged and real changes as updates', async () => {
    await upload(csv(GOOD, GOOD2));
    const reformatted = GOOD2.replace('"₹7,499"', '7499.00');
    const delivered = GOOD.replace('Confirmed,,', 'Delivered,19-10-2026 18:00,');

    const res = await upload(csv(delivered, reformatted));

    expect(res.body.data.summary).toMatchObject({ created: 0, updated: 1, unchanged: 1 });
    expect((await Order.findOne({ orderId: 'ORD-1' })).status).toBe('DELIVERED');
  });

  it('never lets an invalid row overwrite a valid stored order', async () => {
    await upload(csv(GOOD));
    const res = await upload(csv(GOOD.replace('9876543210', 'not-a-phone')));

    expect(res.body.data.summary).toMatchObject({
      needsCorrection: 1,
      keptPreviousValid: 1,
      updated: 0,
    });
    expect(res.body.data.rowIssues.map((i) => i.code)).toContain('KEPT_PREVIOUS_VALID_DATA');
    expect(await Order.findOne({ orderId: 'ORD-1' })).toMatchObject({
      dataStatus: 'VALID',
      phone: '9876543210',
    });
  });
});

describe('Excel (.xlsx) upload', () => {
  it('parses real date cells and numeric cells', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Orders');
    sheet.addRow(HEADER.split(','));
    // ExcelJS date cells carry the wall-clock time in UTC fields
    sheet.addRow(['ORD-X1', new Date(Date.UTC(2026, 9, 19, 10, 0)), 'Farah Khan', 9876501234, 5600, 'prepaid',
      'Dispatched', new Date(Date.UTC(2026, 9, 19, 17, 0)), new Date(Date.UTC(2026, 9, 21)), 'Priya Sharma']); // prettier-ignore
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const res = await upload(buffer, 'orders.xlsx');

    expect(res.status).toBe(201);
    expect(res.body.data.summary).toMatchObject({ created: 1, needsCorrection: 0 });
    const order = await Order.findOne({ orderId: 'ORD-X1' });
    expect(order.orderDate.toISOString()).toBe('2026-10-19T04:30:00.000Z'); // 10:00 IST
    expect(order.assignedTo.toString()).toBe(employee.id);
  });
});

describe('file-level errors', () => {
  it('fails the whole import when required columns are missing, but records the attempt', async () => {
    const res = await upload('Order ID,Customer Name\nORD-1,Test');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('missing required column(s)');
    expect(res.body.error.details.missingColumns).toContain('Order Date');
    const batch = await ImportBatch.findById(res.body.error.details.importBatchId);
    expect(batch).toMatchObject({ status: 'FAILED' });
  });

  it('rejects disallowed extensions without leaving a file behind', async () => {
    const before = fs.existsSync(UPLOAD_PATH) ? fs.readdirSync(UPLOAD_PATH).length : 0;
    const res = await upload('hello', 'orders.txt');

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('Only .csv and .xlsx');
    expect(fs.existsSync(UPLOAD_PATH) ? fs.readdirSync(UPLOAD_PATH).length : 0).toBe(before);
  });

  it('detects a file whose content does not match its extension', async () => {
    const res = await upload(csv(GOOD), 'orders.xlsx');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('File content does not match its extension');
  });

  it('rejects an empty file and a missing file', async () => {
    expect((await upload(HEADER)).body.error.message).toContain('no data rows');
    const none = await request(app).post('/api/imports').set(manager.auth);
    expect(none.status).toBe(400);
  });

  it('validates the asOf field and cleans up the uploaded file', async () => {
    const before = fs.existsSync(UPLOAD_PATH) ? fs.readdirSync(UPLOAD_PATH).length : 0;
    const res = await request(app)
      .post('/api/imports')
      .set(manager.auth)
      .field('asOf', 'not-a-date')
      .attach('file', Buffer.from(csv(GOOD)), 'orders.csv');

    expect(res.status).toBe(400);
    expect(res.body.error.details[0].field).toBe('asOf');
    await new Promise((r) => setTimeout(r, 50)); // cleanup runs on response 'finish'
    expect(fs.readdirSync(UPLOAD_PATH).length).toBe(before);
  });

  it('allows only managers to import', async () => {
    const emp = await loginAs(app, ROLES.EMPLOYEE, { employeeCode: 'EMP050' });
    expect((await upload(csv(GOOD), 'orders.csv', emp.auth)).status).toBe(403);
  });
});

describe('GET /api/imports and /api/orders', () => {
  it('lists import history without the heavy row report', async () => {
    await upload(csv(GOOD, BAD_DATE));
    const res = await request(app).get('/api/imports').set(manager.auth);

    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data[0].rowIssues).toBeUndefined();
    expect(res.body.data[0].uploadedBy.name).toBeTruthy();
  });

  it('filters orders and scopes employees to their own orders', async () => {
    const other = await createUser({ employeeCode: 'EMP002' });
    await upload(
      csv(
        GOOD,
        BAD_DATE,
        'ORD-9,19-10-2026 10:00,Other Person,9876543299,450,COD,Confirmed,,,EMP002',
      ),
    );

    const needsFix = await request(app)
      .get('/api/orders?dataStatus=NEEDS_CORRECTION')
      .set(manager.auth);
    expect(needsFix.body.data.map((o) => o.orderId)).toEqual(['ORD-3']);

    const search = await request(app).get('/api/orders?search=ananya').set(manager.auth);
    expect(search.body.data.map((o) => o.orderId)).toEqual(['ORD-1']);

    const range = await request(app)
      .get('/api/orders?dateFrom=2026-10-19&dateTo=2026-10-19&sort=orderId')
      .set(manager.auth);
    expect(range.body.data.map((o) => o.orderId)).toEqual(['ORD-1', 'ORD-9']);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: other.email, password: 'Password123' });
    const mine = await request(app)
      .get(`/api/orders?assignedTo=${employee.id}`) // tries to peek at someone else's orders
      .set('Authorization', `Bearer ${login.body.data.accessToken}`);
    expect(mine.body.data.map((o) => o.orderId)).toEqual(['ORD-9']);
  });
});
