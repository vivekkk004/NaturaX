import { PRIORITY_LABELS, TASK_STATUS_LABELS } from './constants';
import { formatDateTime } from './format';

const statusLabel = (s) => TASK_STATUS_LABELS[s] ?? s;

/** Human-readable "what changed" for an audit entry: "Open → In progress", "Priya → Rahul". */
export function describeChange(entry) {
  const oldV = entry.oldValue ?? {};
  const newV = entry.newValue ?? {};

  switch (entry.action) {
    case 'TASK_CREATED':
      return `${PRIORITY_LABELS[newV.priority] ?? ''} priority, due ${formatDateTime(newV.deadline)}`;
    case 'TASK_ASSIGNED':
    case 'REASSIGNED': {
      const owner = `${oldV.name ?? 'Unassigned'} → ${newV.name ?? 'Unassigned'}`;
      const deadlineChanged = oldV.deadline && newV.deadline && oldV.deadline !== newV.deadline;
      return deadlineChanged
        ? `${owner}; deadline ${formatDateTime(oldV.deadline)} → ${formatDateTime(newV.deadline)}`
        : owner;
    }
    case 'STATUS_CHANGED':
    case 'REOPENED':
    case 'AUTO_RESOLVED':
      return `${statusLabel(oldV.status)} → ${statusLabel(newV.status)}`;
    case 'RULE_UPDATED':
      return Object.keys(newV)
        .map((field) =>
          field === 'params'
            ? Object.keys(newV.params)
                .map((p) => `${p}: ${oldV.params?.[p]} → ${newV.params[p]}`)
                .join(', ')
            : `${field}: ${String(oldV[field])} → ${String(newV[field])}`,
        )
        .join('; ');
    default:
      return '';
  }
}
