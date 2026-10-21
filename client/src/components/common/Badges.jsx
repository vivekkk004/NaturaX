import {
  DATA_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  PRIORITY_LABELS,
  TASK_STATUS_LABELS,
} from '../../utils/constants';

const TONES = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-800 ring-blue-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  green: 'bg-green-50 text-green-800 ring-green-200',
  red: 'bg-red-50 text-red-800 ring-red-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};

/** Pill label. Meaning is always in the text (never colour alone - accessibility). */
export function Badge({ tone = 'gray', children, icon }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

const TASK_STATUS_TONE = { OPEN: 'blue', IN_PROGRESS: 'amber', RESOLVED: 'green' };
const ORDER_STATUS_TONE = {
  UNCONFIRMED: 'amber',
  CONFIRMED: 'blue',
  DISPATCHED: 'violet',
  DELIVERED: 'green',
  DELIVERY_FAILED: 'red',
  CANCELLED: 'gray',
};

/** Status of a task, an order or an order's data quality. */
export function StatusBadge({ status, kind = 'task' }) {
  if (!status) return <Badge>Unknown</Badge>;
  if (kind === 'order')
    return <Badge tone={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABELS[status] ?? status}</Badge>;
  if (kind === 'data') {
    return status === 'VALID' ? (
      <Badge tone="green">{DATA_STATUS_LABELS.VALID}</Badge>
    ) : (
      <Badge tone="red" icon="!">
        {DATA_STATUS_LABELS.NEEDS_CORRECTION}
      </Badge>
    );
  }
  return <Badge tone={TASK_STATUS_TONE[status]}>{TASK_STATUS_LABELS[status] ?? status}</Badge>;
}

const PRIORITY_STYLE = {
  HIGH: { tone: 'red', icon: '▲' },
  MEDIUM: { tone: 'amber', icon: '■' },
  LOW: { tone: 'gray', icon: '▼' },
};

/** Priority with a shape icon so it is readable without colour. */
export function PriorityBadge({ priority }) {
  const style = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.LOW;
  return (
    <Badge tone={style.tone} icon={style.icon}>
      {PRIORITY_LABELS[priority] ?? priority}
    </Badge>
  );
}

export function OverdueBadge() {
  return (
    <Badge tone="red" icon="⏰">
      Overdue
    </Badge>
  );
}
