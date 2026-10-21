/**
 * Date handling for Indian business data.
 *
 * - All timestamps are stored in MongoDB as UTC instants (JS Date).
 * - Input values without an explicit offset are interpreted as IST (UTC+05:30). India has no
 *   daylight saving time, so a fixed offset is exact - no timezone library is needed.
 * - Day-first formats (DD-MM-YYYY) are assumed, as used in India. US month-first is NOT supported
 *   because "03/04/2026" would be ambiguous.
 */

export const IST_OFFSET_MINUTES = 330;
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}; // prettier-ignore

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function isValidCalendarDate(year, month, day) {
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

function isValidTime(h, m, s) {
  return h >= 0 && h <= 23 && m >= 0 && m <= 59 && s >= 0 && s <= 59;
}

/** Wall-clock IST components -> UTC instant. */
export function istToDate(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - IST_OFFSET_MS);
}

/** UTC instant -> wall-clock components in IST. */
export function toIstParts(date) {
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** "2026-10-20" for the IST calendar day of an instant (used for day-level comparisons). */
export function istDayKey(date) {
  const { year, month, day } = toIstParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function startOfIstDay(date) {
  const { year, month, day } = toIstParts(date);
  return istToDate(year, month, day);
}

/** Last millisecond of the IST day containing `date`. */
export function endOfIstDay(date) {
  return new Date(startOfIstDay(date).getTime() + DAY_MS - 1);
}

export function addHours(date, hours) {
  return new Date(date.getTime() + hours * HOUR_MS);
}

export function hoursBetween(from, to) {
  return (to.getTime() - from.getTime()) / HOUR_MS;
}

function build(year, month, day, hour, minute, second, hasTime) {
  if (!isValidCalendarDate(year, month, day) || !isValidTime(hour, minute, second)) return null;
  return { date: istToDate(year, month, day, hour, minute, second), hasTime };
}

/** Parses "14:30", "14:30:15", "2:30 PM", "02:30:00 pm". Returns null if invalid. */
function parseTime(text) {
  if (!text) return { hour: 0, minute: 0, second: 0 };
  const m = text.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const meridiem = m[4]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === 'pm' ? 12 : 0);
  }
  return { hour, minute: Number(m[2]), second: Number(m[3] ?? 0) };
}

/** "Z" -> 0, "+05:30" / "+0530" -> 330, "-04:00" -> -240 */
function parseOffsetMinutes(offset) {
  if (offset.toUpperCase() === 'Z') return 0;
  const [, sign, hours, minutes] = offset.match(/^([+-])(\d{2}):?(\d{2})$/);
  return (sign === '-' ? -1 : 1) * (Number(hours) * 60 + Number(minutes));
}

/**
 * Excel stores dates as "serial" day counts since 1899-12-30. A plain number in a date column
 * (cell not formatted as a date) arrives like this. The wall-clock value is taken as IST.
 */
function fromExcelSerial(serial) {
  if (serial < 36526 || serial > 73051) return null; // 2000-01-01 .. 2100-01-01
  const utcWallClock = new Date(Math.round((serial - 25569) * DAY_MS));
  return fromExcelDate(utcWallClock, !Number.isInteger(serial));
}

/**
 * ExcelJS returns date cells as JS Dates whose *UTC* fields hold the wall-clock value typed into
 * Excel (Excel itself has no timezone). Re-interpret that wall clock as IST.
 */
function fromExcelDate(value, hasTime) {
  const parts = {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
    hour: value.getUTCHours(),
    minute: value.getUTCMinutes(),
    second: value.getUTCSeconds(),
  };
  const timePresent = hasTime ?? (parts.hour || parts.minute || parts.second) !== 0;
  return build(
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    timePresent,
  );
}

/**
 * Parses a date/time value from a CSV or Excel cell.
 * @returns {{ date: Date, hasTime: boolean } | null} null when the value is not a real date.
 */
export function parseDateValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : fromExcelDate(value);
  if (typeof value === 'number') return fromExcelSerial(value);

  const text = String(value).trim();
  if (!text) return null;

  // ISO style: 2026-10-20, 2026-10-20T14:30, 2026-10-20 14:30:00, optional Z / +05:30 offset
  let m = text.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i,
  );
  if (m) {
    const [, y, mo, d, h, mi, s, offset] = m;
    const parsed = build(+y, +mo, +d, +(h ?? 0), +(mi ?? 0), +(s ?? 0), h !== undefined);
    if (!parsed || !offset) return parsed;
    // An explicit offset wins over the IST assumption: undo IST, apply the stated offset.
    const offsetMs = parseOffsetMinutes(offset) * 60 * 1000;
    return { date: new Date(parsed.date.getTime() + IST_OFFSET_MS - offsetMs), hasTime: true };
  }

  // Day-first numeric: 20-10-2026, 20/10/2026, 20.10.2026 with optional time
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(.+))?$/);
  if (m) {
    const time = parseTime(m[4]);
    if (!time) return null;
    return build(+m[3], +m[2], +m[1], time.hour, time.minute, time.second, Boolean(m[4]));
  }

  // Day-first with month name: 20-Oct-2026, 20 Oct 2026 14:30
  m = text.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/,]+(\d{4})(?:[\sT]+(.+))?$/);
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const time = parseTime(m[4]);
    if (!month || !time) return null;
    return build(+m[3], month, +m[1], time.hour, time.minute, time.second, Boolean(m[4]));
  }

  return null;
}

/** Formats an instant as "20-10-2026 14:30" IST (for CSV reports and messages). */
export function formatIst(date) {
  if (!date) return '';
  const { year, month, day, hour, minute } = toIstParts(date);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(day)}-${p(month)}-${year} ${p(hour)}:${p(minute)}`;
}
