import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Modal from '../../../components/common/Modal';
import Loader from '../../../components/common/Loader';
import { ErrorBanner, ErrorState } from '../../../components/common/States';
import { Badge, OverdueBadge, PriorityBadge, StatusBadge } from '../../../components/common/Badges';
import { selectIsManager } from '../../auth/authSlice';
import {
  assignTask,
  closeTaskDetail,
  selectTaskDetail,
  selectTaskMutation,
  updateTaskStatus,
} from '../tasksSlice';
import { useAssignableUsers } from '../../../hooks/useAssignableUsers';
import {
  AUDIT_ACTION_LABELS,
  ORDER_STATUS_LABELS,
  PAYMENT_LABELS,
  RULE_LABELS,
} from '../../../utils/constants';
import { formatCurrency, formatDateTime, formatDeadline } from '../../../utils/format';
import { describeChange } from '../../../utils/auditFormat';

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-800">{children ?? '—'}</dd>
    </div>
  );
}

/** Buttons for the status changes this user may make (mirrors the API's transition table). */
function StatusActions({ task, isManager, busy, onChange }) {
  const [note, setNote] = useState('');
  const resolved = task.status === 'RESOLVED';

  if (resolved) {
    return isManager ? (
      <button
        type="button"
        className="btn-secondary"
        disabled={busy}
        onClick={() => onChange('OPEN')}
      >
        Reopen task
      </button>
    ) : (
      <p className="text-sm text-slate-500">Resolved. Only a manager can reopen it.</p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="resolution-note" className="label">
          Note{' '}
          <span className="font-normal text-slate-400">
            (what was done - saved in the audit trail)
          </span>
        </label>
        <textarea
          id="resolution-note"
          rows={2}
          maxLength={1000}
          className="input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {task.status === 'OPEN' && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => onChange('IN_PROGRESS', note)}
          >
            Start working
          </button>
        )}
        {task.status === 'IN_PROGRESS' && (
          <button
            type="button"
            className="btn-secondary"
            disabled={busy}
            onClick={() => onChange('OPEN', note)}
          >
            Move back to open
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={busy}
          onClick={() => onChange('RESOLVED', note)}
        >
          Mark resolved
        </button>
      </div>
    </div>
  );
}

/** Manager-only reassignment; explains what happens to an overdue task's deadline. */
function ReassignForm({ task, busy, onAssign }) {
  const { options } = useAssignableUsers();
  const [assignedTo, setAssignedTo] = useState('');
  const [deadline, setDeadline] = useState('');
  const [note, setNote] = useState('');
  const choices = options.filter((o) => o.value !== task.assignedTo?.id);

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onAssign({ assignedTo, deadline: deadline || undefined, note: note || undefined });
      }}
    >
      {task.isOverdue && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This task is overdue. If you leave the deadline empty, the new owner gets a fresh deadline
          based on the rule&apos;s time limit. The SLA breach stays on record.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="assignee" className="label">
            Assign to
          </label>
          <select
            id="assignee"
            className="input"
            required
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            <option value="">Select an employee…</option>
            {choices.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="new-deadline" className="label">
            New deadline <span className="font-normal text-slate-400">(optional, IST)</span>
          </label>
          <input
            id="new-deadline"
            type="datetime-local"
            className="input"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label htmlFor="assign-note" className="label">
          Reason <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          id="assign-note"
          className="input"
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Priya on leave"
        />
      </div>
      <button type="submit" className="btn-primary" disabled={busy || !assignedTo}>
        {task.assignedTo ? 'Reassign task' : 'Assign task'}
      </button>
    </form>
  );
}

function History({ entries }) {
  if (!entries.length) return <p className="text-sm text-slate-500">No history yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-slate-200 pl-4">
      {entries.map((entry) => (
        <li key={entry.id} className="relative">
          <span
            className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400"
            aria-hidden
          />
          <p className="text-sm">
            <span className="font-medium text-slate-800">
              {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
            </span>
            <span className="text-slate-500">
              {' '}
              · {entry.performedByName} · {formatDateTime(entry.createdAt)}
            </span>
          </p>
          {describeChange(entry) && (
            <p className="text-sm text-slate-700">{describeChange(entry)}</p>
          )}
          {entry.note && <p className="text-xs text-slate-500">{entry.note}</p>}
        </li>
      ))}
    </ol>
  );
}

