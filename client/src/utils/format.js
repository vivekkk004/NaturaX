/**
 * Display formatting. All business times are shown in IST, whatever the viewer's machine
 * timezone is - the operations team works in India and the API stores UTC.
 */
const IST = 'Asia/Kolkata';

const dateTimeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});
const dateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});
const currencyFormat = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const numberFormat = new Intl.NumberFormat('en-IN');

export function formatDateTime(value) {
  return value ? dateTimeFormat.format(new Date(value)) : '—';
}

export function formatDate(value) {
  return value ? dateFormat.format(new Date(value)) : '—';
}

export function formatCurrency(value) {
  return value === null || value === undefined ? '—' : currencyFormat.format(value);
}

export function formatNumber(value) {
  return numberFormat.format(value ?? 0);
}

/** 90 min -> "1h 30m", 3000 min -> "2d 2h" */
export function formatDuration(ms) {
  const minutes = Math.round(Math.abs(ms) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return `${days}d ${hours}h`;
  return `${hours}h ${minutes % 60}m`;
}

/** Deadline as a human phrase relative to `now`: "in 3h 20m" / "overdue by 2d 4h". */
export function formatDeadline(deadline, now = Date.now()) {
  if (!deadline) return '—';
  const diff = new Date(deadline).getTime() - now;
  return diff >= 0 ? `in ${formatDuration(diff)}` : `overdue by ${formatDuration(diff)}`;
}

/** Today's date in IST as YYYY-MM-DD (for <input type="date"> defaults). */
export function todayIst() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
}
