import { ROLES } from '../../constants/roles.js';
import { NotFoundError } from '../../errors/index.js';
import { Order } from '../../models/Order.js';
import { escapeRegex, paginate } from '../../utils/pagination.js';

const ASSIGNEE = { path: 'assignedTo', select: 'name employeeCode' };

/** Employees only ever see orders assigned to them; the filter is forced server-side. */
function scopeFor(user) {
  return user.role === ROLES.EMPLOYEE ? { assignedTo: user.id } : {};
}

export async function listOrders(query, user) {
  const {
    page,
    limit,
    sort,
    dataStatus,
    status,
    paymentType,
    assignedTo,
    search,
    dateFrom,
    dateTo,
  } = query;
  const filter = {};

  if (dataStatus) filter.dataStatus = dataStatus;
  if (status) filter.status = status;
  if (paymentType) filter.paymentType = paymentType;
  if (assignedTo) filter.assignedTo = assignedTo === 'unassigned' ? null : assignedTo;
  if (dateFrom || dateTo) {
    filter.orderDate = {};
    if (dateFrom) filter.orderDate.$gte = dateFrom;
    if (dateTo) filter.orderDate.$lte = dateTo;
  }
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ orderId: pattern }, { customerName: pattern }, { phone: pattern }];
  }

  // Applied last so an employee's own scope can never be overridden by a query parameter.
  Object.assign(filter, scopeFor(user));
  return paginate(Order, filter, { page, limit, sort }, { populate: ASSIGNEE });
}

export async function getOrder(id, user) {
  const order = await Order.findOne({ _id: id, ...scopeFor(user) }).populate(ASSIGNEE);
  // 404 (not 403) for someone else's order: don't reveal that it exists.
  if (!order) throw new NotFoundError('Order not found');
  return order;
}
