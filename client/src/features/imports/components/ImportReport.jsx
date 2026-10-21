import { useMemo, useState } from 'react';
import { Card } from '../../../components/common/PageHeader';
import DataTable from '../../../components/common/DataTable';
import StatCard from '../../../components/common/StatCard';
import { Badge } from '../../../components/common/Badges';
import { EmptyState } from '../../../components/common/States';
import { RULE_LABELS } from '../../../utils/constants';
import { formatDateTime, formatNumber } from '../../../utils/format';

const OUTCOME = {
  IMPORTED: { tone: 'green', label: 'Imported' },
  NEEDS_CORRECTION: { tone: 'amber', label: 'Needs correction' },
  REJECTED: { tone: 'red', label: 'Rejected' },
  SKIPPED_DUPLICATE: { tone: 'gray', label: 'Skipped duplicate' },
};

const ISSUE_COLUMNS = [
  { key: 'row', header: 'Row', className: 'tabular-nums' },
  { key: 'orderId', header: 'Order ID', render: (i) => i.orderId ?? '—' },
  { key: 'field', header: 'Field', render: (i) => i.field ?? '—' },
  {
    key: 'severity',
    header: 'Severity',
    render: (i) => (
      <Badge tone={i.severity === 'ERROR' ? 'red' : 'amber'}>
        {i.severity === 'ERROR' ? 'Error' : 'Warning'}
      </Badge>
    ),
  },
  { key: 'message', header: 'Problem', className: 'min-w-72' },
  {
    key: 'outcome',
    header: 'Result',
    render: (i) => (
      <Badge tone={OUTCOME[i.outcome]?.tone}>{OUTCOME[i.outcome]?.label ?? i.outcome}</Badge>
    ),
  },
];

/** The row-by-row result of one import: what was stored, what needs fixing, and the tasks it produced. */
export default function ImportReport({ report }) {
  const [severity, setSeverity] = useState('');
  const issues = useMemo(
    () => (severity ? report.rowIssues.filter((i) => i.severity === severity) : report.rowIssues),
    [report.rowIssues, severity],
  );
  const s = report.summary ?? {};
  const t = report.taskSummary;

  return (
    <div className="space-y-5">
      <Card
        title={`Import report · ${report.originalName}`}
        actions={
          <span className="text-sm text-slate-500">
            {formatDateTime(report.createdAt)} · by {report.uploadedBy?.name ?? 'you'}
          </span>
        }
        bodyClassName="p-4"
      >
        {report.status === 'FAILED' ? (
          <p className="text-sm text-red-700">This file was rejected: {report.failureReason}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            <StatCard label="Rows read" value={s.totalRows} />
            <StatCard label="New orders" value={s.created} accent="brand" />
            <StatCard label="Updated" value={s.updated} />
            <StatCard label="Unchanged" value={s.unchanged} hint="already up to date" />
            <StatCard label="Needs correction" value={s.needsCorrection} accent="warning" />
            <StatCard label="Rejected rows" value={s.rejected} accent="danger" />
            <StatCard label="Duplicates skipped" value={s.duplicatesSkipped} />
            <StatCard label="Rows with warnings" value={s.warnings} />
          </div>
        )}
        {t && (
          <div className="mt-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-slate-700">
            <p>
              <span className="font-medium">Rule engine:</span> {formatNumber(t.created)} new tasks,{' '}
              {formatNumber(t.reopened)} reopened, {formatNumber(t.autoResolved)} auto-resolved,{' '}
              {formatNumber(t.unchanged)} unchanged ({formatNumber(t.evaluatedOrders)} orders
              checked).
            </p>
            {t.createdByRule && Object.keys(t.createdByRule).length > 0 && (
              <p className="mt-1 text-slate-600">
                {Object.entries(t.createdByRule)
                  .map(([rule, n]) => `${RULE_LABELS[rule] ?? rule}: ${n}`)
                  .join(' · ')}
              </p>
            )}
          </div>
        )}
        {report.ruleEvaluationError && (
          <p className="mt-3 text-sm text-red-700">{report.ruleEvaluationError}</p>
        )}
      </Card>

      <Card
        title={`Row-by-row issues (${formatNumber(report.rowIssues.length)})`}
        actions={
          <select
            className="input w-auto"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            aria-label="Filter issues by severity"
          >
            <option value="">Errors and warnings</option>
            <option value="ERROR">Errors only</option>
            <option value="WARNING">Warnings only</option>
          </select>
        }
      >
        <DataTable
          columns={ISSUE_COLUMNS}
          rows={issues}
          rowKey={(i) => `${i.row}-${i.code}-${i.field}`}
          status="succeeded"
          empty={<EmptyState title="No issues" message="Every row was valid." />}
        />
        {report.rowIssuesTruncated && (
          <p className="px-4 py-2 text-xs text-slate-500">
            Only the first 5,000 issues are stored.
          </p>
        )}
      </Card>
    </div>
  );
}
