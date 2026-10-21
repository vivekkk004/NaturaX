/**
 * Generates a realistic sample order file (CSV + XLSX) with deliberately planted cases.
 *
 * Dates are generated RELATIVE to a reference time, so the file stays meaningful whenever it is
 * generated (an "unconfirmed for 3 hours" order is 3 hours old at the reference time). A seeded
 * random generator makes the output identical for the same reference time.
 *
 * Usage:
 *   npm run generate:sample -w server                       # reference time = now
 *   npm run generate:sample -w server -- --now 2026-10-20T18:00
 * Upload with "Evaluate as of" = the reference time (printed, and saved in orders_sample.meta.json)
 * to reproduce the expected task counts exactly.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import { stringify } from 'csv-stringify/sync';
import {
  addHours,
  formatIst,
  IST_OFFSET_MINUTES,
  parseDateValue,
  toIstParts,
} from '../src/utils/dates.js';

export const HEADER = [
  'Order ID', 'Order Date', 'Customer Name', 'Phone Number', 'Order Value', 'Payment Type',
  'Order Status', 'Dispatch Date', 'Expected Delivery Date', 'Assigned Employee',
]; // prettier-ignore
const FIELDS = [
  'orderId', 'orderDate', 'customerName', 'phone', 'orderValue', 'paymentType',
  'orderStatus', 'dispatchDate', 'expectedDeliveryDate', 'assignedEmployee',
]; // prettier-ignore

const FIRST = ['Aarav', 'Ananya', 'Vihaan', 'Diya', 'Arjun', 'Ishita', 'Kabir', 'Meera', 'Rohan', 'Saanvi', 'Aditya', 'Kavya', 'Vivaan', 'Nisha', 'Siddharth', 'Pooja', 'Rahul', 'Sneha', 'Karthik', 'Lakshmi', 'Imran', 'Farah', 'Harpreet', 'Gaurav', 'Divya', 'Manoj', 'Neha', 'Suresh', 'Anjali', 'Varun']; // prettier-ignore
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Nair', 'Patel', 'Gupta', 'Menon', 'Khan', 'Singh', 'Das', 'Joshi', 'Pillai', 'Rao', 'Verma', 'Kulkarni', 'Banerjee', 'Shaikh', 'Desai', 'Chopra', 'Mehta']; // prettier-ignore
const EMPLOYEES = [
  { code: 'EMP001', name: 'Priya Sharma', email: 'priya@naturax.in' },
  { code: 'EMP002', name: 'Rahul Verma', email: 'rahul@naturax.in' },
  { code: 'EMP003', name: 'Anjali Menon', email: 'anjali@naturax.in' },
  { code: 'EMP004', name: 'Arjun Reddy', email: 'arjun@naturax.in' },
  { code: 'EMP005', name: 'Sneha Patil', email: 'sneha@naturax.in' },
];

/** Small deterministic PRNG (mulberry32): same seed -> same "random" sequence. */
function createRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wall-clock IST date string in one of the formats real sheets use. */
function fmt(date, style = 'dmy') {
  const { year, month, day, hour, minute } = toIstParts(date);
  const p = (n) => String(n).padStart(2, '0');
  if (style === 'iso') return `${year}-${p(month)}-${p(day)} ${p(hour)}:${p(minute)}`;
  if (style === 'slash') return `${p(day)}/${p(month)}/${year} ${p(hour)}:${p(minute)}`;
  if (style === 'dateOnly') return `${p(day)}-${p(month)}-${year}`;
  return formatIst(date); // DD-MM-YYYY HH:mm
}

/**
 * @param {{ now?: Date, idPrefix?: string, seed?: number }} options
 * @returns {{ header: string[], rows: string[][], expected: object, referenceTime: Date }}
 */