/** Full task view: details, allowed actions and the audit history. Opened by dispatching fetchTaskDetail(id). */
export default function TaskDetailModal({ onChanged }) {
  const dispatch = useDispatch();
  const isManager = useSelector(selectIsManager);
  const { task, history, status, error } = useSelector(selectTaskDetail);
  const mutation = useSelector(selectTaskMutation);
  const open = status !== 'idle';
  const busy = mutation.status === 'loading';

  const close = () => dispatch(closeTaskDetail());

  const changeStatus = async (newStatus, note) => {
    const result = await dispatch(updateTaskStatus({ id: task.id, status: newStatus, note }));
    if (updateTaskStatus.fulfilled.match(result)) {
      toast.success('Status updated');
      onChanged?.();
    }
  };
  const reassign = async (body) => {
    const result = await dispatch(assignTask({ id: task.id, ...body }));
    if (assignTask.fulfilled.match(result)) {
      toast.success(`Assigned to ${result.payload.task.assignedTo?.name}`);
      onChanged?.();
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={task ? `${task.orderId} · ${RULE_LABELS[task.ruleType]}` : 'Task'}
    >
      {status === 'loading' && <Loader />}
      {status === 'failed' && <ErrorState message={error} />}
      {status === 'succeeded' && task && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge priority={task.priority} />
            <StatusBadge status={task.status} />
            {task.isOverdue && <OverdueBadge />}
            {task.slaBreached && <Badge tone="gray">SLA breached</Badge>}
            {task.reopenCount > 0 && <Badge tone="gray">Reopened ×{task.reopenCount}</Badge>}
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-800">{task.reason}</p>
            <p className="mt-2 text-sm text-slate-600">
              <span className="font-medium text-slate-700">Action required: </span>
              {task.actionRequired}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Customer">{task.customer?.name}</Field>
            <Field label="Phone">
              {task.customer?.phone && (
                <a
                  className="text-brand-700 hover:underline"
                  href={`tel:+91${task.customer.phone}`}
                >
                  {task.customer.phone}
                </a>
              )}
            </Field>
            <Field label="Order value">{formatCurrency(task.orderValue)}</Field>
            <Field label="Payment">{PAYMENT_LABELS[task.paymentType]}</Field>
            <Field label="Order status">
              {ORDER_STATUS_LABELS[task.orderStatus] ?? task.orderStatus}
            </Field>
            <Field label="Order date">{formatDateTime(task.orderDate)}</Field>
            <Field label="Assigned to">
              {task.assignedTo
                ? `${task.assignedTo.name} (${task.assignedTo.employeeCode})`
                : 'Unassigned'}
            </Field>
            <Field label="Deadline">
              {formatDateTime(task.deadline)}
              {task.status !== 'RESOLVED' && (
                <span
                  className={`block text-xs ${task.isOverdue ? 'text-red-700' : 'text-slate-500'}`}
                >
                  {formatDeadline(task.deadline)}
                </span>
              )}
            </Field>
            <Field label="Detected">{formatDateTime(task.detectedAt)}</Field>
            {task.status === 'RESOLVED' && (
              <>
                <Field label="Resolved">{formatDateTime(task.resolvedAt)}</Field>
                <Field label="Resolved by">
                  {task.resolvedBy?.name ?? 'System (auto-resolved)'}
                </Field>
                <Field label="Resolution note">{task.resolutionNote}</Field>
              </>
            )}
          </dl>

          <ErrorBanner message={mutation.error} />

          <section>
            <h3 className="mb-2 font-semibold text-slate-800">Update status</h3>
            <StatusActions
              key={task.status}
              task={task}
              isManager={isManager}
              busy={busy}
              onChange={changeStatus}
            />
          </section>

          {isManager && task.status !== 'RESOLVED' && (
            <section>
              <h3 className="mb-2 font-semibold text-slate-800">
                {task.assignedTo ? 'Reassign' : 'Assign'}
              </h3>
              <ReassignForm
                key={task.assignedTo?.id ?? 'none'}
                task={task}
                busy={busy}
                onAssign={reassign}
              />
            </section>
          )}

          <section>
            <h3 className="mb-3 font-semibold text-slate-800">History (audit trail)</h3>
            <History entries={history} />
          </section>
        </div>
      )}
    </Modal>
  );
}
