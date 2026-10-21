import { Clock } from 'lucide-react';
import { OverdueBadge, PriorityBadge } from '../../../components/common/Badges';
import { RULE_LABELS } from '../../../utils/constants';
import { formatCurrency, formatDeadline } from '../../../utils/format';

const ACCENT = {
  HIGH: 'border-l-red-500',
  MEDIUM: 'border-l-amber-400',
  LOW: 'border-l-slate-300',
};

const initials = (name = '') =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** Compact task summary used on the Kanban board (and as the drag preview when `overlay`). */
export default function TaskCard({ task, showAssignee, overlay = false }) {
  return (
    <div
      className={`rounded-xl border border-l-4 border-slate-200 ${ACCENT[task.priority] ?? ACCENT.LOW} bg-white p-3 text-left shadow-sm ${
        overlay ? 'rotate-2 cursor-grabbing shadow-xl ring-2 ring-brand-500/40' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{task.orderId}</p>
          <p className="truncate text-xs text-slate-500">{task.customer?.name ?? '—'}</p>
        </div>
        <PriorityBadge priority={task.priority} />
      </div>

      <p className="mt-2 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
        {RULE_LABELS[task.ruleType] ?? task.ruleType}
      </p>
      <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{task.reason}</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          {task.status === 'RESOLVED' ? (
            <span className="text-slate-500">{formatCurrency(task.orderValue)}</span>
          ) : task.isOverdue ? (
            <OverdueBadge />
          ) : (
            <span className="flex items-center gap-1 text-slate-500">
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatDeadline(task.deadline)}
            </span>
          )}
        </div>
        {showAssignee && (
          <span
            title={task.assignedTo?.name ?? 'Unassigned'}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
              task.assignedTo ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {task.assignedTo ? initials(task.assignedTo.name) : '?'}
          </span>
        )}
      </div>
    </div>
  );
}
