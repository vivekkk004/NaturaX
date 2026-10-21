import { OverdueBadge, PriorityBadge, StatusBadge } from '../../components/common/Badges';
import { RULE_LABELS } from '../../utils/constants';
import { formatCurrency, formatDateTime, formatDeadline } from '../../utils/format';

/** Column definitions for task tables (Tasks page, dashboard high-priority list). */
export function buildTaskColumns({ showAssignee = true, compact = false } = {}) {
  const columns = [
    {
      key: 'orderId',
      header: 'Order',
      sortKey: 'orderId',
      render: (t) => (
        <div>
          <p className="font-medium text-slate-900">{t.orderId}</p>
          <p className="text-xs text-slate-500">{t.customer?.name ?? '—'}</p>
        </div>
      ),
    },
    { key: 'ruleType', header: 'Exception', render: (t) => RULE_LABELS[t.ruleType] ?? t.ruleType },
    {
      key: 'priority',
      header: 'Priority',
      sortKey: 'priority',
      render: (t) => <PriorityBadge priority={t.priority} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={t.status} />
          {t.isOverdue && <OverdueBadge />}
        </div>
      ),
    },
    {
      key: 'deadline',
      header: 'Deadline',
      sortKey: 'deadline',
      render: (t) => (
        <div className="whitespace-nowrap">
          <p>{formatDateTime(t.deadline)}</p>
          {t.status !== 'RESOLVED' && (
            <p className={`text-xs ${t.isOverdue ? 'font-medium text-red-700' : 'text-slate-500'}`}>
              {formatDeadline(t.deadline)}
            </p>
          )}
        </div>
      ),
    },
  ];
  if (showAssignee) {
    columns.push({
      key: 'assignedTo',
      header: 'Assigned to',
      render: (t) => t.assignedTo?.name ?? <span className="text-amber-700">Unassigned</span>,
    });
  }
  if (!compact) {
    columns.push(
      {
        key: 'reason',
        header: 'Reason',
        className: 'min-w-64',
        render: (t) => <span className="line-clamp-2">{t.reason}</span>,
      },
      {
        key: 'orderValue',
        header: 'Value',
        sortKey: 'orderValue',
        className: 'text-right',
        render: (t) => formatCurrency(t.orderValue),
      },
    );
  }
  return columns;
}
