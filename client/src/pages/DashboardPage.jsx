import { useEffect, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import PageHeader, { Card } from '../components/common/PageHeader';
import FilterBar from '../components/common/FilterBar';
import StatCard from '../components/common/StatCard';
import DataTable from '../components/common/DataTable';
import { PriorityBadge } from '../components/common/Badges';
import { EmptyState, ErrorState } from '../components/common/States';
import { StackedBarCard } from '../features/dashboard/components/charts';
import {
  fetchDashboard,
  resetDashboardFilters,
  selectDashboard,
  setDashboardFilters,
} from '../features/dashboard/dashboardSlice';
import { selectIsManager } from '../features/auth/authSlice';
import {
  DEFAULT_TASK_FILTERS,
  fetchTaskDetail,
  setTaskFilters,
} from '../features/tasks/tasksSlice';
import { DEFAULT_ORDER_FILTERS, setOrderFilters } from '../features/orders/ordersSlice';
import TaskDetailModal from '../features/tasks/components/TaskDetailModal';
import { buildTaskColumns } from '../features/tasks/taskColumns';
import { useAssignableUsers } from '../hooks/useAssignableUsers';
import { PRIORITY_LABELS, RULE_LABELS, toOptions } from '../utils/constants';
import { formatDateTime, formatNumber } from '../utils/format';

export default function DashboardPage() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const isManager = useSelector(selectIsManager);
  const { filters, data, status, error } = useSelector(selectDashboard);
  const { options: employeeOptions } = useAssignableUsers();

  useEffect(() => {
    dispatch(fetchDashboard());
  }, [dispatch, filters]);

  const fields = useMemo(
    () => [
      { name: 'dateFrom', type: 'date', label: 'Order date from' },
      { name: 'dateTo', type: 'date', label: 'Order date to' },
      {
        name: 'ruleType',
        type: 'select',
        label: 'Exception type',
        options: toOptions(RULE_LABELS),
      },
      ...(isManager
        ? [
            {
              name: 'assignedTo',
              type: 'select',
              label: 'Employee',
              options: [{ value: 'unassigned', label: 'Unassigned' }, ...employeeOptions],
            },
          ]
        : []),
      { name: 'priority', type: 'select', label: 'Priority', options: toOptions(PRIORITY_LABELS) },
    ],
    [isManager, employeeOptions],
  );

  /** Drill-down: open the task list with the dashboard's filters plus the clicked widget's filter. */
  const openTasks = (extra) => {
    const { dateFrom, dateTo, ruleType, assignedTo, priority } = filters;
    dispatch(
      setTaskFilters({
        ...DEFAULT_TASK_FILTERS,
        dateFrom,
        dateTo,
        ruleType,
        assignedTo,
        priority,
        ...extra,
      }),
    );
    navigate('/tasks');
  };
  const openOrders = (extra) => {
    dispatch(
      setOrderFilters({
        ...DEFAULT_ORDER_FILTERS,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        assignedTo: filters.assignedTo,
        ...extra,
      }),
    );
    navigate('/orders');
  };

  const totals = data?.totals;
  const loading = status === 'loading' && !data;
  const categoryData = (data?.byCategory ?? []).map((c) => ({
    name: c.label,
    ruleType: c.ruleType,
    unresolved: c.unresolved,
    resolved: c.total - c.unresolved,
    overdue: c.overdue,
    total: c.total,
  }));
  const employeeData = (data?.byEmployee ?? []).map((e) => ({
    name: e.name,
    employeeId: e.employeeId,
    open: e.open,
    inProgress: e.inProgress,
    overdue: e.overdue,
    highPriority: e.highPriority,
  }));

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={
          isManager
            ? 'Orders that need attention across the team.'
            : 'Your orders and follow-up tasks.'
        }
      />

      <Card className="mb-5" bodyClassName="p-4">
        <FilterBar
          fields={fields}
          values={filters}
          onChange={(change) => dispatch(setDashboardFilters(change))}
          onReset={() => dispatch(resetDashboardFilters())}
        />
      </Card>

      {status === 'failed' && !data ? (
        <Card>
          <ErrorState message={error} onRetry={() => dispatch(fetchDashboard())} />
        </Card>
      ) : (
        <div
          className={`space-y-5 transition-opacity ${status === 'loading' && data ? 'opacity-60' : ''}`}
          aria-busy={status === 'loading'}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Total orders uploaded"
              value={totals?.totalOrders}
              loading={loading}
              onClick={() => openOrders({})}
            />
            <StatCard
              label="Orders requiring attention"
              value={totals?.ordersRequiringAttention}
              accent="brand"
              loading={loading}
              hint="with an unresolved task"
              onClick={() => openTasks({})}
            />
            <StatCard
              label="Open tasks"
              value={totals?.unresolvedTasks}
              loading={loading}
              hint={totals ? `${formatNumber(totals.inProgressTasks)} in progress` : undefined}
              onClick={() => openTasks({})}
            />
            <StatCard
              label="Overdue tasks"
              value={totals?.overdueTasks}
              accent="danger"
              loading={loading}
              hint="past deadline, unresolved"
              onClick={() => openTasks({ overdue: true })}
            />
            <StatCard
              label="High priority"
              value={totals?.highPriorityUnresolved}
              accent="danger"
              loading={loading}
              hint="unresolved"
              onClick={() => openTasks({ priority: 'HIGH' })}
            />
            <StatCard
              label="Needs data correction"
              value={totals?.needsCorrection}
              accent="warning"
              loading={loading}
              hint="not checked by rules"
              onClick={() => openOrders({ dataStatus: 'NEEDS_CORRECTION' })}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <StackedBarCard
              title="Exceptions by category"
              data={categoryData}
              series={[
                { key: 'unresolved', label: 'Unresolved' },
                { key: 'resolved', label: 'Resolved' },
              ]}
              tooltipRows={[
                { key: 'overdue', label: 'Overdue' },
                { key: 'total', label: 'Total' },
              ]}
              emptyMessage="No exceptions match the current filters."
              onBarClick={(d) => openTasks({ ruleType: d.ruleType })}
            />
            <StackedBarCard
              title={isManager ? 'Employee-wise pending tasks' : 'My pending tasks'}
              data={employeeData}
              series={[
                { key: 'open', label: 'Open' },
                { key: 'inProgress', label: 'In progress' },
              ]}
              tooltipRows={[
                { key: 'overdue', label: 'Overdue' },
                { key: 'highPriority', label: 'High priority' },
              ]}
              emptyMessage="Nobody has pending tasks for these filters."
              onBarClick={
                isManager
                  ? (d) => openTasks({ assignedTo: d.employeeId ?? 'unassigned' })
                  : undefined
              }
            />
          </div>

          <Card
            title="High-priority cases requiring immediate action"
            actions={
              <div className="flex items-center gap-3">
                {(data?.byPriority ?? []).map((p) => (
                  <span key={p.priority} className="flex items-center gap-1 text-sm text-slate-600">
                    <PriorityBadge priority={p.priority} /> {formatNumber(p.unresolved)}
                  </span>
                ))}
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => openTasks({ priority: 'HIGH' })}
                >
                  View all
                </button>
              </div>
            }
          >
            <DataTable
              columns={buildTaskColumns({ showAssignee: isManager, compact: true })}
              rows={data?.highPriorityCases ?? []}
              status={loading ? 'loading' : 'succeeded'}
              onRowClick={(t) => dispatch(fetchTaskDetail(t.id))}
              empty={
                <EmptyState title="No high-priority cases" message="Nothing urgent right now." />
              }
            />
          </Card>

          {isManager && data?.lastImport && (
            <p className="text-sm text-slate-500">
              Last import:{' '}
              <span className="font-medium text-slate-700">{data.lastImport.originalName}</span> on{' '}
              {formatDateTime(data.lastImport.createdAt)} ·{' '}
              {formatNumber(data.lastImport.summary?.totalRows)} rows,{' '}
              {formatNumber(data.lastImport.taskSummary?.created ?? 0)} new tasks.
            </p>
          )}
        </div>
      )}
      <TaskDetailModal onChanged={() => dispatch(fetchDashboard())} />
    </>
  );
}
