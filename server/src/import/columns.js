/**
 * Maps whatever header text a file uses ("Order ID", "order_id", "Order No.") to our canonical
 * field names. Headers are compared after lowercasing and removing everything except a-z/0-9,
 * so spacing, underscores and punctuation never matter.
 */
export const COLUMN_ALIASES = Object.freeze({
  orderId: ['orderid', 'orderno', 'ordernumber', 'orderref'],
  orderDate: ['orderdate', 'orderdatetime', 'ordertime', 'orderedat', 'orderplacedat', 'orderplacedon'],
  customerName: ['customername', 'customer', 'name', 'buyername'],
  phone: ['phone', 'phonenumber', 'phoneno', 'mobile', 'mobilenumber', 'mobileno', 'contactnumber', 'customerphone'],
  orderValue: ['ordervalue', 'value', 'amount', 'orderamount', 'ordertotal', 'total', 'totalamount'],
  paymentType: ['paymenttype', 'payment', 'paymentmode', 'paymentmethod'],
  orderStatus: ['orderstatus', 'status'],
  dispatchDate: ['dispatchdate', 'dispatchedat', 'dispatchdatetime', 'dispatchedon', 'shipdate', 'shippeddate'],
  expectedDeliveryDate: ['expecteddeliverydate', 'expecteddelivery', 'edd', 'promiseddeliverydate', 'deliveryby'],
  assignedEmployee: ['assignedemployee', 'assignedto', 'employee', 'employeecode', 'owner', 'agent'],
}); // prettier-ignore

/** Human-friendly column names, used in error messages and the sample files. */
export const COLUMN_LABELS = Object.freeze({
  orderId: 'Order ID',
  orderDate: 'Order Date',
  customerName: 'Customer Name',
  phone: 'Phone Number',
  orderValue: 'Order Value',
  paymentType: 'Payment Type',
  orderStatus: 'Order Status',
  dispatchDate: 'Dispatch Date',
  expectedDeliveryDate: 'Expected Delivery Date',
  assignedEmployee: 'Assigned Employee',
});

export const CANONICAL_FIELDS = Object.keys(COLUMN_ALIASES);

const normalizeHeader = (header) =>
  String(header ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const ALIAS_LOOKUP = new Map(
  Object.entries(COLUMN_ALIASES).flatMap(([field, aliases]) => aliases.map((a) => [a, field])),
);

/**
 * @param {string[]} headers raw header cells in file order
 * @returns {{ mapping: (string|null)[], missing: string[], duplicates: string[] }}
 *   mapping[i] = canonical field for column i (null = ignored extra column)
 */
export function mapHeaders(headers) {
  const seen = new Set();
  const duplicates = [];
  const mapping = headers.map((header) => {
    const field = ALIAS_LOOKUP.get(normalizeHeader(header)) ?? null;
    if (field && seen.has(field)) {
      duplicates.push(COLUMN_LABELS[field]);
      return null; // first occurrence wins
    }
    if (field) seen.add(field);
    return field;
  });

  // Every column must be present in the file, even if some cells may be legitimately empty
  // (e.g. Dispatch Date for an unconfirmed order). A missing column is a file-format error.
  const missing = CANONICAL_FIELDS.filter((f) => !seen.has(f)).map((f) => COLUMN_LABELS[f]);
  return { mapping, missing, duplicates };
}
