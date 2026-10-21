import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import PageHeader, { Card } from '../components/common/PageHeader';
import FilterBar from '../components/common/FilterBar';
import DataTable from '../components/common/DataTable';
import Pagination from '../components/common/Pagination';
import { Badge } from '../components/common/Badges';
import { EmptyState } from '../components/common/States';
import {
  fetchAuditLog,
  resetAuditFilters,
  selectAuditQuery,
  selectAuditState,
  setAuditFilters,
  setAuditLimit,
  setAuditPage,
} from '../features/audit/auditSlice';
import { selectIsManager } from '../features/auth/authSlice';
import { AUDIT_ACTION_LABELS, RULE_LABELS, toOptions } from '../utils/constants';
import { formatDateTime } from '../utils/format';
import { describeChange } from '../utils/auditFormat';

const ACTION_TONE = {
  TASK_CREATED: 'blue',
  TASK_ASSIGNED: 'violet',
  REASSIGNED: 'violet',
  STATUS_CHANGED: 'amber',
  REOPENED: 'red',
  AUTO_RESOLVED: 'green',
  RULE_UPDATED: 'gray',
};

const COLUMNS = [
  {
    key: 'createdAt',
    header: 'When',
    render: (e) => <span className="whitespace-nowrap">{formatDateTime(e.createdAt)}</span>,
  },
  {
    key: 'action',
    header: 'Action',
    render: (e) => (
      <Badge tone={ACTION_TONE[e.action]}>{AUDIT_ACTION_LABELS[e.action] ?? e.action}</Badge>
    ),
  },
  {
    key: 'subject',
    header: 'Order / rule',
    render: (e) => (
      <div>
        <p className="font-medium text-slate-900">{e.orderId ?? '—'}</p>
        <p className="text-xs text-slate-500">{RULE_LABELS[e.ruleType] ?? ''}</p>
      </div>
    ),
  },
  { key: 'performedByName', header: 'By' },
  {
    key: 'change',
    header: 'Change (old → new)',
    className: 'min-w-64',
    render: (e) => describeChange(e) || '—',
  },
  {
    key: 'note',
    header: 'Note',
    className: 'min-w-48 text-xs text-slate-500',
    render: (e) => e.note ?? '',
  },
];

export default function AuditPage() {
  const dispatch = useDispatch();
  const isManager = useSelector(selectIsManager);
  const { items, pagination, filters, status, error } = useSelector(selectAuditState);
  const query = useSelector(selectAuditQuery);

  useEffect(() => {
    dispatch(fetchAuditLog());
  }, [dispatch, query]);

  const fields = useMemo(
    () => [
      { name: 'orderId', type: 'search', label: 'Order ID', placeholder: 'e.g. ORD-1042' },
      { name: 'action', type: 'select', label: 'Action', options: toOptions(AUDIT_ACTION_LABELS) },
      { name: 'dateFrom', type: 'date', label: 'From' },
      { name: 'dateTo', type: 'date', label: 'To' },
    ],
    [],
  );

  return (
    <>
      <PageHeader
        title="Audit trail"
        description={
          isManager
            ? 'Every assignment, status change, reassignment and rule change - who, what, when, old → new. Entries can never be edited or deleted.'
            : 'The history of the tasks assigned to you.'
        }
      />
      <Card>
        <div className="border-b border-slate-200 p-4">
          <FilterBar
            fields={fields}
            values={filters}
            onChange={(c) => dispatch(setAuditFilters(c))}
            onReset={() => dispatch(resetAuditFilters())}
          />
        </div>
        <DataTable
          columns={COLUMNS}
          rows={items}
          status={status}
          error={error}
          onRetry={() => dispatch(fetchAuditLog())}
          empty={
            <EmptyState
              title="No audit entries"
              message="Entries appear when tasks are created, assigned or updated."
            />
          }
        />
        <Pagination
          pagination={pagination}
          onPageChange={(p) => dispatch(setAuditPage(p))}
          onLimitChange={(l) => dispatch(setAuditLimit(l))}
        />
      </Card>
    </>
  );
}
