import { ORDER_STATUS_SYNONYMS, PAYMENT_TYPE_SYNONYMS } from '../constants/order.js';

/**
 * Small pure functions that turn one raw cell into a clean value.
 * Each returns `null` when the input is not usable; the row validator decides what that means.
 */

/** Lowercase, punctuation/underscores -> single spaces: "In-Transit" -> "in transit". */
export function normalizeKey(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

/** Trims and collapses internal whitespace: "  Ravi   Kumar " -> "Ravi Kumar". */
export function normalizeText(value) {
  if (isBlank(value)) return null;
  return String(value).trim().replace(/\s+/g, ' ');
}

/** Order IDs are compared case-insensitively ("ord-1001" and "ORD-1001" are the same order). */
export function normalizeOrderId(value) {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : null;
}

export const ORDER_ID_PATTERN = /^[A-Z0-9][A-Z0-9\-_/#]{0,49}$/;

export function normalizeStatus(value) {
  return ORDER_STATUS_SYNONYMS[normalizeKey(value)] ?? null;
}

export function normalizePaymentType(value) {
  return PAYMENT_TYPE_SYNONYMS[normalizeKey(value)] ?? null;
}

/**
 * "₹5,499.00", "Rs. 1,200", "INR 799", 799 -> number. Indian digit grouping (1,00,000) works
 * because all commas are simply removed. Returns null for anything that is not a finite number.
 */
export function normalizeAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? round2(value) : null;
  if (isBlank(value)) return null;
  const cleaned = String(value)
    .replace(/₹|rs\.?|inr/gi, '')
    .replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return round2(Number(cleaned));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Indian mobile numbers: 10 digits starting with 6-9. Accepts "+91 98765 43210", "098765-43210",
 * "919876543210" and numeric Excel cells. Returns the bare 10 digits, or null if invalid.
 */
export function normalizePhone(value) {
  if (isBlank(value)) return null;
  let digits = String(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