export function generateSampleOrders({
  now: rawNow = new Date(),
  idPrefix = 'NX-',
  seed = 20261020,
} = {}) {
  // Whole minutes, so "Evaluate as of <reference time>" (minute precision) reproduces the file exactly.
  const now = new Date(Math.floor(rawNow.getTime() / 60_000) * 60_000);
  const rng = createRng(seed);
  const int = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const ago = (minH, maxH) => addHours(now, -(minH + rng() * (maxH - minH)));
  const dayOffset = (base, days) => addHours(base, days * 24);

  let serial = 10001;
  let employeeIndex = 0;
  const rows = [];

  const value = (min = 299, max = 4999) => Math.round(int(min, max) / 10) * 10 - 1; // ₹1,299-style prices
  const phone = () => `${pick(['9', '8', '7', '6'])}${String(int(0, 999999999)).padStart(9, '0')}`;
  const phoneText = (p) => pick([p, p, `+91 ${p.slice(0, 5)} ${p.slice(5)}`, `0${p}`]);
  const valueText = (v) => (rng() < 0.3 ? `₹${v.toLocaleString('en-IN')}` : String(v));
  const employee = () => {
    const e = EMPLOYEES[employeeIndex % EMPLOYEES.length];
    employeeIndex += 1;
    if (employeeIndex % 7 === 0) return e.name; // files also refer to people by name ...
    if (employeeIndex % 11 === 0) return e.email; // ... or by email
    return e.code;
  };
  const dateStyle = () => pick(['dmy', 'dmy', 'dmy', 'iso', 'slash']);

  function add(fields) {
    const v = fields.orderValue ?? value();
    const row = {
      orderId: `${idPrefix}${serial++}`,
      customerName: `${pick(FIRST)} ${pick(LAST)}`,
      phone: phoneText(phone()),
      paymentType: rng() < 0.6 ? 'COD' : 'Prepaid',
      dispatchDate: '',
      expectedDeliveryDate: '',
      assignedEmployee: employee(),
      ...fields,
      orderValue: typeof v === 'number' ? valueText(v) : v,
    };
    rows.push(FIELDS.map((f) => row[f] ?? ''));
    return row;
  }

  /** A dispatched order: ordered, dispatched some hours later, EDD n days after dispatch. */
  function shipped({ orderedHoursAgo, eddDaysAfterDispatch, status, ...extra }) {
    const ordered = ago(...orderedHoursAgo);
    const dispatched = addHours(ordered, int(6, 24));
    return add({
      orderDate: fmt(ordered, dateStyle()),
      dispatchDate: fmt(dispatched, dateStyle()),
      expectedDeliveryDate: fmt(dayOffset(dispatched, eddDaysAfterDispatch), 'dateOnly'),
      orderStatus: status,
      ...extra,
    });
  }

  // ---------- Normal orders (no exception expected) ----------
  for (let i = 0; i < 30; i += 1)
    shipped({ orderedHoursAgo: [96, 240], eddDaysAfterDispatch: int(2, 4), status: 'Delivered' });
  for (let i = 0; i < 12; i += 1) {
    const ordered = ago(20, 40);
    const dispatched = addHours(ordered, int(4, 12));
    add({
      orderDate: fmt(ordered),
      dispatchDate: fmt(dispatched),
      expectedDeliveryDate: fmt(dayOffset(now, int(1, 3)), 'dateOnly'), // due in the future
      orderStatus: pick(['In Transit', 'Shipped', 'Out for delivery']),
    });
  }
  for (let i = 0; i < 6; i += 1)
    add({ orderDate: fmt(ago(0.5, 1.5)), orderStatus: pick(['Unconfirmed', 'Pending']) });
  for (let i = 0; i < 8; i += 1) add({ orderDate: fmt(ago(3, 20)), orderStatus: 'Confirmed' });
  for (let i = 0; i < 4; i += 1) add({ orderDate: fmt(ago(30, 100)), orderStatus: 'Cancelled' });

  // ---------- Planted exceptions ----------
  for (let i = 0; i < 8; i += 1)
    add({ orderDate: fmt(ago(3, 30), dateStyle()), orderStatus: pick(['Unconfirmed', 'Pending']) }); // rule 1
  for (let i = 0; i < 8; i += 1)
    add({ orderDate: fmt(ago(26, 72), dateStyle()), orderStatus: 'Confirmed' }); // rule 2
  for (let i = 0; i < 8; i += 1)
    shipped({
      orderedHoursAgo: [150, 210],
      eddDaysAfterDispatch: 2,
      status: pick(['In Transit', 'Shipped']),
    }); // rule 3
  for (let i = 0; i < 8; i += 1)
    shipped({
      orderedHoursAgo: [80, 130],
      eddDaysAfterDispatch: 2,
      status: pick(['Delivery Failed', 'NDR', 'Undelivered']),
    }); // rule 4
  for (let i = 0; i < 6; i += 1)
    shipped({
      orderedHoursAgo: [150, 210],
      eddDaysAfterDispatch: 2,
      status: 'In Transit',
      orderValue: value(5500, 24999),
    }); // rules 3 + 5
  for (let i = 0; i < 2; i += 1) {
    const ordered = ago(50, 80); // confirmed, never dispatched, promised date passed: rules 2 + 5
    // EDD = order day + 1: a date-only EDD means "end of that day", so +2 could still be today.
    add({
      orderDate: fmt(ordered),
      expectedDeliveryDate: fmt(dayOffset(ordered, 1), 'dateOnly'),
      orderStatus: 'Confirmed',
      orderValue: value(6000, 15999),
    });
  }
  for (let i = 0; i < 2; i += 1) {
    // rule 4 with an employee code that doesn't exist -> imported with a warning, task unassigned
    shipped({
      orderedHoursAgo: [80, 130],
      eddDaysAfterDispatch: 2,
      status: 'Delivery Failed',
      assignedEmployee: 'EMP009',
    });
  }

  // ---------- Bad data -> "needs correction" (not flagged by rules) ----------
  const recent = () => fmt(ago(26, 60));
  add({ orderDate: recent(), orderStatus: 'Confirmed', customerName: '' });
  add({ orderDate: recent(), orderStatus: 'Unconfirmed', customerName: '' });
  add({ orderDate: recent(), orderStatus: 'Confirmed', phone: '' });
  add({ orderDate: recent(), orderStatus: 'Confirmed', phone: '12345' });
  add({ orderDate: recent(), orderStatus: 'Unconfirmed', phone: '98765-4321' });
  add({ orderDate: '31-02-2026 10:00', orderStatus: 'Confirmed' }); // impossible date
  add({ orderDate: '32/13/2026', orderStatus: 'Confirmed' }); // invalid format
  add({ orderDate: fmt(addHours(now, 72)), orderStatus: 'Unconfirmed' }); // future
  for (let i = 0; i < 2; i += 1) {
    const ordered = ago(50, 90);
    add({
      orderDate: fmt(ordered),
      dispatchDate: fmt(addHours(ordered, 12)),
      orderStatus: 'Shipped',
    }); // no EDD
  }
  add({ orderDate: recent(), orderStatus: 'Confirmed', orderValue: 'abc' });
  add({ orderDate: recent(), orderStatus: 'Lost in transit' });
  {
    const ordered = ago(40, 60);
    add({
      orderDate: fmt(ordered),
      dispatchDate: fmt(addHours(ordered, 10)),
      orderStatus: 'Confirmed',
    }); // status vs date conflict
  }
  add({ orderDate: recent(), orderStatus: 'Confirmed', paymentType: 'UPI later' });

  // ---------- Duplicates and a row without an ID ----------
  rows.push([...rows[3]], [...rows[17]]); // identical repeats -> skipped
  const conflictId = `${idPrefix}${serial++}`;
  const base = { orderDate: fmt(ago(5, 8)), orderStatus: 'Unconfirmed' };
  for (const v of ['1499', '1999']) {
    rows.push(FIELDS.map((f) => ({ ...base, orderId: conflictId, customerName: 'Rekha Bose', phone: '9812345670', orderValue: v, paymentType: 'COD', dispatchDate: '', expectedDeliveryDate: '', assignedEmployee: 'EMP002' })[f])); // prettier-ignore
  }
  rows.push(FIELDS.map((f) => ({ orderId: '', orderDate: fmt(ago(5, 8)), customerName: 'No Id', phone: '9812345671', orderValue: '999', paymentType: 'COD', orderStatus: 'Confirmed', dispatchDate: '', expectedDeliveryDate: '', assignedEmployee: 'EMP003' })[f])); // prettier-ignore

  return {
    header: HEADER,
    rows,
    referenceTime: now,
    expected: {
      rows: rows.length,
      ordersStored: 116,
      needsCorrection: 14,
      rejectedRows: 3,
      duplicatesSkipped: 2,
      tasks: {
        UNCONFIRMED_ORDER: 8,
        DISPATCH_DELAY: 10,
        SHIPMENT_DELAY: 14,
        FAILED_DELIVERY: 10,
        HIGH_VALUE_DELAY: 8,
        DATA_CORRECTION: 14,
      },
      unassignedTasks: 2,
    },
  };
}

