import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, it, expect } from 'vitest';
import { parseFile } from '../../src/import/parsers.js';
import { mapHeaders } from '../../src/import/columns.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'naturax-parse-'));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

function writeFile(name, content) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, content);
  return file;
}

describe('parseFile (CSV)', () => {
  it('reports the row number the user sees, even with mixed line endings and blank lines', async () => {
    const file = writeFile('mixed.csv', 'h1,h2\nA,1\r\n\nB,2\rC,3\r\n');
    const { rows } = await parseFile(file, 'csv');
    expect(rows.map((r) => `${r.cells[0]}@${r.rowNumber}`)).toEqual(['A@2', 'B@4', 'C@5']);
  });

  it('strips the UTF-8 BOM that Excel adds to "CSV UTF-8" exports', async () => {
    const file = writeFile('bom.csv', '﻿Order ID,x\nORD-1,1\n');
    const { headers } = await parseFile(file, 'csv');
    expect(headers[0]).toBe('Order ID');
  });

  it('rejects binary content disguised as CSV', async () => {
    const file = writeFile('fake.csv', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0]));
    await expect(parseFile(file, 'csv')).rejects.toThrow('does not match its extension');
  });
});

describe('mapHeaders', () => {
  it('maps header variations to canonical fields and ignores extra columns', () => {
    const { mapping, missing } = mapHeaders([
      'order_id', 'Order Date/Time', 'Customer', 'Mobile No.', 'Amount', 'Payment Mode',
      'Status', 'Shipped Date', 'EDD', 'Assigned To', 'Notes',
    ]); // prettier-ignore
    expect(missing).toEqual([]);
    expect(mapping.at(-1)).toBeNull();
    expect(mapping.slice(0, 3)).toEqual(['orderId', 'orderDate', 'customerName']);
  });

  it('lists missing and duplicate columns', () => {
    const { missing, duplicates } = mapHeaders(['Order ID', 'Status', 'Order Status']);
    expect(missing).toContain('Order Date');
    expect(duplicates).toEqual(['Order Status']);
  });
});
