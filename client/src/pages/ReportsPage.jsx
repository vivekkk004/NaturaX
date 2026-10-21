import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import PageHeader, { Card } from '../components/common/PageHeader';
import DataTable from '../components/common/DataTable';
import StatCard from '../components/common/StatCard';
import { EmptyState, ErrorBanner, ErrorState } from '../components/common/States';
import Loader from '../components/common/Loader';
import { buildTaskColumns } from '../features/tasks/taskColumns';
import {
  downloadReportCsv,
  fetchDailyReport,
  selectReports,
  setReportDate,
} from '../features/reports/reportsSlice';
import { REPORT_SECTION_LABELS } from '../utils/constants';
import { formatDateTime, formatNumber } from '../utils/format';

const EMPLOYEE_COLUMNS = [
  {
    key: 'name',
    header: 'Employee',
    render: (e) => (e.employeeCode ? `${e.name} (${e.employeeCode})` : e.name),
  },
  { key: 'open', header: 'Open', className: 'text-right' },
  { key: 'inProgress', header: 'In progress', className: 'text-right' },
  { key: 'total', header: 'Pending', className: 'text-right font-medium' },
  { key: 'overdue', header: 'Overdue', className: 'text-right' },
  { key: 'highPriority', header: 'High priority', className: 'text-right' },
];

export default function ReportsPage() {
  const dispatch = useDispatch();
  const { date, data, status, error, download } = useSelector(selectReports);
  const [tab, setTab] = useState('new');

  useEffect(() => {
    dispatch(fetchDailyReport());
  }, [dispatch, date]);

  const downloadCsv = async (section) => {
    const result = await dispatch(downloadReportCsv(section));
    if (downloadReportCsv.fulfilled.match(result)) toast.success(`Downloaded ${result.payload}`);
  };

  const section = data?.sections.find((s) => s.key === tab);
  const busy = download.status === 'loading';

  return (
    <>
      <PageHeader
        title="Daily exception report"
        description='"New" lists exceptions first detected on the chosen day; the other sections show the current state.'
        actions={
          <>
            <input
              type="date"
              className="input w-auto"
              value={date}
              onChange={(e) => e.target.value && dispatch(setReportDate(e.target.value))}
              aria-label="Report date"
            />
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => downloadCsv('all')}
            >
              {busy && download.section === 'all' ? 'Preparing…' : 'Download full report (CSV)'}
            </button>
          </>
        }
      />
      <ErrorBanner message={download.error} />

      {status === 'loading' && !data && <Loader />}
      {status === 'failed' && (
        <ErrorState message={error} onRetry={() => dispatch(fetchDailyReport())} />
      )}
      {data && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.sections.map((s) => (
              <StatCard
                key={s.key}
                label={s.label}
                value={s.count}
                accent={s.key === 'overdue' || s.key === 'high-priority' ? 'danger' : 'neutral'}
                onClick={() => setTab(s.key)}
              />
            ))}
          </div>

          <Card
            title={
              <div className="flex flex-wrap gap-1" role="tablist" aria-label="Report sections">
                {data.sections.map((s) => (
                  <button
                    key={s.key}
                    role="tab"
                    aria-selected={tab === s.key}
                    type="button"
                    onClick={() => setTab(s.key)}
                    className={`rounded-lg px-3 py-1.5 text-sm ${tab === s.key ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {s.label} ({formatNumber(s.count)})
                  </button>
                ))}
              </div>
            }
            actions={
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => downloadCsv(tab)}
              >
                Download this section
              </button>
            }
          >
            <DataTable
              columns={buildTaskColumns({ compact: true })}
              rows={section?.rows ?? []}
              status="succeeded"
              empty={<EmptyState title={`No ${REPORT_SECTION_LABELS[tab]?.toLowerCase()} items`} />}
            />
            {section && section.count > data.previewLimit && (
              <p className="px-4 py-2 text-xs text-slate-500">
                Showing the first {data.previewLimit} of {formatNumber(section.count)} - download
                the CSV for everything.
              </p>
            )}
          </Card>

          <Card
            title="Employee-wise pending actions"
            actions={
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => downloadCsv('employee-pending')}
              >
                Download
              </button>
            }
          >
            <DataTable
              columns={EMPLOYEE_COLUMNS}
              rows={data.employeePending}
              rowKey={(e) => e.employeeId ?? 'unassigned'}
              status="succeeded"
            />
          </Card>
          <p className="text-xs text-slate-500">Generated {formatDateTime(data.generatedAt)}</p>
        </div>
      )}
    </>
  );
}
