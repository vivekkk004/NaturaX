import { once } from 'node:events';
import { stringify } from 'csv-stringify/sync';

/**
 * Minimal streaming CSV writer for an HTTP response.
 * csv-stringify does the escaping (quotes, commas, newlines inside values); we write one line at a
 * time and respect backpressure: if the client reads slowly, `write` returns false and we wait for
 * 'drain' instead of buffering the whole report in memory.
 */
export function createCsvWriter(res) {
  return {
    async writeRow(values) {
      if (!res.write(stringify([values]))) await once(res, 'drain');
    },
    async writeBlank() {
      if (!res.write('\r\n')) await once(res, 'drain');
    },
  };
}

/**
 * Sets download headers. The UTF-8 byte-order mark makes Excel display "₹" and Indian names
 * correctly instead of guessing a legacy encoding.
 */
export function startCsvDownload(res, filename) {
  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.write('﻿');
}
