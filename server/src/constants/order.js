/** Canonical order lifecycle used everywhere inside the system. */
export const ORDER_STATUS = Object.freeze({
  UNCONFIRMED: 'UNCONFIRMED',
  CONFIRMED: 'CONFIRMED',
  DISPATCHED: 'DISPATCHED',
  DELIVERED: 'DELIVERED',
  DELIVERY_FAILED: 'DELIVERY_FAILED',
  CANCELLED: 'CANCELLED',
});
export const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS);

/**
 * Real-world files use many words for the same status. Every spelling we accept is listed here,
 * so supporting a new courier/marketplace wording is a one-line change. Keys are lowercase with
 * punctuation collapsed to single spaces (see normalizeKey in import/normalizers.js).
 */
export const ORDER_STATUS_SYNONYMS = Object.freeze({
  unconfirmed: ORDER_STATUS.UNCONFIRMED,
  'not confirmed': ORDER_STATUS.UNCONFIRMED,
  pending: ORDER_STATUS.UNCONFIRMED,
  'pending confirmation': ORDER_STATUS.UNCONFIRMED,
  'awaiting confirmation': ORDER_STATUS.UNCONFIRMED,
  new: ORDER_STATUS.UNCONFIRMED,
  placed: ORDER_STATUS.UNCONFIRMED,

  confirmed: ORDER_STATUS.CONFIRMED,
  processing: ORDER_STATUS.CONFIRMED,
  packed: ORDER_STATUS.CONFIRMED,
  'ready to ship': ORDER_STATUS.CONFIRMED,

  dispatched: ORDER_STATUS.DISPATCHED,
  shipped: ORDER_STATUS.DISPATCHED,
  'in transit': ORDER_STATUS.DISPATCHED,
  'out for delivery': ORDER_STATUS.DISPATCHED,

  delivered: ORDER_STATUS.DELIVERED,

  'delivery failed': ORDER_STATUS.DELIVERY_FAILED,
  'failed delivery': ORDER_STATUS.DELIVERY_FAILED,
  'delivery attempt failed': ORDER_STATUS.DELIVERY_FAILED,
  failed: ORDER_STATUS.DELIVERY_FAILED,
  undelivered: ORDER_STATUS.DELIVERY_FAILED,
  ndr: ORDER_STATUS.DELIVERY_FAILED, // "Non-Delivery Report" - Indian courier jargon

  cancelled: ORDER_STATUS.CANCELLED,
  canceled: ORDER_STATUS.CANCELLED,
});

export const PAYMENT_TYPE = Object.freeze({ PREPAID: 'PREPAID', COD: 'COD' });
export const PAYMENT_TYPE_VALUES = Object.values(PAYMENT_TYPE);

export const PAYMENT_TYPE_SYNONYMS = Object.freeze({
  prepaid: PAYMENT_TYPE.PREPAID,
  'pre paid': PAYMENT_TYPE.PREPAID,
  paid: PAYMENT_TYPE.PREPAID,
  online: PAYMENT_TYPE.PREPAID,
  cod: PAYMENT_TYPE.COD,
  'cash on delivery': PAYMENT_TYPE.COD,
});

/**
 * VALID orders are evaluated by the rule engine. NEEDS_CORRECTION orders are NOT - the PDF says
 * "do not flag an order if the required information is unavailable; identify it as needing
 * data correction instead".
 */
export const DATA_STATUS = Object.freeze({
  VALID: 'VALID',
  NEEDS_CORRECTION: 'NEEDS_CORRECTION',
});
export const DATA_STATUS_VALUES = Object.values(DATA_STATUS);

/**
 * Which optional dates each status requires. A dispatched order without a dispatch date or an
 * expected delivery date cannot be checked by the shipment-delay rules, so it needs correction.
 */
export const REQUIRED_DATES_BY_STATUS = Object.freeze({
  [ORDER_STATUS.UNCONFIRMED]: [],
  [ORDER_STATUS.CONFIRMED]: [],
  [ORDER_STATUS.DISPATCHED]: ['dispatchDate', 'expectedDeliveryDate'],
  [ORDER_STATUS.DELIVERED]: ['dispatchDate'],
  [ORDER_STATUS.DELIVERY_FAILED]: ['dispatchDate'],
  [ORDER_STATUS.CANCELLED]: [],
});

/** Statuses for which a dispatch date contradicts the status (not yet shipped). */
export const NOT_YET_DISPATCHED = Object.freeze([ORDER_STATUS.UNCONFIRMED, ORDER_STATUS.CONFIRMED]);