export function toCsv({ header, rows }) {
  return stringify([header, ...rows]);
}

/**
 * Excel version: valid dates become real date cells (as people's sheets usually have),
 * invalid ones stay as text so the importer's error handling is exercised too.
 */
export async function toXlsxBuffer({ header, rows }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Orders');
  sheet.addRow(header);
  sheet.getRow(1).font = { bold: true };
  const dateCols = [1, 7, 8];
  for (const row of rows) {
    sheet.addRow(
      row.map((cell, i) => {
        if (!dateCols.includes(i) || !cell) return cell;
        const parsed = parseDateValue(cell);
        // ExcelJS writes a Date's UTC fields as the cell's wall-clock value, so shift the IST
        // instant to "IST wall clock in UTC fields". Unparseable dates stay as text on purpose.
        return parsed ? new Date(parsed.date.getTime() + IST_OFFSET_MINUTES * 60 * 1000) : cell;
      }),
    );
  }
  sheet.getColumn(2).numFmt = 'dd-mm-yyyy hh:mm';
  sheet.getColumn(8).numFmt = 'dd-mm-yyyy hh:mm';
  sheet.getColumn(9).numFmt = 'dd-mm-yyyy';
  sheet.columns.forEach((col) => {
    col.width = 20;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function writeSampleFiles(outDir, options) {
  const data = generateSampleOrders(options);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'orders_sample.csv'), toCsv(data));
  fs.writeFileSync(path.join(outDir, 'orders_sample.xlsx'), await toXlsxBuffer(data));
  const meta = {
    generatedAt: new Date().toISOString(),
    referenceTimeIst: fmt(data.referenceTime, 'iso'),
    note: 'Upload with "Evaluate as of" = referenceTimeIst to reproduce the expected counts exactly.',
    expected: data.expected,
  };
  fs.writeFileSync(
    path.join(outDir, 'orders_sample.meta.json'),
    `${JSON.stringify(meta, null, 2)}\n`,
  );
  return { ...data, meta };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const nowArg = process.argv.indexOf('--now');
  const parsed = nowArg > -1 ? parseDateValue(process.argv[nowArg + 1]) : null;
  if (nowArg > -1 && !parsed) {
    console.error('Invalid --now value. Example: --now 2026-10-20T18:00');
    process.exit(1);
  }
  const outDir = path.resolve(import.meta.dirname, '..', '..', 'sample-data');
  const { meta } = await writeSampleFiles(outDir, { now: parsed?.date ?? new Date() });
  console.log(`Sample files written to ${outDir}`);
  console.log(`Reference time (IST): ${meta.referenceTimeIst}`);
  console.table(meta.expected.tasks);
  console.log(meta.note);
}
