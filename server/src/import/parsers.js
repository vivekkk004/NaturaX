import fs from 'node:fs/promises';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { BadRequestError } from '../errors/index.js';

export const MAX_DATA_ROWS = 10_000;

/**
 * Reads an uploaded file into a uniform shape, whatever the format:
 *   { headers: string[], rows: [{ rowNumber, cells: any[] }] }
 * `rowNumber` is the line/row number the user sees in Excel, so error reports point to the right row.
 */
export async function parseFile(filePath, fileType) {
  const buffer = await fs.readFile(filePath);
  assertContentMatchesType(buffer, fileType);
  const result = fileType === 'xlsx' ? await parseXlsx(buffer) : parseCsv(buffer);

  if (result.headers.every((h) => !String(h ?? '').trim())) {
    throw new BadRequestError('The file is empty or has no header row');
  }
  if (result.rows.length === 0) throw new BadRequestError('The file has a header but no data rows');
  if (result.rows.length > MAX_DATA_ROWS) {
    throw new BadRequestError(`Too many rows: ${result.rows.length} (maximum ${MAX_DATA_ROWS})`);
  }
  return result;
}

/**
 * Never trust the file extension alone: an .xlsx is a ZIP archive (starts with "PK\x03\x04"),
 * and a CSV is text (no NUL bytes). Renaming an .exe to .csv is caught here.
 */
function assertContentMatchesType(buffer, fileType) {
  const isZip = buffer.length > 4 && buffer.readUInt32LE(0) === 0x04034b50;
  const looksBinary = buffer.subarray(0, 8192).includes(0);
  if ((fileType === 'xlsx' && !isZip) || (fileType === 'csv' && (isZip || looksBinary))) {
    throw new BadRequestError('File content does not match its extension');
  }
}

function parseCsv(buffer) {
  let records;
  try {
    records = parse(buffer, {
      bom: true, // Excel's "CSV UTF-8" export starts with a byte-order mark
      // Files edited on both Windows and Mac/Linux mix line endings. Without listing all three,
      // a stray CRLF is counted as two lines and every later row number in the report is off by one.
      record_delimiter: ['\r\n', '\n', '\r'],
      skip_empty_lines: true,
      relax_column_count: true, // short/long rows are reported per row instead of failing the file
      trim: true,
      info: true, // gives the source line number of every record
    });
  } catch (err) {
    throw new BadRequestError(`Could not read CSV file: ${err.message}`);
  }
  if (records.length === 0) return { headers: [], rows: [] };

  const [header, ...data] = records;
  return {
    headers: header.record,
    rows: data
      .filter(({ record }) => record.some((cell) => cell !== ''))
      .map(({ record, info }) => ({ rowNumber: info.lines, cells: record })),
  };
}

/** Extracts the plain value from ExcelJS's rich cell types (formulas, rich text, hyperlinks). */
function cellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== 'object') return value;
  if ('result' in value) return cellValue(value.result); // formula -> its computed result
  if ('richText' in value) return value.richText.map((r) => r.text).join('');
  if ('text' in value) return value.text; // hyperlink
  if ('error' in value) return null; // #N/A, #REF!
  return String(value);
}

async function parseXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw new BadRequestError(`Could not read Excel file: ${err.message}`);
  }

  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) return { headers: [], rows: [] };

  const columnCount = sheet.columnCount;
  const readRow = (row) =>
    Array.from({ length: columnCount }, (_, i) => cellValue(row.getCell(i + 1).value));

  const headers = readRow(sheet.getRow(1)).map((h) => (h === null ? '' : String(h)));
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = readRow(row);
    if (cells.some((c) => c !== null && String(c).trim() !== '')) rows.push({ rowNumber, cells });
  });
  return { headers, rows };
}
