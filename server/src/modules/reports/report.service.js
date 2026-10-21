import { PRIORITY } from '../../constants/rules.js';
import { UNRESOLVED_STATUSES } from '../../constants/tasks.js';
import { Task } from '../../models/Task.js';
import { RULES_BY_TYPE } from '../../rule-engine/registry.js';
import { createCsvWriter, startCsvDownload } from '../../utils/csvStream.js';
import { endOfIstDay, formatIst, hoursBetween, istDayKey } from '../../utils/dates.js';
import { employeeWorkload } from '../tasks/taskStats.js';

const PREVIEW_LIMIT = 100;

/**
 * The PDF's daily exception report sections.
 * "New" depends on the report date (tasks first detected that IST day); the other sections are
 * the current state at the time the report is generated - a daily snapshot.
 */
export const TASK_SECTIONS = {
  new: {
    label: 'New exceptions',
    filter: ({ dayStart, dayEnd }) => ({ detectedAt: { $gte: dayStart, $lte: dayEnd } }),
    sort: { detectedAt: 1, _id: 1 },
  },
  unresolved: {
    label: 'Unresolved exceptions',
    filter: () => ({ status: { $in: UNRESOLVED_STATUSES } }),
    sort: { priorityRank: 1, deadline: 1, _id: 1 },
  },
  overdue: {
    label: 'Overdue tasks',
    filter: ({ now }) => ({ status: { $in: UNRESOLVED_STATUSES }, deadline: { $lt: now } }),
    sort: { deadline: 1, _id: 1 },
  },
  'high-priority': {
    label: 'High-priority cases',
    filter: () => ({ status: { $in: UNRESOLVED_STATUSES }, priority: PRIORITY.HIGH }),
    sort: { deadline: 1, _id: 1 },
  },
};
export const EMPLOYEE_SECTION = 'employee-pending';
export const REPORT_SECTIONS = [...Object.keys(TASK_SECTIONS), EMPLOYEE_SECTION];

const TASK_COLUMNS = [
  'Section', 'Order ID', 'Exception', 'Priority', 'Status', 'Reason', 'Action Required',
  'Assigned To', 'Employee Code', 'Customer', 'Phone', 'Order Value (INR)', 'Payment',
  'Order Status', 'Order Date', 'Detected At', 'Deadline', 'Overdue', 'Overdue By (hours)', 'SLA Breached',
]; // prettier-ignore
const EMPLOYEE_COLUMNS = [
  'Section', 'Employee', 'Employee Code', 'Open', 'In Progress', 'Unresolved', 'Overdue', 'High Priority',
]; // prettier-ignore

function taskRow(sectionLabel, task, now) {
  const overdue = UNRESOLVED_STATUSES.includes(task.status) && task.deadline < now;
  return [
    sectionLabel,
    task.orderId,
    RULES_BY_TYPE.get(task.ruleType)?.label ?? task.ruleType,
    task.priority,
    task.status,
    task.reason,
    task.actionRequired,
    task.assignedTo?.name ?? 'Unassigned',
    task.assignedTo?.employeeCode ?? '',
    task.customer?.name ?? '',
    task.customer?.phone ?? '',
    task.orderValue ?? '',
    task.paymentType ?? '',
    task.orderStatus ?? '',
    formatIst(task.orderDate),
    formatIst(task.detectedAt),
    formatIst(task.deadline),
    overdue ? 'Yes' : 'No',
    overdue ? hoursBetween(task.deadline, now).toFixed(1) : '',
    task.slaBreached || overdue ? 'Yes' : 'No',
  ];
}

const employeeRow = (e) => [
  'Employee-wise pending actions', e.name, e.employeeCode ?? '', e.open, e.inProgress, e.total, e.overdue, e.highPriority,
]; // prettier-ignore

function reportContext(date) {
  const dayStart = date;
  return { now: new Date(), dayStart, dayEnd: endOfIstDay(dayStart), dateKey: istDayKey(dayStart) };
}

const sectionQuery = (key, ctx) =>
  Task.find(TASK_SECTIONS[key].filter(ctx))
    .sort(TASK_SECTIONS[key].sort)
    .populate('assignedTo', 'name employeeCode')
    .lean();

/** JSON version for the Reports page: counts + a preview of each section. */
export async function getDailyReport({ date }) {
  const ctx = reportContext(date);
  const keys = Object.keys(TASK_SECTIONS);

  const [counts, previews, employeePending] = await Promise.all([
    Promise.all(keys.map((k) => Task.countDocuments(TASK_SECTIONS[k].filter(ctx)))),
    Promise.all(keys.map((k) => sectionQuery(k, ctx).limit(PREVIEW_LIMIT))),
    employeeWorkload({}, ctx.now, { includeIdleEmployees: true }),
  ]);

  return {
    date: ctx.dateKey,
    generatedAt: ctx.now,
    previewLimit: PREVIEW_LIMIT,
    sections: keys.map((key, i) => ({
      key,
      label: TASK_SECTIONS[key].label,
      count: counts[i],
      rows: previews[i].map((t) => ({
        id: t._id,
        orderId: t.orderId,
        ruleType: t.ruleType,
        priority: t.priority,
        status: t.status,
        reason: t.reason,
        assignedTo: t.assignedTo
          ? { name: t.assignedTo.name, employeeCode: t.assignedTo.employeeCode }
          : null,
        customer: t.customer,
        deadline: t.deadline,
        detectedAt: t.detectedAt,
        isOverdue: UNRESOLVED_STATUSES.includes(t.status) && t.deadline < ctx.now,
      })),
    })),
    employeePending,
  };
}

/**
 * Streams the report as CSV. `section=all` writes the four task sections (one table with a
 * "Section" column), a blank line, then the employee-wise summary with its own header -
 * opens cleanly in Excel. A single section gives a plain one-table CSV for further processing.
 */
export async function streamDailyReportCsv(res, { date, section }) {
  const ctx = reportContext(date);
  const taskKeys =
    section === 'all' ? Object.keys(TASK_SECTIONS) : [section].filter((s) => s in TASK_SECTIONS);
  const withEmployees = section === 'all' || section === EMPLOYEE_SECTION;

  startCsvDownload(
    res,
    `daily-exception-report-${ctx.dateKey}${section === 'all' ? '' : `-${section}`}.csv`,
  );
  const csv = createCsvWriter(res);

  if (taskKeys.length) {
    await csv.writeRow(TASK_COLUMNS);
    for (const key of taskKeys) {
      for await (const task of sectionQuery(key, ctx).cursor()) {
        await csv.writeRow(taskRow(TASK_SECTIONS[key].label, task, ctx.now));
      }
    }
  }
  if (withEmployees) {
    if (taskKeys.length) await csv.writeBlank();
    await csv.writeRow(EMPLOYEE_COLUMNS);
    for (const e of await employeeWorkload({}, ctx.now, { includeIdleEmployees: true })) {
      await csv.writeRow(employeeRow(e));
    }
  }
  res.end();
}
